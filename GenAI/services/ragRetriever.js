// GenAI/services/ragRetriever.js — hybrid retriever for map generation
//
// Vì sao cần file này:
//   buildRAGContext cũ chỉ dùng BM25 (query = TÊN CHƯƠNG) → recall kém khi
//   tài liệu diễn đạt khác tên chương; embedding đã embed sẵn trong DB nhưng
//   KHÔNG được dùng ở đường sinh map. File này biến retrieval thành HYBRID:
//
//   [R1] Query enrichment  — query = tên chương + tên các mục con (không chỉ
//        mỗi tên chương) → tín hiệu BM25 + vector dày hơn.
//   [R2] Dense cosine      — tận dụng embedding nomic 768d đã có trong
//        savedChunks (controller đã select sẵn). Embed query 1 lần/batch.
//   [R3] Hybrid score      — chuẩn hoá min-max rồi trộn 0.5·BM25 + 0.5·cosine.
//        Nếu embed lỗi → tự suy biến về BM25 thuần (giữ nguyên hành vi cũ).
//   [R4] Page fallback bậc thang — TOC sai trang (vd synthetic TOC bịa
//        "Giới thiệu công ty") không còn làm đói pool: strict → ±3 →
//        section-title → toàn bộ chunk, để dense cứu relevance.
//   [R5] MMR đa dạng        — relevance = hybrid, vẫn chống trùng nội dung.
//
// Drop-in: thay 1 dòng gọi trong stream.generator.js (xem cuối file).

import { embedBatch } from "./embedder.js";

const CAP_CH = 1500; // ký tự / chương (giữ nguyên ngân sách token cũ)
const CAP_TOT = 7000; // tổng ký tự gửi LLM (giữ nguyên)
const PER_CHAPTER_K = 5; // số chunk lấy mỗi chương
const ALPHA = 0.5; // trọng số dense vs bm25 (0.5 = cân bằng)

// ─── helpers ─────────────────────────────────────────────────────────────────

function cleanChunkText(text) {
  return (text || "")
    .replace(/^\[[^\]]{5,60}\]\s*$/gm, "")
    .replace(/\[(?![pP]\.)([^\]]{5,60})\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bm25(q, text) {
  const qw = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (!qw.length) return 0;
  const dt = (text || "").toLowerCase().split(/\s+/);
  const dl = dt.length || 1,
    freq = {};
  dt.forEach((w) => {
    freq[w] = (freq[w] || 0) + 1;
  });
  let s = 0;
  for (const w of qw) {
    const f = freq[w] || 0;
    if (!f) continue;
    s +=
      (Math.log(1 + 1 / (f + 0.5)) * (f * 2.2)) /
      (f + 1.2 * (0.25 + (0.75 * dl) / 160));
  }
  return s / qw.length;
}

function cosineSim(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) + 1e-10);
}

// chuẩn hoá min-max về [0,1] trong phạm vi pool; tất cả bằng nhau → 0.5
function minmax(vals) {
  const lo = Math.min(...vals),
    hi = Math.max(...vals);
  if (hi - lo < 1e-9) return vals.map(() => 0.5);
  return vals.map((v) => (v - lo) / (hi - lo));
}

// [R1] query = tên chương + tên các mục con trực tiếp (1 cấp), cắt gọn
function enrichQuery(chapter) {
  const parts = [chapter.title || ""];
  for (const ch of chapter.children || []) {
    if (ch.title) parts.push(ch.title);
    for (const g of ch.children || []) if (g.title) parts.push(g.title);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 320);
}

// [R4] pool theo bậc thang: strict trang → ±3 → theo sectionTitle → toàn bộ
function buildPool(chapter, allChunks) {
  const { pageStart, pageEnd, title } = chapter;
  let pool = [];

  if (pageStart > 0 && pageEnd != null) {
    pool = allChunks.filter(
      (c) =>
        c.pageNum != null &&
        c.pageNum >= pageStart &&
        c.pageNum <= pageEnd + 1,
    );
    if (pool.length < 2) {
      pool = allChunks.filter(
        (c) =>
          c.pageNum != null &&
          c.pageNum >= pageStart - 3 &&
          c.pageNum <= pageEnd + 3,
      );
    }
  }

  const norm = (s) => (s || "").toLowerCase();
  const bySection = allChunks.filter(
    (c) =>
      c.sectionTitle &&
      norm(c.sectionTitle).includes(norm(title).slice(0, 15)),
  );
  if (bySection.length) {
    const merged = new Map();
    for (const c of [...pool, ...bySection])
      merged.set(c.chunkIndex ?? c.text?.slice(0, 24), c);
    pool = [...merged.values()];
  }

  // Vẫn ít hơn 2 (TOC sai trang nặng) → mở toàn bộ, để dense cứu relevance
  if (pool.length < 2) pool = allChunks;
  return pool;
}

// [R5] MMR với relevance = hybrid score đã tính sẵn ở c._rel
function mmrSelect(chunks, k) {
  if (chunks.length <= k) return chunks;
  const result = [],
    rem = [...chunks];
  let fi = 0;
  for (let i = 1; i < rem.length; i++)
    if ((rem[i]._rel || 0) > (rem[fi]._rel || 0)) fi = i;
  result.push(...rem.splice(fi, 1));
  while (result.length < k && rem.length) {
    let bI = 0,
      bS = -Infinity;
    for (let i = 0; i < rem.length; i++) {
      const cw = new Set(
        (rem[i].text || "")
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3),
      );
      const maxOv = result.reduce((mx, s) => {
        const sw = new Set(
          (s.text || "")
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3),
        );
        let ov = 0;
        for (const w of cw) if (sw.has(w)) ov++;
        return Math.max(mx, ov / Math.max(cw.size, sw.size, 1));
      }, 0);
      const sc = (rem[i]._rel || 0) * 0.6 + (1 - maxOv) * 0.4;
      if (sc > bS) {
        bS = sc;
        bI = i;
      }
    }
    result.push(...rem.splice(bI, 1));
  }
  return result;
}

// ─── main: hybrid RAG context ────────────────────────────────────────────────
//
// Chữ ký GIỮ NGUYÊN đầu ra (string) như buildRAGContext cũ → downstream
// (buildDetailPrompt, grounding) không phải đổi gì. Chỉ khác: hàm là async.
export async function buildRAGContextHybrid(chapters, allChunks) {
  // Không có cấu trúc chương: giữ hành vi cũ (MMR theo độ dài) — nhưng thử
  // dùng dense nếu có embedding để gom đoạn "trọng tâm" hơn là chỉ dài nhất.
  if (!chapters?.length) {
    const ranked = (allChunks || []).map((c) => ({
      ...c,
      _rel: (c.text || "").length,
    }));
    return mmrSelect(ranked, 14)
      .map(
        (c) =>
          cleanChunkText(c.text).slice(0, 350) +
          (c.pageNum ? ` (p.${c.pageNum})` : ""),
      )
      .join("\n")
      .slice(0, CAP_TOT);
  }

  // [R1] dựng query làm giàu cho từng chương
  const queries = chapters.map(enrichQuery);

  // [R2] embed toàn bộ query trong 1 batch; lỗi → suy biến BM25 thuần
  let queryVecs = null;
  const anyEmbedding = (allChunks || []).some(
    (c) => Array.isArray(c.embedding) && c.embedding.length > 0,
  );
  if (anyEmbedding) {
    try {
      queryVecs = await embedBatch(queries);
      if (!Array.isArray(queryVecs) || queryVecs.length !== queries.length)
        queryVecs = null;
    } catch (err) {
      console.warn(
        "[RAG-hybrid] query embed failed → BM25-only:",
        err.message,
      );
      queryVecs = null;
    }
  }
  const denseOn = !!queryVecs;
  console.log(
    `[RAG-hybrid] chapters=${chapters.length} dense=${denseOn ? "on" : "off"} (${
      anyEmbedding ? "embeddings present" : "no embeddings in chunks"
    })`,
  );

  const blocks = [];
  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const q = queries[ci];
    const qVec = denseOn ? queryVecs[ci] : null;

    const pool = buildPool(ch, allChunks);
    if (!pool.length) continue;

    // chấm 2 điểm thô
    const bmRaw = pool.map((c) => bm25(q, c.text || ""));
    const cosRaw = pool.map((c) =>
      qVec ? cosineSim(qVec, c.embedding || []) : 0,
    );

    // [R3] chuẩn hoá trong pool rồi trộn
    const bmN = minmax(bmRaw);
    const cosN = denseOn ? minmax(cosRaw) : bmN.map(() => 0);
    const scored = pool.map((c, i) => ({
      ...c,
      _rel: denseOn ? ALPHA * cosN[i] + (1 - ALPHA) * bmN[i] : bmN[i],
    }));

    // có tín hiệu thì xếp hạng + MMR; không thì lấy đầu pool
    const maxRel = Math.max(...scored.map((s) => s._rel), 0);
    const selected =
      maxRel > 0
        ? mmrSelect(
            scored.sort((a, b) => b._rel - a._rel),
            PER_CHAPTER_K,
          )
        : pool.slice(0, 4);

    const excerpt = selected
      .map((c) => cleanChunkText(c.text).slice(0, 350))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CAP_CH);

    const pageTag = ch.pageStart
      ? ` (p.${ch.pageStart}${
          ch.pageEnd && ch.pageEnd < 9999 ? "-" + ch.pageEnd : ""
        })`
      : "";
    if (excerpt.length > 30)
      blocks.push(`[${ch.title}${pageTag}]: ${excerpt}`);
  }

  return blocks.join("\n").slice(0, CAP_TOT);
}
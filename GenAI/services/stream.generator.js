import { detectLang } from "../utils/prompts.js";
import { extractTOCBest } from "../utils/tocExtractor.js";
import { buildRAGContextHybrid } from "./ragRetriever.js";
import { streamLLM } from "../utils/llm.js";
const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";
const GEN_MODEL = process.env.OLLAMA_GEN_MODEL || "qwen3:8b";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#a855f7",
  "#fb923c",
];
let _seq = 0;
const nid = (p = "n") => `${p}-${Date.now()}-${++_seq}`;
const normKey = (s) => (s || "").toLowerCase().replace(/\s+/g, "").slice(0, 28);
const mkNode = ({
  id,
  parentId,
  label,
  description = "",
  pdfSource = null,
  level,
  side,
  color,
  isRoot = false,
  x = 0,
  y = 0,
}) => ({
  type: "node",
  node: {
    id,
    parentId,
    label,
    description,
    level,
    side,
    color,
    isRoot,
    autoAlign: true,
    position: { x, y },
    ...(pdfSource ? { pdfSource } : {}),
  },
});

const mkEdge = ({ parentId, childId, color, side }) => ({
  type: "edge",
  edge: {
    id: `e-${parentId}-${childId}`,
    source: parentId,
    target: childId,
    sourceHandle: side === "right" ? "source-right" : "source-left",
    targetHandle: side === "right" ? "target-left" : "target-right",
    color,
    width: 2,
    style: "solid",
    isParentChild: true,
  },
});

function cleanHeadingLine(text) {
  if (!text) return "";
  const t = text.trim();
  if (t.length <= 90) return t;
  const m = t.match(/^(.{8,90}?[a-zà-ỹ])\s+[A-ZÀ-Ỹ]/);
  return m ? m[1].trim() : t.slice(0, 90).trim();
}

function cleanLLMLabel(text) {
  if (!text) return "";
  let t = text.trim().replace(/\s+/g, " ");
  if (t.length <= 120) return t;
  // Trim on a word boundary near 120 chars, never mid-word.
  const cut = t.slice(0, 120);
  const sp = cut.lastIndexOf(" ");
  return (sp > 60 ? cut.slice(0, sp) : cut).trim();
}

function normForLookup(t) {
  return (t || "")
    .toLowerCase()
    .replace(/^(#{1,6}\s*)+/, "")
    .replace(/^(chương|chapter|phần|part)\s+\w+[\s:.]+/i, "")
    .replace(/^[ivxlIVXL]+[\.\s:]+/, "")
    .replace(/^[\d]+([\.\d]*)\s*/, "")
    .replace(/[:\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

function buildPageLookup(chapters) {
  const map = new Map();
  const walk = (nodes) => {
    for (const ch of nodes || []) {
      const k = (ch.title || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (k) map.set(k, { pageStart: ch.pageStart, pageEnd: ch.pageEnd });
      walk(ch.children || []);
    }
  };
  walk(chapters);
  return map;
}

function getPdfSource(title, pageLookup) {
  const v = pageLookup.get(title.toLowerCase().replace(/\s+/g, " ").trim());
  return v ? { pageStart: v.pageStart, pageEnd: v.pageEnd } : null;
}

function extractPageRef(desc) {
  const m = (desc || "").match(/[\[\(]p\.(\d+)(?:-(\d+))?[\]\)]/);
  if (!m) return null;
  return {
    pageStart: parseInt(m[1]),
    pageEnd: m[2] ? parseInt(m[2]) : parseInt(m[1]),
  };
}

function cleanChunkText(text) {
  return (text || "")
    .replace(/^\[[^\]]{5,60}\]\s*$/gm, "") 
    .replace(/\[(?![pP]\.)([^\]]{5,60})\]/g, "") 
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanDescription(desc) {
  return (desc || "")
    .replace(/\[(?![pP]\.)([^\]]{5,60})\]/g, "")
    .replace(/Dựa vào\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function detectMarker(line) {
  const t = line.trim();
  let m;
  if (
    (m = t.match(/^(chương|phần|chapter|part)\s*(\d+|[IVXLC]+)[:.\s]*(.{2,})/i))
  )
    return { type: "kw-" + m[1].toLowerCase(), title: m[3] };
  if ((m = t.match(/^(\d+(?:\.\d+){2,})[.\s)]*([A-Za-zÀ-ỹ].{1,})/))) // 1.2.3+
    return { type: "dotted-" + m[1].split(".").length, title: m[2] };
  if ((m = t.match(/^(\d+\.\d+)[.\s)]*([A-Za-zÀ-ỹ].{1,})/))) // 1.2
    return { type: "dotted-2", title: m[2] };
  if ((m = t.match(/^([IVXLC]{1,5})[.)]\s+(.{2,})/))) // I. II. (upper roman)
    return { type: "roman-upper", title: m[2] };
  if ((m = t.match(/^([ivxlc]{1,5})[.)]\s+(.{2,})/))) // i. ii. (lower roman)
    return { type: "roman-lower", title: m[2] };
  if ((m = t.match(/^([A-Z])[.)]\s+(.{2,})/))) // A. B.
    return { type: "alpha-upper", title: m[2] };
  if ((m = t.match(/^([a-z])[.)]\s+(.{2,})/))) // a. b.
    return { type: "alpha-lower", title: m[2] };
  if ((m = t.match(/^(\d{1,3})[.)]\s+(.{2,})/))) // 1. 2.
    return { type: "num", title: m[2] };
  if ((m = t.match(/^[-•*‣▪]\s+(.{2,})/))) // - • * bullets
    return { type: "bullet", title: m[1] };
  return null;
}

function extractOutlineFromBody(pagesData) {
  const typeRank = new Map(); 
  const stack = []; 
  const roots = [];

  const attach = (level, title, pageNum) => {
    const node = {
      title,
      level,
      pageStart: pageNum,
      pageEnd: 9999,
      children: [],
    };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (!stack.length) roots.push(node);
    else stack[stack.length - 1].node.children.push(node);
    return node;
  };

  for (const page of pagesData) {
    const lines =
      page.lines?.map((l) => l.text) ?? (page.text || "").split("\n");
    for (const raw of lines) {
      const t = (raw || "").trim();
      if (!t || t.length < 3 || t.length > 140) continue;
      if (/^\(\d+\)/.test(t) || /^\[\d+\]/.test(t)) continue; // refs / citations
      const mk = detectMarker(t);
      if (!mk) continue;
      let title = mk.title.replace(/\.{2,}\s*\d*\s*$/, "").trim();
      if (title.length < 2) continue;
      title = title.slice(0, 120);

      let level;
      if (typeRank.has(mk.type)) {
        level = typeRank.get(mk.type); // known type → back to its level
      } else {
        level = (stack.length ? stack[stack.length - 1].level : 0) + 1;
        typeRank.set(mk.type, level); // new type → child of deepest open
      }
      if (mk.type.startsWith("dotted-")) {
        const d = parseInt(mk.type.split("-")[1]);
        level = Math.max(level, d); // dotted carries its own absolute depth
        typeRank.set(mk.type, level);
      }
      const node = attach(level, title, page.pageNum);
      stack.push({ node, type: mk.type, level });
    }
  }

  const count = (ns) => ns.reduce((s, n) => s + 1 + count(n.children), 0);
  const depth = (ns, d = 1) =>
    ns.reduce(
      (mx, n) => Math.max(mx, n.children.length ? depth(n.children, d + 1) : d),
      1,
    );
  return roots.length >= 1 && count(roots) >= 5 && depth(roots) >= 2
    ? roots
    : null;
}

function cleanNodeLabel(title) {
  return (title || "")
    .replace(/\.{2,}[\s\d]*$/, "") 
    .replace(/\s{4,}\d+\s*$/, "") 
    .replace(/\s+$/, "")
    .trim();
}

function filterTOCForDisplay(tocChapters) {
  const MAX_CHAPTERS = 30; // theses can have many top-level chapters/parts

  function isStep(title) {
    const raw = (title || "").trim();
    if (
      /^(lời cảm ơn|lời cám ơn|tài liệu tham khảo|mục lục|nhận xét|ý kiến đánh giá|acknowledge|references?|bibliography|appendix|phụ lục|contents|content)\b/i.test(raw)
    )
      return true;
    if (/^["'`\{\[\(]/.test(raw)) return true;       // JSON/code mở đầu
    if (/^"[a-z_]+":\s/.test(raw)) return true;       // "key": value
    if (/^\s*[{}\[\]]\s*$/.test(raw)) return true;     // ngoặc đơn
    return false;
  }

  function filterNode(node, depth) {
    if (isStep(node.title)) return null;
    let kids = (node.children || [])
      .map((c) => filterNode(c, depth + 1))
      .filter(Boolean);
    return { ...node, children: kids };
  }

  return tocChapters
    .slice(0, MAX_CHAPTERS)
    .map((c) => filterNode(c, 1))
    .filter(Boolean);
}

function buildTOCStructure(tocChapters, pageLookup, tracker) {
  const events = [],
    sectionMap = new Map(),
    leafSet = new Set();
  const ROOT_X = 600,
    ROOT_Y = 400;

  function emitNode(
    node,
    parentId,
    parentInfo,
    tocLevel,
    siblingIdx,
    siblingCount,
  ) {
    const mindmapLevel = tocLevel + 1; // TOC L1→mindmap L2, L2→L3 ...
    const side = parentInfo
      ? parentInfo.side
      : siblingIdx % 2 === 0
        ? "right"
        : "left";
    const color = parentInfo
      ? parentInfo.color
      : COLORS[siblingIdx % COLORS.length];
    const dirX = side === "right" ? 1 : -1;

    // X: step right at each TOC level
    const xStep = Math.max(140, 230 - tocLevel * 22);
    const x = (parentInfo ? parentInfo.x : ROOT_X) + dirX * xStep;

    // Y: spread siblings vertically
    const totalH = siblingCount * Math.max(55, 90 - tocLevel * 10);
    const y =
      (parentInfo ? parentInfo.y : ROOT_Y) -
      totalH / 2 +
      siblingIdx * (totalH / Math.max(siblingCount, 1));

    const id = nid(`h${mindmapLevel}`);
    const label = cleanNodeLabel(node.title);
    const pdfSrc = getPdfSource(node.title, pageLookup);
    const info = { id, side, color, x, y, level: mindmapLevel };
    const children = node.children || [];
    const isLeaf = children.length === 0;

    events.push(
      mkNode({
        id,
        parentId,
        label,
        description: "",
        pdfSource: pdfSrc,
        level: mindmapLevel,
        side,
        color,
        isRoot: false,
        x,
        y,
      }),
    );
    events.push(mkEdge({ parentId, childId: id, color, side }));
    tracker.addNode(id, parentId, label, mindmapLevel);

    const norm = normForLookup(label);
    if (norm) {
      sectionMap.set(norm, info);
      if (norm.length > 20) {
        const short = norm.slice(0, 20);
        if (!sectionMap.has(short)) sectionMap.set(short, info);
      }
    }

    if (isLeaf) leafSet.add(id);

    for (let ci = 0; ci < children.length; ci++) {
      emitNode(children[ci], id, info, tocLevel + 1, ci, children.length);
    }
    return info;
  }

  for (let i = 0; i < tocChapters.length; i++) {
    emitNode(tocChapters[i], "root-node", null, 1, i, tocChapters.length);
  }

  return { events, sectionMap, leafSet };
}

function extractChaptersFast(pagesData) {
  const entries = [],
    seen = new Set();
  for (const page of pagesData) {
    const bodyFont = page.bodyFont || 11;
    for (const line of page.lines || []) {
      const raw = (line.text || "").trim();
      const text = cleanHeadingLine(raw);
      if (!text || text.length < 3 || text.length > 110) continue;
      if (text.split(/\s+/).length > 12) continue;
      if (/^\[\d+\]/.test(text) || /^[A-Z][a-z]+,\s+[A-Z]/.test(text)) continue;
      const isBold = line.isBold || false,
        isBig = (line.avgFont || 0) > bodyFont * 1.12;
      const dottedM = text.match(
        /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s+[A-ZÀ-Ỹa-zà-ỹ‐]/,
      );
      const numM =
        !dottedM &&
        (text.match(/^(\d{1,2})\s+[A-ZÀ-Ỹ]/) ||
          text.match(/^(\d{1,2})\.\s+[A-ZÀ-Ỹ]/));
      const chapM = /^(chương|chapter|phần|part)\s+\d+/i.test(text);
      const romanM = /^([IVX]{1,5})\s*[\.\s]\s+[A-ZÀ-Ỹ]/.test(text);
      if (!isBold && !isBig && !dottedM && !numM && !chapM && !romanM) continue;
      const key = text.toLowerCase().replace(/\s+/g, "").slice(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);
      let level = 2,
        type = "arabic",
        dots = 0;
      if (chapM) {
        level = 1;
        type = "chapter";
      } else if (romanM) {
        level = 1;
        type = "roman";
      } else if (dottedM) {
        dots = (dottedM[1].match(/\./g) || []).length;
        level = dots + 1;
        type = "dotted";
      } else if (isBig && isBold) level = 1;
      const title = text
        .replace(/^(\d+\.)+\s*/, "")
        .replace(/^(chương|chapter|phần|part)\s+\d+[:\s.]*/i, "")
        .replace(/^[IVX]{1,5}[\.\s]+/i, "")
        .trim();
      if (title.length < 2) continue;
      entries.push({ title, level, type, dots, pageNum: page.pageNum });
    }
  }
  if (entries.length < 3) return null;
  const hasRoman = entries.some((e) => e.type === "roman"),
    hasChapter = entries.some((e) => e.type === "chapter");
  for (const e of entries) {
    if (hasChapter) {
      if (e.type === "chapter" || e.type === "roman") e.level = 1;
      else if (e.type === "arabic") e.level = 2;
      else if (e.type === "dotted") e.level = e.dots + 2;
    } else if (hasRoman) {
      if (e.type === "roman") e.level = 1;
      else if (e.type === "arabic") e.level = 2;
      else if (e.type === "dotted") e.level = e.dots + 2;
    }
  }
  const minL = Math.min(...entries.map((e) => e.level));
  const norm = entries.map((e) => ({ ...e, level: e.level - minL + 1 }));
  const chapters = [], seen2 = new Set();
  const stack = []; // [{node, level}]
  for (const e of norm) {
    const k = e.title.toLowerCase().slice(0, 30);
    if (seen2.has(k)) continue;
    seen2.add(k);
    const node = { title: e.title, level: e.level,
                  pageStart: e.pageNum, pageEnd: 9999, children: [] };
    while (stack.length && stack[stack.length - 1].level >= e.level) stack.pop();
    if (!stack.length) chapters.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ node, level: e.level });
  }
  for (let i = 0; i < chapters.length; i++)
    chapters[i].pageEnd = i + 1 < chapters.length ? chapters[i + 1].pageStart - 1 : 9999;
  return chapters.length >= 2 ? chapters : null;
}

//  BM25 + MMR
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

function mmrSelect(chunks, k = 10) {
  if (chunks.length <= k) return chunks;
  const result = [],
    rem = [...chunks];
  const fi = rem.reduce(
    (bi, c, i) => ((c._s || 0) > (rem[bi]?._s || 0) ? i : bi),
    0,
  );
  result.push(...rem.splice(fi, 1));
  while (result.length < k && rem.length > 0) {
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
      const sc = (rem[i]._s || 0) * 0.6 + (1 - maxOv) * 0.4;
      if (sc > bS) {
        bS = sc;
        bI = i;
      }
    }
    result.push(...rem.splice(bI, 1));
  }
  return result;
}

function buildRAGContext(chapters, allChunks) {
  const CAP_CH = 1500,
    CAP_TOT = 9000,
    blocks = [];
  if (!chapters?.length) {
    const ranked = allChunks.map((c) => ({ ...c, _s: (c.text || "").length }));
    return mmrSelect(ranked, 14)
      .map(
        (c) =>
          cleanChunkText(c.text).slice(0, 350) +
          (c.pageNum ? ` (p.${c.pageNum})` : ""),
      )
      .join("\n")
      .slice(0, CAP_TOT);
  }
  for (const ch of chapters) {
    let pool = allChunks;
    let locked = false;
    const rangeTrustworthy =
      ch._tocMethod !== 'ai-fulltext' &&
      ch.pageStart > 0 &&
      ch.pageEnd != null &&
      ch.pageEnd >= ch.pageStart; 

    if (rangeTrustworthy) {
      const inRange = allChunks.filter(
        (c) =>
          c.pageNum != null &&
          c.pageNum >= ch.pageStart &&
          c.pageNum <= ch.pageEnd + 1,
      );
      if (inRange.length >= 1) {
        pool = inRange;
        locked = true;
      }
    }
    // Only fall back to sectionTitle matching when range is unknown
    if (!locked) {
      const bySection = allChunks.filter(
        (c) =>
          c.sectionTitle &&
          c.sectionTitle
            .toLowerCase()
            .includes(ch.title.toLowerCase().slice(0, 15)),
      );
      if (bySection.length >= 1) pool = bySection;
    }
    const ranked = pool.map((c) => ({
      ...c,
      _s: bm25(ch.title, c.text || ""),
    }));
    const maxScore = Math.max(...ranked.map((c) => c._s), 0);
    const selected =
      maxScore > 0
        ? mmrSelect(
          ranked.sort((a, b) => b._s - a._s),
          5,
        )
        : pool.slice(0, 4);
    const excerpt = selected
      .map((c) => cleanChunkText(c.text).slice(0, 350))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CAP_CH);
    const pageTag = ch.pageStart
      ? ` (p.${ch.pageStart}${ch.pageEnd && ch.pageEnd < 9999 ? "-" + ch.pageEnd : ""})`
      : "";
    if (excerpt.length > 30) blocks.push(`[${ch.title}${pageTag}]: ${excerpt}`);
  }
  return blocks.join("\n").slice(0, CAP_TOT);
}

function buildDetailPrompt({
  ragContext,
  tocChapters,
  leafSet,
  sectionMap,
  lang,
}) {
  const leafTitles = [];
  function collectLeafTitles(nodes) {
    for (const n of nodes || []) {
      if (!n.children?.length) leafTitles.push(cleanNodeLabel(n.title));
      else collectLeafTitles(n.children);
    }
  }
  collectLeafTitles(tocChapters);

  const validLeaves = sectionMap
    ? leafTitles.filter((t) => {
      const norm = normForLookup(t);
      if (sectionMap.has(norm)) return true;
      for (const k of sectionMap.keys()) {
        if (
          norm.length > 4 &&
          (k.startsWith(norm.slice(0, 12)) || norm.startsWith(k.slice(0, 12)))
        )
          return true;
      }
      return false;
    })
    : leafTitles;

  const sectionList = validLeaves.map((s) => `### ${s}`).join("\n");
  const isVi = lang === "vi";

  if (isVi)
    return `/no_think
NỘI DUNG TÀI LIỆU (CHỈ dùng thông tin từ đây, TUYỆT ĐỐI không bịa thêm):
${ragContext}

Với mỗi mục ### bên dưới, trích nội dung CỤ THỂ từ NỘI DUNG TÀI LIỆU.

${sectionList}

QUY TẮC NGHIÊM NGẶT:
- CHỈ dùng thông tin nằm dưới ĐÚNG mục đó trong NỘI DUNG TÀI LIỆU. Không lấy nội dung mục khác.
- Nếu một mục có cấu trúc con (a, b, các bước, danh sách) → tạo #### cho từng mục con, rồi ##### cho chi tiết bên trong.
- Nếu một mục là ĐOẠN VĂN XUÔI nhưng nói về NHIỀU khía cạnh (vd: vừa nêu công việc, vừa nêu mục tiêu, vừa nêu kết quả) → tách MỖI khía cạnh thành 1 node #### riêng, label là cụm danh từ ngắn của khía cạnh đó, mô tả là dữ kiện tương ứng. KHÔNG nhồi cả đoạn vào 1 node.
- NHƯNG nếu đoạn chỉ nói 1 ý duy nhất (1 mệnh đề trần thuật) → giữ 1 node, KHÔNG xé câu thành mảnh vụn, KHÔNG bịa thêm khía cạnh không có trong đoạn.
- KHÔNG diễn giải, KHÔNG tóm tắt chung chung. Label phải chứa danh từ/thuật ngữ THẬT trong tài liệu.
- CẤM label rỗng kiểu: "Định nghĩa", "Mục tiêu chính", "Hoạt động chính", "Đặc điểm", "Ứng dụng", "4 giá trị cốt lõi" (phải liệt kê 4 giá trị đó ra).
- Nếu tài liệu liệt kê N mục → tạo đủ N #### (vd 5 phương thức HTTP → 5 node GET, POST, PUT, DELETE...).
- Mô tả sau dấu | là dữ kiện cụ thể trích từ tài liệu, không phải câu khái quát.
- Nếu một mục KHÔNG có nội dung trong tài liệu → bỏ qua, KHÔNG bịa.
CẤM: code, JSON, dấu ngoặc kép làm tiêu đề node. Chỉ dùng ngôn ngữ tự nhiên.

VÍ DỤ ĐÚNG (trích dữ kiện thật, không diễn giải):
### Giao thức HTTP, HTTP Request và HTTP Response
#### Giao thức HTTP | Giao thức truyền tải siêu văn bản, tầng ứng dụng trên TCP/IP
##### GET | Lấy thông tin từ server, không ảnh hưởng dữ liệu
##### POST | Gửi dữ liệu tới server qua HTML form
##### PUT | Thay đổi toàn bộ đại diện của tài nguyên mục tiêu
##### DELETE | Gỡ bỏ tài nguyên mục tiêu theo URI
#### HTTP Request | Client mở kết nối TCP tới server rồi gửi request
##### Header | Accept, Accept-Encoding, Connection, Cookie, User-Agent
#### HTTP Response | Cấu trúc giống Request, thêm trường status (HTTP Status Code)

VÍ DỤ TÁCH ĐOẠN VĂN NHIỀU KHÍA CẠNH (đoạn gốc: "Trong kỳ thực tập em nhập data game vào hệ thống, đồng thời sửa các lỗi logic, và viết tài liệu hướng dẫn"):
#### Nhập data game | Đưa dữ liệu game vào hệ thống
#### Sửa lỗi logic | Khắc phục các lỗi sai logic của game
#### Viết tài liệu | Soạn tài liệu hướng dẫn sử dụng
(đoạn trên có 3 khía cạnh rõ → 3 node; KHÔNG gộp thành 1)

VÍ DỤ SAI (TUYỆT ĐỐI tránh — label rỗng, diễn giải):
#### Định nghĩa giao thức HTTP | (chung chung, không có dữ kiện)
#### Cấu trúc HTTP Request | (không liệt kê header thật)

BẮT ĐẦU:
### `;

  return `/no_think
DOCUMENT CONTENT (use ONLY this — do NOT invent information):
${ragContext}

For each ### section below, extract SPECIFIC content from DOCUMENT CONTENT.

${sectionList}

STRICT RULES:
- Use ONLY information located under THAT exact section in DOCUMENT CONTENT. Never pull content from another section.
- If a section has sub-structure (a, b, steps, a list) → create one #### per sub-item, then ##### for inner details.
- If a section is a PROSE PARAGRAPH covering MULTIPLE aspects (e.g. it states a task, a goal, and a result) → split EACH aspect into its own #### node (label = short noun phrase of that aspect, description = the matching fact). Do NOT cram the whole paragraph into one node.
- BUT if the paragraph states only ONE single idea (one narrative clause) → keep ONE node, do NOT shred the sentence, do NOT invent extra aspects not in the paragraph.
- Do NOT paraphrase, do NOT summarize generically. Labels must contain REAL nouns/terms from the document.
- FORBIDDEN empty labels like: "Definition", "Main goal", "Key activities", "Characteristics", "Applications", "4 core values" (you must list the 4 values).
- If the document lists N items → create all N #### (e.g. 5 HTTP methods → 5 nodes GET, POST, PUT, DELETE...).
- Text after | is a concrete fact extracted from the document, not a generic sentence.
- If a section has NO content in the document → skip it, do NOT invent.
FORBIDDEN: code snippets, JSON keys, quoted strings as node labels. Use natural language only.

CORRECT EXAMPLE (extract real facts, no paraphrase):
### HTTP, HTTP Request and HTTP Response
#### HTTP protocol | Hypertext transfer protocol, application layer over TCP/IP
##### GET | Retrieves info from server, no effect on data
##### POST | Sends data to server via HTML form
##### PUT | Replaces all current representations of the target resource
##### DELETE | Removes the target resource by URI
#### HTTP Request | Client opens a TCP connection to the server then sends a request
##### Header | Accept, Accept-Encoding, Connection, Cookie, User-Agent
#### HTTP Response | Same structure as Request, plus a status field (HTTP Status Code)

SPLITTING A MULTI-ASPECT PARAGRAPH (source: "During the internship I imported game data into the system, fixed logic bugs, and wrote a user guide"):
#### Import game data | Load game data into the system
#### Fix logic bugs | Resolve incorrect game logic
#### Write user guide | Author the usage documentation
(3 clear aspects → 3 nodes; do NOT merge into one)

WRONG EXAMPLE (AVOID — empty labels, paraphrase):
#### Definition of HTTP protocol | (generic, no facts)
#### HTTP Request structure | (does not list real headers)

BEGIN:
### `;
}

function buildSingleCallPrompt({ title, content, lang }) {
  const isVi = lang === "vi";
  if (isVi)
    return `/no_think
Dưới đây là NỘI DUNG một tài liệu (chỉ dùng thông tin này, TUYỆT ĐỐI không bịa thêm):

${content}

Tạo MINDMAP MARKDOWN cho nội dung trên. CHỈ heading, KHÔNG văn xuôi.

CÁCH LỒNG CẤP: viết 1 nhánh ## rồi NGAY các ### con của nó, rồi #### con của ###, XONG mới sang ## kế tiếp.

QUY TẮC:
- TUYỆT ĐỐI KHÔNG tạo nhánh tên tài liệu, tiêu đề file, "${title}", "TÀI LIỆU", "DOCUMENT".
- KHÔNG tạo nhánh "Tài liệu tham khảo", "Tham khảo", "References", "Phụ lục", trích dẫn [1] [2].
- 4-7 nhánh ## | mỗi ## có 3-5 ### | ### có thể có #### nếu nội dung đủ chi tiết.
- Phần sau dấu | là mô tả ngắn 1 mệnh đề trích từ nội dung, KHÔNG bịa số.
- Dùng thuật ngữ/danh từ THẬT trong tài liệu, không diễn giải chung chung.

VÍ DỤ ĐỊNH DẠNG (thay bằng nội dung thật):
## Nhánh chính thứ nhất | đặc điểm cốt lõi
### Khía cạnh A | định nghĩa ngắn
#### Chi tiết A1 | dữ kiện cụ thể
### Khía cạnh B | định nghĩa ngắn
## Nhánh chính thứ hai | đặc điểm cốt lõi
### Khía cạnh C | định nghĩa ngắn

BẮT ĐẦU (dòng đầu tiên phải là một nhánh ## nội dung thật):`;
  return `/no_think
Below is the CONTENT of a document (use ONLY this — do NOT invent anything):

${content}

Create a MARKDOWN MINDMAP for the content above. Headings ONLY, NO prose.

NESTING: write one ## branch then IMMEDIATELY its ### children, then #### under ###, THEN the next ##.

RULES:
- NEVER create a branch for the document name, file title, "${title}", "DOCUMENT", "TÀI LIỆU".
- NEVER create a "References", "Bibliography", "Appendix" branch or citation markers [1] [2].
- 4-7 ## branches | 3-5 ### per ## | ### may have #### when detail warrants.
- Text after | is a one-clause description taken from the content, no invented numbers.
- Use REAL terms/nouns from the document, no generic paraphrase.

FORMAT EXAMPLE (replace with real content):
## First main branch | core characteristic
### Aspect A | short definition
#### Detail A1 | specific fact
### Aspect B | short definition
## Second main branch | core characteristic
### Aspect C | short definition

BEGIN (the very first line must be a real ## branch):`;
}

function buildPromptOnlyPrompt({ topic, lang }) {
  const isVi = lang === "vi";
  if (isVi)
    return `\
/no_think
Tạo MINDMAP MARKDOWN về chủ đề: "${topic}". CHỈ heading, KHÔNG văn xuôi.

CÁCH LỒNG CẤP (CỰC KỲ QUAN TRỌNG):
Viết 1 nhánh ## rồi NGAY các ### con của nó, rồi các #### con của ###,
XONG mới sang nhánh ## kế tiếp.
TUYỆT ĐỐI KHÔNG gom hết ## một chỗ rồi mới liệt kê ### bên dưới.

QUY TẮC:
- KHÔNG dùng "${topic}" làm tên nhánh.
- KHÔNG bịa số liệu / công thức / năm nếu không chắc chắn.
- Phần sau dấu | là MÔ TẢ KHÁI NIỆM ngắn (1 mệnh đề), KHÔNG phải số bịa.
- 5-7 nhánh ## | mỗi ## có 3-5 ### | mỗi ### có 2-3 ####
- Tối đa 3 cấp: ## → ### → ####
- Thay nội dung ví dụ bằng nội dung THẬT; KHÔNG chép "Nhánh thứ nhất", "Chủ đề con A".
- CẤM tên: "Tổng quan", "Giới thiệu", "Kết luận".

VÍ DỤ ĐÚNG (học CHÍNH XÁC thứ tự lồng này):
## Nhánh thứ nhất | đặc điểm cốt lõi của nhánh
### Chủ đề con A | định nghĩa / vai trò ngắn gọn
#### Chi tiết A1 | cơ chế hoặc thành phần cụ thể
#### Chi tiết A2 | yếu tố liên quan
### Chủ đề con B | định nghĩa / vai trò ngắn gọn
#### Chi tiết B1 | đặc điểm cụ thể
## Nhánh thứ hai | đặc điểm cốt lõi của nhánh
### Chủ đề con C | định nghĩa ngắn gọn
#### Chi tiết C1 | thành phần cụ thể

BẮT ĐẦU (theo ĐÚNG thứ tự lồng ## → ### → #### như ví dụ):
##`;
  return `\
/no_think
Create a MARKDOWN MINDMAP about: "${topic}". Headings ONLY, NO prose.

NESTING (CRITICAL):
Write one ## branch then IMMEDIATELY its ### children, then their #### children,
THEN move to the next ## branch.
NEVER dump all ## first and list ### afterwards.

RULES:
- Do NOT use "${topic}" as a branch name.
- Do NOT fabricate numbers / formulas / dates you are unsure about.
- Text after | is a SHORT concept description (one clause), not invented stats.
- 5-7 ## | 3-5 ### per ## | 2-3 #### per ###
- Max 3 levels: ## → ### → ####
- Replace example content with REAL content; do NOT copy "First branch", "Subtopic A".
- FORBIDDEN names: "Overview", "Introduction", "Conclusion".

CORRECT EXAMPLE (copy this nesting order EXACTLY):
## First branch | core characteristic of this branch
### Subtopic A | short definition or role
#### Detail A1 | specific mechanism or component
#### Detail A2 | related factor
### Subtopic B | short definition or role
#### Detail B1 | specific characteristic
## Second branch | core characteristic of this branch
### Subtopic C | short definition
#### Detail C1 | specific component

BEGIN (follow the EXACT ## → ### → #### order shown above):
##`;
}


function makeMapTracker() {
  const nodes = new Map();
  nodes.set("root-node", {
    label: "ROOT",
    level: 0,
    parentId: null,
    children: [],
    description: "",
  });

  function addNode(id, parentId, fullLine, level) {
    const pi = fullLine.indexOf(" | ");
    const name = (pi !== -1 ? fullLine.slice(0, pi) : fullLine).trim();
    const desc = (pi !== -1 ? fullLine.slice(pi + 3) : "").trim();
    nodes.set(id, {
      label: name,
      description: desc,
      level,
      parentId,
      children: [],
    });
    if (nodes.has(parentId)) nodes.get(parentId).children.push(id);
  }

  function printTree(nodeId, indent = 0) {
    const node = nodes.get(nodeId);
    if (!node) return;
    const sym =
      indent === 0
        ? "🗺 "
        : indent === 1
          ? "▸ "
          : indent === 2
            ? "  ◦ "
            : "    ".repeat(Math.max(0, indent - 2)) + "· ";
    const desc = node.description
      ? ` — ${node.description.slice(0, 85)}${node.description.length > 85 ? "..." : ""}`
      : "";
    console.log(`${"  ".repeat(indent)}${sym}${node.label}${desc}`);
    for (const cid of node.children) printTree(cid, indent + 1);
  }

  function _structural(all) {
    const total = all.length - 1;
    if (!total) return { score: 0, total: 0 };
    const maxDepth = Math.max(...all.map((n) => n.level));
    const childCounts = all.map((n) => n.children.length).filter((c) => c > 0);
    const avgCh = childCounts.length
      ? childCounts.reduce((s, c) => s + c, 0) / childCounts.length
      : 0;
    const stdCh = childCounts.length
      ? Math.sqrt(
        childCounts.reduce((s, c) => s + (c - avgCh) ** 2, 0) /
        childCounts.length,
      )
      : 0;
    const leafCount = all.filter(
      (n) => n.children.length === 0 && n.level > 0,
    ).length;
    const leafRatio = leafCount / Math.max(total, 1);
    const depthScore = Math.max(0, 1 - Math.abs(maxDepth - 4) / 4);
    const balanceScore = Math.max(0, 1 - stdCh / Math.max(avgCh, 1));
    const leafScore =
      leafRatio >= 0.35 && leafRatio <= 0.72
        ? 1
        : Math.max(
          0,
          1 -
          Math.min(Math.abs(leafRatio - 0.35), Math.abs(leafRatio - 0.72)) /
          0.3,
        );
    const nodeScore =
      total >= 8 && total <= 150
        ? 1
        : total < 8
          ? total / 8
          : Math.max(0, 1 - (total - 150) / 100);
    const score =
      0.25 * depthScore +
      0.3 * balanceScore +
      0.2 * leafScore +
      0.25 * nodeScore;
    return {
      score,
      total,
      maxDepth,
      avgCh: +avgCh.toFixed(2),
      stdCh: +stdCh.toFixed(2),
      leafCount,
      leafRatio: +leafRatio.toFixed(3),
      depthScore,
      balanceScore,
    };
  }

  function _hierarchy(all) {
    const stop = new Set([
      "và",
      "của",
      "các",
      "trong",
      "với",
      "là",
      "có",
      "được",
      "cho",
      "the",
      "a",
      "an",
      "of",
      "in",
      "on",
      "at",
      "to",
      "for",
      "is",
      "are",
      "was",
      "with",
    ]);
    const kw = (t) =>
      new Set(
        t
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3 && !stop.has(w)),
      );
    const idMap = new Map(all.map((n) => [n.id, n]));
    let good = 0,
      total = 0;
    const bad = [];
    for (const n of all) {
      if (!n.parentId || !idMap.has(n.parentId)) continue;
      const par = idMap.get(n.parentId);
      if (par.level === 0) continue;
      total++;
      const pk = kw(`${par.label} ${par.description}`);
      const ck = kw(`${n.label} ${n.description}`);
      const overlap = [...ck].filter((w) => pk.has(w)).length;
      const textMatch = n.label
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .some((w) =>
          `${par.label} ${par.description}`.toLowerCase().includes(w),
        );
      if (overlap > 0 || textMatch) good++;
      else bad.push(`"${par.label.slice(0, 20)}"→"${n.label.slice(0, 20)}"`);
    }
    const score = total > 0 ? good / total : 0.8;
    return { score, total, good, bad: bad.slice(0, 5) };
  }

  function _coverage(all) {
    const content = all.filter((n) => n.level > 0);
    if (!content.length) return { score: 0 };
    const stop = new Set([
      "và",
      "của",
      "the",
      "a",
      "an",
      "of",
      "in",
      "on",
      "to",
      "for",
      "is",
      "are",
      "with",
    ]);
    const allText = content
      .map((n) => `${n.label} ${n.description}`)
      .join(" ")
      .toLowerCase();
    const tokens = allText
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stop.has(w));
    const unique = new Set(tokens);
    const ttr = unique.size / Math.max(tokens.length, 1);
    const ttrScore =
      ttr >= 0.28 && ttr <= 0.62
        ? 1
        : Math.max(0, 1 - Math.abs(ttr - 0.45) / 0.45);
    const withDesc = content.filter(
      (n) => n.description && n.description.length > 10,
    ).length;
    const descDensity = withDesc / content.length;
    const score = 0.5 * ttrScore + 0.5 * descDensity;
    return {
      score,
      uniqueKeywords: unique.size,
      totalTokens: tokens.length,
      ttr: +ttr.toFixed(3),
      descDensity: +descDensity.toFixed(3),
    };
  }

  function _redundancy(all) {
    const labels = all
      .filter((n) => n.level > 0)
      .map((n) =>
        n.label
          .toLowerCase()
          .replace(/^\d+[\.\)]\s*/, "")
          .trim(),
      );
    let dups = 0;
    const examples = [];
    const seen = new Map();
    for (const lbl of labels) {
      const toks = new Set(lbl.split(/\s+/).filter((w) => w.length > 2));
      let isDup = seen.has(lbl);
      if (!isDup)
        for (const [prev] of seen) {
          const pt = new Set(prev.split(/\s+/).filter((w) => w.length > 2));
          const inter = [...toks].filter((w) => pt.has(w)).length;
          const union = new Set([...toks, ...pt]).size;
          if (union > 0 && inter / union > 0.8) {
            isDup = true;
            examples.push(`"${lbl}"≈"${prev}"`);
            break;
          }
        }
      if (isDup) dups++;
      else seen.set(lbl, 1);
    }
    const rate = dups / Math.max(labels.length, 1);
    return {
      score: Math.max(0, 1 - rate * 5),
      dups,
      rate: +rate.toFixed(4),
      examples: examples.slice(0, 5),
    };
  }

  function _readability(all) {
    const content = all.filter((n) => n.level > 0);
    if (!content.length) return { score: 0 };
    const wc = content.map((n) => n.label.split(/\s+/).length);
    const avg = wc.reduce((s, c) => s + c, 0) / wc.length;
    const labelScore = Math.max(0, 1 - Math.abs(avg - 4) / 4);
    const truncScore =
      1 -
      content.filter((n) => n.label.endsWith("...") || n.label.length < 4)
        .length /
      content.length;
    const withDesc = content.filter(
      (n) => n.description && n.description.length > 10,
    ).length;
    const descScore = withDesc / content.length;
    const artScore =
      1 -
      content.filter((n) => /\[|\(p\.\d+\)/.test(n.label)).length /
      content.length;
    const score =
      0.3 * labelScore + 0.25 * truncScore + 0.25 * descScore + 0.2 * artScore;
    return {
      score,
      avgLabelWords: +avg.toFixed(2),
      withDesc,
      descCoverage: +(withDesc / content.length).toFixed(3),
    };
  }

  function _graph(all) {
    const idSet = new Set(all.map((n) => n.id));
    const orphans = all.filter(
      (n) => n.parentId && !idSet.has(n.parentId),
    ).length;
    const orphanScore = 1 - orphans / Math.max(all.length, 1);
    const levels = [...new Set(all.map((n) => n.level))].sort((a, b) => a - b);
    let gapPenalty = 0;
    for (let i = 1; i < levels.length; i++)
      if (levels[i] - levels[i - 1] > 2) gapPenalty += 0.1;
    const parentCounts = [];
    const pc = new Map();
    for (const n of all)
      if (n.parentId) pc.set(n.parentId, (pc.get(n.parentId) || 0) + 1);
    pc.forEach((v) => parentCounts.push(v));
    const avgB = parentCounts.length
      ? parentCounts.reduce((s, c) => s + c, 0) / parentCounts.length
      : 0;
    const branchScore = Math.max(0, 1 - Math.abs(avgB - 3.5) / 3.5);
    const byLevel = {};
    for (const n of all) {
      if (!n.level) continue;
      byLevel[n.level] = (byLevel[n.level] || 0) + 1;
    }
    const score =
      0.35 * orphanScore +
      0.3 * Math.max(0, 1 - gapPenalty) +
      0.35 * branchScore;
    return { score, orphans, avgBranching: +avgB.toFixed(2), byLevel };
  }

  function evaluate() {
    const all = [...nodes.values()];
    if (all.length <= 1) return { total: 0, finalScore: 0 };
    const s = _structural(all);
    const h = _hierarchy(all);
    const cp = _coverage(all);
    const r = _redundancy(all);
    const rd = _readability(all);
    const g = _graph(all);
    const finalScore = Math.round(
      s.score * 0.2 * 100 +
      h.score * 0.2 * 100 +
      cp.score * 0.25 * 100 +
      r.score * 0.1 * 100 +
      rd.score * 0.15 * 100 +
      g.score * 0.1 * 100,
    );
    return { total: all.length - 1, finalScore, s, h, cp, r, rd, g };
  }

  return { addNode, printTree, evaluate };
}

function printMapAndEvaluate(tracker, title) {
  console.log("\n" + "═".repeat(70));
  console.log(`🗺  MINDMAP: "${title}"`);
  console.log("═".repeat(70));
  tracker.printTree("root-node");
  console.log("═".repeat(70));

  const ev = tracker.evaluate();
  if (!ev.total) {
    console.log("  (empty)\n" + "═".repeat(70));
    return;
  }
  const { finalScore: score, s, h, cp, r, rd, g } = ev;
  const bar =
    "█".repeat(Math.round(score / 5)) + "░".repeat(20 - Math.round(score / 5));
  const mbar = (v) =>
    "█".repeat(Math.round(v * 10)) + "░".repeat(10 - Math.round(v * 10));
  const fmt = (v) => v.toFixed(3);
  const rating =
    score >= 80
      ? "⭐⭐⭐⭐⭐ Excellent"
      : score >= 65
        ? "⭐⭐⭐⭐   Good"
        : score >= 50
          ? "⭐⭐⭐     Fair"
          : score >= 35
            ? "⭐⭐       Poor"
            : "⭐         Very poor";

  console.log(`\n📊 SCIENTIFIC QUALITY EVALUATION`);
  console.log(
    `   Total nodes    : ${ev.total}  │  Max depth: ${s.maxDepth}  │  Leaves: ${s.leafCount} (${(s.leafRatio * 100).toFixed(0)}%)`,
  );
  console.log(
    `   Avg children   : ${s.avgCh}  │  Std: ${s.stdCh}  │  Unique keywords: ${cp.uniqueKeywords}`,
  );
  console.log(
    `   Desc coverage  : ${rd.withDesc}/${ev.total} (${(rd.descCoverage * 100).toFixed(1)}%)  │  TTR: ${cp.ttr}  │  Orphans: ${g.orphans}`,
  );
  console.log(
    `   By level       : ${Object.entries(g.byLevel || {})
      .map(([l, c]) => `L${l}:${c}`)
      .join(" | ")}`,
  );
  console.log(
    `   ┌─ Metrics ──────────────────────────────────────────────────┐`,
  );
  console.log(
    `   │ Structural   ${fmt(s.score)}  [${mbar(s.score)}]  ×0.20 depth·balance·size  │`,
  );
  console.log(
    `   │ Hierarchy    ${fmt(h.score)}  [${mbar(h.score)}]  ×0.20 parent-child coherence │`,
  );
  console.log(
    `   │ Coverage↑    ${fmt(cp.score)}  [${mbar(cp.score)}]  ×0.25 TTR + desc density   │`,
  );
  console.log(
    `   │ Redundancy   ${fmt(r.score)}  [${mbar(r.score)}]  ×0.10 near-dup Jaccard      │`,
  );
  console.log(
    `   │ Readability  ${fmt(rd.score)}  [${mbar(rd.score)}]  ×0.15 label·desc·artifacts │`,
  );
  console.log(
    `   │ Graph        ${fmt(g.score)}  [${mbar(g.score)}]  ×0.10 tree integrity        │`,
  );
  console.log(
    `   └────────────────────────────────────────────────────────────┘`,
  );
  console.log(`   FINAL SCORE : ${score}/100  [${bar}]  ${rating}`);

  if (ev.total < 10) console.log(`Few nodes (${ev.total})`);
  if (s.maxDepth < 3) console.log(`Shallow map (depth ${s.maxDepth})`);
  if (r.dups > 3) console.log(` ${r.dups} near-duplicate nodes`);
  if (h.bad?.length)
    console.log(`Bad hierarchy: ${h.bad.slice(0, 2).join(", ")}`);
  if (g.orphans > 0) console.log(`  ${g.orphans} orphan nodes`);
  if (rd.descCoverage < 0.4)
    console.log(
      ` Low description coverage (${(rd.descCoverage * 100).toFixed(0)}%)`,
    );
  console.log("═".repeat(70) + "\n");
}

// ─── Phase 2 parser: ### markers + #### ##### nodes ──────────────────────────
function makeDetailState() {
  return {
    currentSectionId: null,
    currentSectionInfo: null,
    lastDetailId: null,
    lastDetailInfo: null,
    childCounts: new Map(),
    emitted: new Set(),
  };
}

function lookupSection(text, sectionMap) {
  const norm = normForLookup(text);
  if (sectionMap.has(norm)) return sectionMap.get(norm);
  for (const [key, info] of sectionMap) {
    if (
      norm.length > 4 &&
      (key.startsWith(norm.slice(0, 12)) || norm.startsWith(key.slice(0, 12)))
    )
      return info;
  }
  return null;
}

function* parseDetailLine(rawLine, sectionMap, ds, tracker) {
  const m = rawLine.match(/^(#{2,6})\s+(.+)/);
  if (!m) return;
  const level = m[1].length,
    text = m[2].trim();

  // Level 2 or 3 → treat as section marker (look up in sectionMap)
  if (level <= 3) {
    const info = lookupSection(text, sectionMap);
    if (info) {
      ds.currentSectionId = info.id;
      ds.currentSectionInfo = info;
      ds.lastDetailId = null;
      ds.lastDetailInfo = null;
      if (!ds.childCounts.has(info.id)) ds.childCounts.set(info.id, 0);
      console.log(`[Detail] §nav "${text.slice(0, 40)}" → ${info.id}`);
    } else {
      console.log(
        `[Detail] §skip-unknown "${text.slice(0, 40)}" (keep prev: ${ds.currentSectionId})`,
      );
    }
    return;
  }

  if (!ds.currentSectionId && sectionMap.size > 0) {
    const [, firstInfo] = [...sectionMap.entries()][0];
    ds.currentSectionId = firstInfo.id;
    ds.currentSectionInfo = firstInfo;
    ds.childCounts.set(firstInfo.id, 0);
    console.log(`[Detail] #### fallback to first section: ${firstInfo.id}`);
  }

  if (!ds.currentSectionId) return;

  let parentId = ds.currentSectionId,
    parentInfo = ds.currentSectionInfo;
  if (level >= 5 && ds.lastDetailId) {
    parentId = ds.lastDetailId;
    parentInfo = ds.lastDetailInfo;
  }
  if (!parentInfo) return;

  const detailLevel = (parentInfo.level ?? 3) + 1;

  const pipeIdx = text.indexOf(" | ");
  const labelRaw = cleanLLMLabel(
    (pipeIdx !== -1 ? text.slice(0, pipeIdx) : text).trim(),
  );
  const label = labelRaw
    .replace(/^\d+[\.\)]\s*/, "")
    .replace(/^[-*•]\s*/, "")
    .trim();
  if (!label || label.length < 2) return;
  if (/\[\d+\]\s*$/.test(label)) return   // figure caption: "...something [1]"
  if (/^(mô tả|minh hoạ|hình|bảng|pipeline|quy trình)\s/i.test(label) && /\[\d+\]/.test(label)) return
  if (/bỏ qua|không có nội dung|→ bỏ|skip this|no content/i.test(label)) return;
  if (/^(không|no |skip|bỏ)/i.test(label) && label.length < 60) return;
  // Reject JSON / code-like labels
  if (/^["'`\{\[\(]/.test(label)) return; // starts with quote/brace/bracket
  if (/^[a-z_]+\s*[":]\s/.test(label)) return; // json key: value
  if (/[{}\[\]]/.test(label) && label.length < 60) return; // contains braces
  if (/^\/\/|^\/\*/.test(label)) return; // code comment

  const key = label.toLowerCase().replace(/\s+/g, "").slice(0, 28);
  if (ds.emitted.has(key)) return;
  ds.emitted.add(key);

  const rawDesc = pipeIdx !== -1 ? text.slice(pipeIdx + 3).trim() : "";
  const description = cleanDescription(rawDesc);
  const pdfSource = extractPageRef(description);

  const childIdx = ds.childCounts.get(parentId) || 0;
  ds.childCounts.set(parentId, childIdx + 1);

  const { side, color, x: px, y: py } = parentInfo;
  const xGap = Math.max(130, 210 - level * 10);
  const x = px + (side === "right" ? 1 : -1) * xGap;
  const y = py - 75 + childIdx * 82;
  const id = nid(`h${detailLevel}`);

  tracker.addNode(id, parentId, text, detailLevel);
  if (detailLevel === 4) {
    ds.lastDetailId = id;
    ds.lastDetailInfo = { side, color, x, y, level: detailLevel };
  }

  yield mkNode({
    id,
    parentId,
    label,
    description,
    pdfSource,
    level: detailLevel,
    side,
    color,
    isRoot: false,
    x,
    y,
  });
  yield mkEdge({ parentId, childId: id, color, side });
}

async function* emitDetailStream(prompt, sectionMap, tracker) {
  const ctl = new AbortController();
  const timer = setTimeout(() => {
    console.warn("[Stream] Timeout");
    ctl.abort();
  }, 400_000);
  const ds = makeDetailState();
  let lineBuf = "### ",
    nodeCount = 0,
    inThink = false;
  try {
    for await (const piece of streamLLM(prompt, {
      signal: ctl.signal,
      maxTokens: 8000,
      temperature: 0.2,
    })) {
      lineBuf += piece;
      lineBuf = lineBuf.replace(/<think>[\s\S]*?<\/think>/g, "");
      const thinkStart = lineBuf.indexOf("<think>");
      if (thinkStart !== -1) {
        inThink = true;
        lineBuf = lineBuf.slice(0, thinkStart);
      }
      const thinkEnd = lineBuf.indexOf("</think>");
      if (inThink && thinkEnd !== -1) {
        inThink = false;
        lineBuf = lineBuf.slice(thinkEnd + 8);
      }
      if (inThink) {
        lineBuf = "";
        continue;
      }
      let lf;
      while ((lf = lineBuf.indexOf("\n")) !== -1) {
        const line = lineBuf.slice(0, lf).trim();
        lineBuf = lineBuf.slice(lf + 1);
        if (!line) continue;
        const before = ds.emitted.size;
        yield* parseDetailLine(line, sectionMap, ds, tracker);
        if (ds.emitted.size > before) {
          nodeCount++;
          if (nodeCount % 10 === 0)
            yield { type: "status", message: `↓ ${nodeCount} nodes...` };
        }
      }
    }
    if (lineBuf.trim())
      yield* parseDetailLine(lineBuf.trim(), sectionMap, ds, tracker);
  } catch (err) {
    if (err.name !== "AbortError")
      yield { type: "error", message: err.message };
  } finally {
    clearTimeout(timer);
  }
}

//Prompt-only
function makeParserState(rootColor, topicKey = null) {
  return {
    nodeStack: [
      {
        id: "root-node",
        level: 0,
        side: null,
        color: rootColor,
        x: 600,
        y: 400,
      },
    ],
    childCounts: new Map(),
    l1Count: 0,
    emitted: new Set(),
    topicKey,
  };
}

function* parseLine(rawLine, state, tracker) {
  const m = rawLine.match(/^(#{1,6})\s+(.+)/);
  if (!m) return;
  const headingLevel = m[1].length,
    rest = m[2].trim();
  const pipeIdx = rest.indexOf(" | ");
  const labelRaw = cleanLLMLabel(
    (pipeIdx !== -1 ? rest.slice(0, pipeIdx) : rest).trim(),
  );
  const label = labelRaw
    .replace(/^\d+[\.\)]\s*/, "")
    .replace(/^[-*•]\s*/, "")
    .trim();
  if (!label || label.length < 2) return;
  if (headingLevel === 2 && state.topicKey &&
      label.toLowerCase().replace(/\s+/g, "").slice(0, 28) === state.topicKey)
    return;
  if (
    /^(tài liệu( tham khảo)?|tham khảo|references?|bibliography|phụ lục|appendix|mục lục|table of contents|document|tài liệu|contents|content)\s*[:\-]?\s*$/i.test(
      label,
    ) ||
    /^(tài liệu|document)\s*[:：]\s*["“']/i.test(label)
  )
    return;
  const key = label.toLowerCase().replace(/\s+/g, "").slice(0, 28);
  if (state.emitted.has(key)) return;
  state.emitted.add(key);
  const description = (pipeIdx !== -1 ? rest.slice(pipeIdx + 3) : "").trim();
  const pdfSource = extractPageRef(description);
  while (
    state.nodeStack.length > 1 &&
    state.nodeStack[state.nodeStack.length - 1].level >= headingLevel
  )
    state.nodeStack.pop();
  const parent = state.nodeStack[state.nodeStack.length - 1];
  const side =
    parent.level === 0
      ? state.l1Count % 2 === 0
        ? "right"
        : "left"
      : parent.side;
  const color =
    parent.level === 0 ? COLORS[state.l1Count % COLORS.length] : parent.color;
  if (parent.level === 0) state.l1Count++;
  const childIdx = state.childCounts.get(parent.id) || 0;
  state.childCounts.set(parent.id, childIdx + 1);
  const xGap = Math.max(145, 235 - parent.level * 13);
  const x = parent.x + (side === "right" ? 1 : -1) * xGap,
    y = parent.y - 90 + childIdx * 88;
  const id = nid(`l${headingLevel}`);
  tracker.addNode(id, parent.id, rest, headingLevel);
  yield mkNode({
    id,
    parentId: parent.id,
    label,
    description,
    pdfSource,
    level: headingLevel,
    side,
    color,
    isRoot: false,
    x,
    y,
  });
  yield mkEdge({ parentId: parent.id, childId: id, color, side });
  state.nodeStack.push({ id, level: headingLevel, side, color, x, y });
}

async function* emitMarkdownStream(prompt, rootColor, tracker, topicKey=null) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 400_000);
  const state = makeParserState(rootColor, topicKey);
  let lineBuf = "##",
    nodeCount = 0,
    inThink = false;
  try {
    for await (const piece of streamLLM(prompt, {
      signal: ctl.signal,
      maxTokens: 8000,
      temperature: 0.2,
    })) {
      lineBuf += piece;
      lineBuf = lineBuf.replace(/<think>[\s\S]*?<\/think>/g, "");
      const ts = lineBuf.indexOf("<think>");
      if (ts !== -1) {
        inThink = true;
        lineBuf = lineBuf.slice(0, ts);
      }
      const te = lineBuf.indexOf("</think>");
      if (inThink && te !== -1) {
        inThink = false;
        lineBuf = lineBuf.slice(te + 8);
      }
      if (inThink) {
        lineBuf = "";
        continue;
      }
      let lf;
      while ((lf = lineBuf.indexOf("\n")) !== -1) {
        const line = lineBuf.slice(0, lf).trim();
        lineBuf = lineBuf.slice(lf + 1);
        if (!line) continue;
        const before = state.emitted.size;
        yield* parseLine(line, state, tracker);
        if (state.emitted.size > before) {
          nodeCount++;
          if (nodeCount % 10 === 0)
            yield { type: "status", message: `↓ ${nodeCount} nodes...` };
        }
      }
    }
    if (lineBuf.trim()) yield* parseLine(lineBuf.trim(), state, tracker);
  } catch (err) {
    if (err.name !== "AbortError")
      yield { type: "error", message: err.message };
  } finally {
    clearTimeout(timer);
  }
}

//MAIN 
export async function* streamMindmapGeneration({
  title,
  pagesData,
  savedChunks,
  mindmapId,
  userPrompt,
  mode,
  tocChapters,
}) {
  _seq = 0;
  const ROOT_X = 600,
    ROOT_Y = 400;
  const allText = pagesData
    ? pagesData.map((p) => p.text || "").join("\n")
    : userPrompt || title;
  const lang = detectLang(allText);
  const isPDF = !!(pagesData && savedChunks?.length);
  const RCLR = isPDF ? "#3b82f6" : "#8b5cf6";
  const tracker = makeMapTracker();

  console.log(
    `[Stream] v12-hybrid START "${title}" isPDF=${isPDF} chunks=${savedChunks?.length ?? 0}`,
  );
  yield mkNode({
    id: "root-node",
    parentId: null,
    label: title,
    description: "",
    level: 0,
    side: null,
    color: RCLR,
    isRoot: true,
    x: ROOT_X,
    y: ROOT_Y,
  });

  if (isPDF) {
    yield {
      type: "status",
      message: `PDF ↓ ${pagesData.length} pages · ${savedChunks.length} chunks`,
    };

    let chapters = tocChapters || null;

    const depthOf = (ns, d = 1) =>
      ns.reduce(
        (mx, n) =>
          Math.max(mx, n.children?.length ? depthOf(n.children, d + 1) : d),
        1,
      );
    const countOf = (ns) =>
      ns.reduce((s, n) => s + 1 + countOf(n.children || []), 0);

    

    if (!chapters?.length && pagesData.length <= 8) {
      console.log(
        `[Stream] No deterministic structure + short (${pagesData.length}pg) → skip TOC-AI, single-call`,
      );
      yield { type: "status", message: "↓ Generating from content..." };
      const ragNS = buildRAGContext(null, savedChunks);
      const sp = buildSingleCallPrompt({ title, content: ragNS, lang });
      yield* emitMarkdownStream(sp, RCLR, tracker, normKey(title));
      printMapAndEvaluate(tracker, title);
      yield { type: "done", totalNodes: _seq + 1 };
      return;
    }

    const ragContext = buildRAGContext(chapters, savedChunks);

    const isShortDoc = pagesData.length <= 8;
    const hasRealStructure =
      chapters &&
      chapters.length >= 2 &&
      chapters.some((c) => (c.children || []).length > 0);

    if (isShortDoc && !hasRealStructure) {
      console.log(
        `[Stream] Short doc (${pagesData.length}pg) + no heading structure → single-call`,
      );
      yield { type: "status", message: "↓ Generating from content..." };
      const singlePrompt = buildSingleCallPrompt({
        title,
        content: ragContext,
        lang,
      });
      yield* emitMarkdownStream(singlePrompt, RCLR, tracker, normKey(title));
      printMapAndEvaluate(tracker, title);
      yield { type: "done", totalNodes: _seq + 1 };
      return;
    }

    if (!chapters?.length) {
      yield { type: "status", message: "↓ No structure detected..." };
      const prompt = buildSingleCallPrompt({
        title,
        content: ragContext,
        lang,
      });
      yield* emitMarkdownStream(prompt, RCLR, tracker, normKey(title));
      printMapAndEvaluate(tracker, title);
      yield { type: "done", totalNodes: _seq + 1 };
      return;
    }

    const pageLookup = buildPageLookup(chapters);

    const displayChapters = filterTOCForDisplay(chapters);
    const countNodes = (nodes) =>
      nodes.reduce((s, c) => s + 1 + countNodes(c.children || []), 0);
    console.log(
      `[Stream] TOC filtered: ${chapters.length}→${displayChapters.length} chapters, ${countNodes(displayChapters)} total nodes`,
    );

    yield {
      type: "status",
      message: `↓ Structure: ${displayChapters.length} chapters`,
    };
    const {
      events: tocEvents,
      sectionMap,
      leafSet,
    } = buildTOCStructure(displayChapters, pageLookup, tracker);
    for (const event of tocEvents) yield event;
    console.log(
      `[Stream] Pre-emitted ${tocEvents.filter((e) => e.type === "node").length} TOC nodes | ${sectionMap.size} sectionMap entries | ${leafSet.size} leaf nodes`,
    );
    console.log(
      "[Stream] sectionMap keys:",
      [...sectionMap.keys()].slice(0, 20).join(" | "),
    );

    yield { type: "status", message: "↓ Generating leaf details..." };
    const prompt = buildDetailPrompt({
      ragContext,
      tocChapters: displayChapters,
      leafSet,
      sectionMap,
      lang,
    });
    console.log(
      `[Stream] RAG: ${ragContext.length} chars | prompt: ${prompt.length} chars`,
    );
    yield* emitDetailStream(prompt, sectionMap, tracker);

    printMapAndEvaluate(tracker, title);
    yield { type: "done", totalNodes: _seq + 1 };
    return;
  }

  // Prompt-only
  const topic = userPrompt?.trim() || title;
  const prompt = buildPromptOnlyPrompt({ topic, lang });
  yield { type: "status", message: `Generating: "${topic.slice(0, 50)}"...` };
  yield* emitMarkdownStream(prompt, RCLR, tracker, normKey(topic));
  printMapAndEvaluate(tracker, title);
  yield { type: "done", totalNodes: _seq + 1 };
}

// ── Helper: in cây TOC ra console (đặt ở đầu file, ngoài controller) ──
export function dumpTOC(chapters, label = 'TOC') {
  console.log('\n' + '═'.repeat(60));
  console.log(`📑  ${label}`);
  console.log('═'.repeat(60));

  let n = 0;
  const walk = (nodes, depth = 0) => {
    for (const ch of nodes || []) {
      n++;
      const indent = '  '.repeat(depth);
      const mark = depth === 0 ? '▸' : depth === 1 ? '◦' : '·';
      const pages =
        ch.pageStart != null
          ? ` (p.${ch.pageStart}${ch.pageEnd && ch.pageEnd < 9999 ? '-' + ch.pageEnd : ''})`
          : '';
      console.log(`${indent}${mark} [L${depth + 1}] ${ch.title}${pages}`);
      walk(ch.children || [], depth + 1);
    }
  };
  walk(chapters);

  const depth = (ns, d = 1) =>
    (ns || []).reduce(
      (mx, x) => Math.max(mx, x.children?.length ? depth(x.children, d + 1) : d),
      1,
    );
  console.log('─'.repeat(60));
  console.log(`   Tổng node: ${n}  │  Độ sâu: ${depth(chapters)}  │  Chương L1: ${chapters?.length || 0}`);

  // Soi trùng title (lý do bị lặp)
  const seen = new Map();
  const dups = [];
  const scan = (ns) => {
    for (const x of ns || []) {
      const k = (x.title || '').toLowerCase().replace(/\s+/g, '').slice(0, 40);
      if (seen.has(k)) dups.push(x.title);
      else seen.set(k, 1);
      scan(x.children || []);
    }
  };
  scan(chapters);
  if (dups.length)
    console.log(`   ⚠️  ${dups.length} title TRÙNG: ${dups.slice(0, 8).join(' | ')}`);
  console.log('═'.repeat(60) + '\n');
}
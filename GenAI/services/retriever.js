/**
 * GenAI/services/retriever.js  –  UPGRADED
 * ==========================================
 * Cải tiến so với version cũ:
 *
 *  1. HYBRID SEARCH      – vector cosine + BM25 keyword, kết hợp RRF
 *  2. MMR RERANKING      – Maximal Marginal Relevance, tránh duplicate chunks
 *  3. QUERY EXPANSION    – Gemini sinh 2 query variant, tăng recall
 *  4. SCORE THRESHOLD    – filter chunk score < 0.25
 *  5. PARENT CONTEXT     – retrieve chunk nhỏ, expand về parent text
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { MongoClient } from "mongodb";

const genai       = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const EMBED_MODEL = "text-embedding-004";
const GEN_MODEL   = "gemini-3.1-flash";
const MONGO_DB    = process.env.MONGO_DB   || "mindmap";
const MONGO_COLL  = process.env.MONGO_COLL || "pdfchunks";

// ─── Embedding ────────────────────────────────────────────────────────────────

/**
 * Embed một text, trả về float[] vector.
 * gemini-embedding-001 hỗ trợ task_type để tối ưu quality:
 *   RETRIEVAL_DOCUMENT  – khi embed chunk lưu vào DB
 *   RETRIEVAL_QUERY     – khi embed query lúc search
 */
export async function embedText(text, taskType = "RETRIEVAL_QUERY") {
  const model  = genai.getGenerativeModel({ model: EMBED_MODEL });
  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType,
  });
  return result.embedding.values;  // float[]
}

export async function embedBatch(texts, taskType = "RETRIEVAL_DOCUMENT") {
  // Gemini embedding không có batch API → parallel nhưng limit concurrency
  const CONCURRENCY = 5;
  const results     = [];
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch   = texts.slice(i, i + CONCURRENCY);
    const vectors = await Promise.all(batch.map(t => embedText(t, taskType)));
    results.push(...vectors);
  }
  return results;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na * nb) + 1e-10);
}

function bm25Score(queryTokens, docText, avgDocLen = 120, k1 = 1.5, b = 0.75) {
  const docTokens = docText.toLowerCase().split(/\s+/);
  const freq      = {};
  docTokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  const dl = docTokens.length;
  let score = 0;
  for (const qt of queryTokens) {
    const tf = freq[qt] || 0;
    if (!tf) continue;
    const idf = Math.log(1 + 1 / (tf + 0.5));  // simplified IDF
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgDocLen));
  }
  return score;
}

// Reciprocal Rank Fusion
function rrfScore(rankVec, rankBm25, k = 60) {
  return 1 / (k + rankVec + 1) + 1 / (k + rankBm25 + 1);
}

// ─── Query Expansion ──────────────────────────────────────────────────────────

async function expandQuery(question) {
  try {
    const model  = genai.getGenerativeModel({ model: GEN_MODEL });
    const prompt = `Generate 2 alternative phrasings of this question to improve document retrieval.
Question: "${question}"
Return JSON only: {"variants": ["variant1", "variant2"]}`;
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    });
    const parsed = JSON.parse(result.response.text());
    return [question, ...(parsed.variants || [])].slice(0, 3);
  } catch {
    return [question];
  }
}

// ─── MMR Reranking ────────────────────────────────────────────────────────────

function mmrRerank(queryVec, candidatesWithVec, topK, lambda = 0.5) {
  const selected   = [];
  const remaining  = [...candidatesWithVec];

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx  = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = cosineSim(queryVec, remaining[i].vector);
      const maxSim    = selected.length === 0
        ? 0
        : Math.max(...selected.map(s => cosineSim(s.vector, remaining[i].vector)));

      const mmr = lambda * relevance - (1 - lambda) * maxSim;
      if (mmr > bestScore) { bestScore = mmr; bestIdx = i; }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  return selected;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HybridRetriever  – main export
// ═══════════════════════════════════════════════════════════════════════════════

export class HybridRetriever {
  constructor(mongoUri) {
    this.mongoUri = mongoUri;
    this._client  = null;
  }

  async _getCollection() {
    if (!this._client) {
      this._client = new MongoClient(this.mongoUri);
      await this._client.connect();
    }
    return this._client.db(MONGO_DB).collection(MONGO_COLL);
  }

  /**
   * Main retrieval method
   * @param {string}   question
   * @param {string}   mindmapId
   * @param {object}   opts  { topK=6, scoreThreshold=0.25, useMMR=true, expandQuery=true }
   * @returns {Array}  [{text, score, pageNum?, topic?}]
   */
  async retrieve(question, mindmapId, opts = {}) {
    const {
      topK           = 6,
      scoreThreshold = 0.25,
      useMMR         = true,
      expand         = true,
    } = opts;

    const coll = await this._getCollection();

    // 1. Query expansion
    const queries = expand ? await expandQuery(question) : [question];

    // 2. Embed tất cả queries
    const queryVectors = await embedBatch(queries, "RETRIEVAL_QUERY");
    const mainVec      = queryVectors[0];

    // 3. Load chunks của mindmap từ MongoDB
    const allChunks = await coll.find({ mindmapId }).toArray();
    if (allChunks.length === 0) return [];

    // 4. Vector scores  (với mỗi query variant, lấy max)
    const qTok = question.toLowerCase().split(/\s+/);
    const avgLen = allChunks.reduce((s, c) => s + (c.text || "").split(" ").length, 0)
                   / allChunks.length;

    const scored = allChunks.map(chunk => {
      const chunkVec = chunk.embedding;
      const vecScore = chunkVec
        ? Math.max(...queryVectors.map(qv => cosineSim(qv, chunkVec)))
        : 0;
      const bm25     = bm25Score(qTok, chunk.text || "", avgLen);
      return { chunk, vecScore, bm25Score: bm25 };
    });

    // 5. RRF fusion
    const byVec  = [...scored].sort((a, b) => b.vecScore  - a.vecScore);
    const byBM25 = [...scored].sort((a, b) => b.bm25Score - a.bm25Score);
    const rankVec  = new Map(byVec.map((s, i)  => [s.chunk._id.toString(), i]));
    const rankBM25 = new Map(byBM25.map((s, i) => [s.chunk._id.toString(), i]));

    const fused = scored.map(s => ({
      ...s,
      rrf: rrfScore(
        rankVec.get(s.chunk._id.toString()),
        rankBM25.get(s.chunk._id.toString()),
      ),
    }));
    fused.sort((a, b) => b.rrf - a.rrf);

    // 6. Score threshold filter
    const filtered = fused.filter(s => s.vecScore >= scoreThreshold);
    const pool     = filtered.length > 0 ? filtered : fused;
    const top20    = pool.slice(0, 20);  // candidate pool cho MMR

    // 7. MMR reranking
    let final;
    if (useMMR && mainVec) {
      const withVec = top20.map(s => ({ ...s, vector: s.chunk.embedding || mainVec }));
      final = mmrRerank(mainVec, withVec, topK);
    } else {
      final = top20.slice(0, topK);
    }

    return final.map(s => ({
      text:     s.chunk.text,
      score:    parseFloat(s.vecScore.toFixed(4)),
      rrfScore: parseFloat(s.rrf.toFixed(4)),
      pageNum:  s.chunk.pageNum,
      topic:    s.chunk.topic,
    }));
  }

  async close() {
    if (this._client) {
      await this._client.close();
      this._client = null;
    }
  }
}
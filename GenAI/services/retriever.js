// GenAI/services/retriever.js
// Hybrid RAG: Vector (nomic-embed-text) + BM25 → RRF → Graph-hop → MMR
// 100% Ollama — không dùng Gemini

import { MongoClient } from 'mongodb'
import { embedText }   from './embedder.js'

const OLLAMA_BASE = process.env.OLLAMA_URL        || 'http://localhost:11434'
const GEN_MODEL   = process.env.OLLAMA_GEN_MODEL  || 'qwen2.5:3b'
const MONGO_DB    = process.env.MONGO_DB           || 'mindmap'
const MONGO_COLL  = process.env.MONGO_COLL         || 'pdfchunks'


function cosineSim(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2
  }
  return dot / (Math.sqrt(na * nb) + 1e-10)
}

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\sàáâãèéêìíòóôõùúýăđơư]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

function bm25Score(queryTokens, docText, avgDocLen = 150, k1 = 1.2, b = 0.75) {
  const docTokens = tokenize(docText)
  const freq      = {}
  docTokens.forEach(t => { freq[t] = (freq[t] || 0) + 1 })
  const dl = docTokens.length
  let score = 0
  for (const qt of queryTokens) {
    const tf = freq[qt] || 0
    if (!tf) continue
    const idf = Math.log(1 + 1 / (tf + 0.5))
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgDocLen))
  }
  return score
}

function rrfScore(rankVec, rankBm25, k = 60) {
  return 1 / (k + rankVec + 1) + 1 / (k + rankBm25 + 1)
}

function mmrRerank(queryVec, candidates, topK, lambda = 0.6) {
  const pool      = candidates.map(c => ({ ...c, vec: c.embedding || [] }))
  const selected  = []
  const remaining = [...pool]
  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0, bestScore = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const rel    = cosineSim(queryVec, remaining[i].vec)
      const maxSim = selected.length === 0
        ? 0
        : Math.max(...selected.map(s => cosineSim(s.vec, remaining[i].vec)))
      const score  = lambda * rel - (1 - lambda) * maxSim
      if (score > bestScore) { bestScore = score; bestIdx = i }
    }
    selected.push(remaining.splice(bestIdx, 1)[0])
  }
  return selected
}


async function expandQuery(question) {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  GEN_MODEL,
        prompt: `Tạo 2 cách diễn đạt khác cho câu hỏi sau (cùng nghĩa, khác từ ngữ):
Câu hỏi: "${question}"
Trả về JSON: {"variants": ["cách 1", "cách 2"]}`,
        format: 'json',
        stream: false,
        options: { temperature: 0, num_ctx: 512, num_gpu: 99 },
      }),
    })
    if (!res.ok) return [question]
    const data   = await res.json()
    const parsed = JSON.parse(data.response)
    return [question, ...(parsed.variants || [])].slice(0, 3)
  } catch {
    return [question]
  }
}


export class HybridRetriever {
  constructor(mongoUri) {
    this._client    = new MongoClient(mongoUri)
    this._connected = false
  }

  async _connect() {
    if (!this._connected) {
      await this._client.connect()
      this._connected = true
    }
  }

  /**
   * Full pipeline:
   * 1. Query expansion (Ollama)
   * 2. Embed (nomic-embed-text)
   * 3. Vector search (Atlas $vectorSearch)
   * 4. BM25 scoring
   * 5. RRF fusion
   * 6. Graph-hop (optional)
   * 7. MMR diversity rerank
   */
  async retrieve(question, mindmapId, {
    topK      = 5,
    useMMR    = true,
    graphHop  = true,
    expandQ   = false,     // tắt mặc định vì qwen2.5:3b chậm
  } = {}) {
    await this._connect()
    const db   = this._client.db(MONGO_DB)
    const coll = db.collection(MONGO_COLL)

    // 1. Query expansion
    const queries = expandQ
      ? await expandQuery(question)
      : [question]

    // 2. Embed primary query
    const queryVec = await embedText(queries[0])

    // 3. Vector search
    const POOL = Math.max(60, topK * 12)
    let candidates = await coll.aggregate([
      {
        $vectorSearch: {
          index:         'vector_index',
          path:          'embedding',
          queryVector:   queryVec,
          numCandidates: POOL * 2,
          limit:         POOL,
          filter:        { mindmapId },
        },
      },
      {
        $project: {
          text: 1, pageNum: 1, chunkIndex: 1, embedding: 1,
          vscore: { $meta: 'vectorSearchScore' },
        },
      },
    ]).toArray()

    if (candidates.length === 0) return []

    // 4. BM25 scoring (dùng tất cả query variants)
    const queryTokens = [...new Set(queries.flatMap(q => tokenize(q)))]
    for (const c of candidates) {
      c.bm25 = bm25Score(queryTokens, c.text)
    }

    // 5. RRF fusion
    const byVec  = [...candidates].sort((a, b) => b.vscore - a.vscore)
    byVec.forEach((c, i) => { c.vrank = i })
    const byBm25 = [...candidates].sort((a, b) => b.bm25   - a.bm25)
    byBm25.forEach((c, i) => { c.brank = i })
    candidates.forEach(c => { c.rrf = rrfScore(c.vrank, c.brank) })
    candidates.sort((a, b) => b.rrf - a.rrf)

    // 6. Graph-hop — kéo thêm chunk lân cận của top seeds
    if (graphHop && candidates.length >= 5) {
      const seeds    = candidates.slice(0, 5)
      const seedVecs = seeds.map(c => c.embedding).filter(Boolean)
      const THRESHOLD = 0.72

      const others = await coll
        .find({ mindmapId, chunkIndex: { $nin: seeds.map(c => c.chunkIndex) } })
        .project({ text: 1, pageNum: 1, chunkIndex: 1, embedding: 1 })
        .limit(200)
        .toArray()

      const neighbors = others
        .map(c => {
          const maxSim = Math.max(...seedVecs.map(sv => cosineSim(sv, c.embedding || [])))
          return { ...c, graphSim: maxSim }
        })
        .filter(c => c.graphSim > THRESHOLD)
        .sort((a, b) => b.graphSim - a.graphSim)
        .slice(0, 8)

      if (neighbors.length > 0) {
        const baseRRF = candidates[candidates.length - 1]?.rrf ?? 0.005
        neighbors.forEach(n => {
          n.rrf  = baseRRF * (n.graphSim / THRESHOLD)
          n.bm25 = bm25Score(queryTokens, n.text)
        })
        candidates = [...candidates, ...neighbors]
        console.log(`[Retriever] Graph-hop +${neighbors.length} neighbors`)
      }
    }

    // 7. MMR
    const final = useMMR
      ? mmrRerank(queryVec, candidates, topK)
      : candidates.slice(0, topK)

    return final.map(c => ({
      text:       c.text,
      pageNum:    c.pageNum,
      chunkIndex: c.chunkIndex,
      score:      c.rrf,
    }))
  }

  // Alias nhẹ dùng cho suggestNodes (không expand query)
  async retrieveForSuggestion(nodeContext, mindmapId, topK = 5) {
    return this.retrieve(nodeContext, mindmapId, {
      topK, useMMR: true, graphHop: true, expandQ: false,
    })
  }

  async close() {
    if (this._connected) {
      await this._client.close()
      this._connected = false
    }
  }
}
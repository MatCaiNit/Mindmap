import { GoogleGenerativeAI } from "@google/generative-ai";
import { MongoClient } from "mongodb";

const genai       = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const EMBED_MODEL = "gemini-embedding-001";
const GEN_MODEL   = "gemini-3.1-flash-lite-preview";
const MONGO_DB    = process.env.MONGO_DB   || "mindmap";
const MONGO_COLL  = process.env.MONGO_COLL || "pdfchunks";


export async function embedText(text, taskType = "RETRIEVAL_QUERY") {
  const model  = genai.getGenerativeModel({ model: EMBED_MODEL });
  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType,
  });
  return result.embedding.values;  // float[]
}

export async function embedBatch(texts, taskType = "RETRIEVAL_DOCUMENT") {
  const CONCURRENCY = 5;
  const results     = [];
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch   = texts.slice(i, i + CONCURRENCY);
    const vectors = await Promise.all(batch.map(t => embedText(t, taskType)));
    results.push(...vectors);
  }
  return results;
}

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

function rrfScore(rankVec, rankBm25, k = 60) {
  return 1 / (k + rankVec + 1) + 1 / (k + rankBm25 + 1);
}


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

export class HybridRetriever {
    constructor(mongoUri) {
        this.client = new MongoClient(mongoUri);
    }

    async retrieve(question, mindmapId, { topK = 5 }) {
        const db = this.client.db(process.env.MONGO_DB);
        const coll = db.collection(process.env.MONGO_COLL);
        const queryVec = await embedText(question, "RETRIEVAL_QUERY");

        // Atlas Search Hybrid Pipeline
        const pipeline = [
            {
                $vectorSearch: {
                    index: "vector_index",
                    path: "embedding",
                    queryVector: queryVec,
                    numCandidates: 50,
                    limit: 15,
                    filter: { mindmapId }
                }
            },
            {
                $project: {
                    text: 1,
                    pageNum: 1,
                    score: { $meta: "vectorSearchScore" },
                    embedding: 1
                }
            }
        ];

        const results = await coll.aggregate(pipeline).toArray();
        
        // MMR Reranking đơn giản để tránh trùng ý trong 1 nhánh
        const final = [];
        for (const res of results) {
            if (final.length >= topK) break;
            const isTooSimilar = final.some(f => this.cosineSim(f.embedding, res.embedding) > 0.85);
            if (!isTooSimilar) final.push(res);
        }
        return final;
    }

    cosineSim(a, b) {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i]; na += a[i]**2; nb += b[i]**2;
        }
        return dot / (Math.sqrt(na * nb) + 1e-10);
    }
}
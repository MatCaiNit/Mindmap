/**
 * GenAI/services/embedder.js  –  UPGRADED
 * =========================================
 * Dùng gemini-embedding-001 với đúng task_type cho từng use-case.
 *
 * Key improvement vs version cũ:
 *  - task_type RETRIEVAL_DOCUMENT khi lưu chunk → vector tốt hơn khi search
 *  - task_type RETRIEVAL_QUERY    khi embed câu hỏi
 *  - Concurrency limit để tránh 429
 *  - Upsert vào MongoDB Atlas Vector Search (hoặc fallback cosine in-memory)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { MongoClient }         from "mongodb";

const genai       = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const EMBED_MODEL = "models/gemini-embedding-001";  // prefix "models/" bắt buộc
const MONGO_URI   = process.env.MONGO_URI  || "mongodb://localhost:27017";
const MONGO_DB    = process.env.MONGO_DB   || "mindmap";
const MONGO_COLL  = process.env.MONGO_COLL || "pdfchunks";
const CONCURRENCY = 5;  // max parallel embed calls

// ─── Embed single text ────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @param {"RETRIEVAL_DOCUMENT"|"RETRIEVAL_QUERY"|"SEMANTIC_SIMILARITY"|"CLASSIFICATION"} taskType
 * @returns {number[]} embedding vector
 */
export async function embedText(text, taskType = "RETRIEVAL_DOCUMENT") {
  const model  = genai.getGenerativeModel({ model: EMBED_MODEL });
  const result = await model.embedContent({
    content:  { parts: [{ text }] },
    taskType,
  });
  return result.embedding.values;  // float32[]
}

// ─── Embed batch with concurrency limit ──────────────────────────────────────

export async function embedBatch(texts, taskType = "RETRIEVAL_DOCUMENT") {
  const results = new Array(texts.length);

  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch   = texts.slice(i, i + CONCURRENCY);
    const vectors = await Promise.all(batch.map(t => embedText(t, taskType)));
    vectors.forEach((v, j) => { results[i + j] = v; });

    // nhẹ throttle để tránh 429
    if (i + CONCURRENCY < texts.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EmbedAndStore  –  pipeline chính: chunk text → embed → upsert MongoDB
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Nhận array of chunks, embed và lưu vào MongoDB.
 *
 * @param {string}   mindmapId
 * @param {Array}    chunks     – [{text, pageNum, topic, chunkIndex, ...}]
 * @returns {number} số chunks đã upsert
 */
export async function embedAndStore(mindmapId, chunks) {
  if (!chunks || chunks.length === 0) return 0;

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const coll = client.db(MONGO_DB).collection(MONGO_COLL);

  try {
    console.log(`[Embedder] Embedding ${chunks.length} chunks for mindmap ${mindmapId}…`);
    
    const texts   = chunks.map(c => c.text);
    const vectors = await embedBatch(texts, "RETRIEVAL_DOCUMENT");

    // Upsert (xóa cũ rồi insert mới để tránh duplicate)
    await coll.deleteMany({ mindmapId });

    const docs = chunks.map((chunk, i) => ({
      mindmapId,
      text:       chunk.text,
      pageNum:    chunk.pageNum    ?? null,
      topic:      chunk.topic      ?? null,
      chunkIndex: chunk.chunkIndex ?? i,
      embedding:  vectors[i],
      createdAt:  new Date(),
    }));

    await coll.insertMany(docs);
    console.log(`[Embedder] ✅ Stored ${docs.length} chunks`);
    return docs.length;
  } finally {
    await client.close();
  }
}

// ─── MongoDB Atlas Vector Search index setup ──────────────────────────────────
// Chạy 1 lần để tạo index (chỉ cần nếu dùng $vectorSearch aggregation)

export async function createVectorIndex() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  try {
    const db = client.db(MONGO_DB);
    await db.command({
      createSearchIndexes: MONGO_COLL,
      indexes: [{
        name:       "embedding_index",
        type:       "vectorSearch",
        definition: {
          fields: [{
            type:          "vector",
            path:          "embedding",
            numDimensions: 768,  // gemini-embedding-001 output dim
            similarity:    "cosine",
          }],
        },
      }],
    });
    console.log("[Embedder] ✅ Vector search index created");
  } catch (err) {
    if (err.codeName === "IndexAlreadyExists") {
      console.log("[Embedder] Index already exists, skipping.");
    } else {
      throw err;
    }
  } finally {
    await client.close();
  }
}
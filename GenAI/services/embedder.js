import { GoogleGenerativeAI } from "@google/generative-ai";
import { MongoClient } from "mongodb";
import PDFChunk from '../models/PDFChunk.js';
import dotenv from 'dotenv';
dotenv.config();

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const EMBED_MODEL = "gemini-embedding-001";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB = process.env.MONGO_DB || "mindmap";
const MONGO_COLL = process.env.MONGO_COLL || "pdfchunks";
const CONCURRENCY = 5;

export async function embedText(text, taskType = "RETRIEVAL_DOCUMENT") {
  const model = genai.getGenerativeModel({ model: EMBED_MODEL });
  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType,
  });
  return result.embedding.values;  // float32[]
}


export async function embedBatch(texts, taskType = "RETRIEVAL_DOCUMENT") {
  const results = new Array(texts.length);

  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch = texts.slice(i, i + CONCURRENCY);
    const vectors = await Promise.all(batch.map(t => embedText(t, taskType)));
    vectors.forEach((v, j) => { results[i + j] = v; });

    if (i + CONCURRENCY < texts.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}


export async function embedAndStore(mindmapId, chunks, filename) {
  if (!chunks || chunks.length === 0) return [];

  console.log(`[Embedder] Embedding ${chunks.length} chunks...`);
  const texts = chunks.map(c => c.text);
  const vectors = await embedBatch(texts, "RETRIEVAL_DOCUMENT");

  await PDFChunk.deleteMany({ mindmapId }); 

  const docs = chunks.map((chunk, i) => ({
    mindmapId,
    text: chunk.text,
    embedding: vectors[i],
    chunkIndex: chunk.chunkIndex ?? i,
    metadata: {
      filename: filename,
      pageEstimate: chunk.pageNum
    }
  }));

  // Lưu vào DB
  const savedDocs = await PDFChunk.insertMany(docs);
  console.log(`[Embedder] Stored ${savedDocs.length} chunks`);

  return savedDocs; 
}

export async function createVectorIndex() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  try {
    const db = client.db(MONGO_DB);
    await db.command({
      createSearchIndexes: MONGO_COLL,
      indexes: [{
        name: "embedding_index",
        type: "vectorSearch",
        definition: {
          fields: [{
            type: "vector",
            path: "embedding",
            numDimensions: 768,
            similarity: "cosine",
          }],
        },
      }],
    });
    console.log("[Embedder]  Vector search index created");
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
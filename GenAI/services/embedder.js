import { GoogleGenerativeAI } from "@google/generative-ai";
import { MongoClient } from "mongodb";
import PDFChunk from '../models/PDFChunk.js';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const EMBED_MODEL = "gemini-embedding-2-preview";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB = process.env.MONGO_DB || "mindmap";
const MONGO_COLL = process.env.MONGO_COLL || "pdfchunks";
const CONCURRENCY = 5;

// Hàm nhúng 1 đoạn text lẻ (Giữ lại để dùng cho tính năng Chat/Suggest)
export async function embedText(text, taskType = 'RETRIEVAL_DOCUMENT') {
    // Nếu lỗi 404 vẫn lặp lại với text-embedding-004, hãy đổi tên model ở đây về 'gemini-embedding-2-preview'
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-2-preview' });
    const result = await model.embedContent({
        content: { role: 'user', parts: [{ text }] },
        taskType: taskType,
    });
    return result.embedding.values;
}

// Hàm BATCH MỚI: Gửi hàng chục chunk trong 1 request duy nhất!
export async function embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
    // Sử dụng model nhúng bản mới nhất
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-2-preview' }); 
    
    // Đóng gói mảng text theo chuẩn của hàm batchEmbedContents
    const requests = texts.map(text => ({
        content: { role: 'user', parts: [{ text }] },
        taskType: taskType,
    }));

    try {
        // TUYỆT ĐỐI KHÔNG DÙNG Promise.all Ở ĐÂY NỮA
        // Hàm này gom tất cả text vào 1 API call, tiết kiệm 99% Quota!
        const result = await model.batchEmbedContents({ requests });
        return result.embeddings.map(e => e.values);
    } catch (error) {
        console.error("[Embedder] Lỗi batchEmbedContents:", error.message);
        
        // Nếu dính lỗi 404 do thư viện cũ, ta fallback tạm về model cũ
        if (error.status === 404) {
            console.log("[Embedder] Model mới bị 404, fallback về gemini-embedding-2-preview...");
            const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-embedding-2-preview' });
            const fallbackResult = await fallbackModel.batchEmbedContents({ requests });
            return fallbackResult.embeddings.map(e => e.values);
        }
        
        throw error;
    }
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
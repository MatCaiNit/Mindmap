import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
dotenv.config()

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' })

// Embed 1 text → vector 768 chiều
export async function embedText(text) {
  const result = await embeddingModel.embedContent(text)
  return result.embedding.values
}

// Batch embed nhiều texts (nhanh hơn 10x so với gọi lẻ)
export async function embedBatch(texts) {
  const requests = texts.map(text => ({
    content: { parts: [{ text }] }
  }))
  const result = await embeddingModel.batchEmbedContents({ requests })
  return result.embeddings.map(e => e.values)
}

// Cosine similarity — dùng để retrieve
export function cosineSimilarity(a, b) {
  const dot  = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  return dot / (magA * magB)
}
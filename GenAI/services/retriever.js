import PDFChunk from '../models/PDFChunk.js'
import { embedText, cosineSimilarity } from './embedder.js'

// Tìm top-K chunks liên quan bằng cosine similarity
export async function retrieveRelevantChunks(mindmapId, query, topK = 5) {
  const queryVector = await embedText(query)
  const chunks      = await PDFChunk.find({ mindmapId }).lean()

  if (!chunks.length) return []

  return chunks
    .filter(c => c.embedding?.length > 0)
    .map(c => ({ ...c, score: cosineSimilarity(queryVector, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

export async function getAllChunks(mindmapId) {
  return PDFChunk.find({ mindmapId }).sort({ chunkIndex: 1 }).lean()
}
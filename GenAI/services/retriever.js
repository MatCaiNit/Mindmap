// import mongoose from 'mongoose'
// import PdfChunk from './models/PdfChunk.js'
// import { embedQuery } from './embedder.js'

// /**
//  * Tìm top-k chunks liên quan nhất với query
//  * Dùng MongoDB Atlas Vector Search
//  */
// export async function retrieveTopChunks(mindmapId, query, topK = 10) {
//   const queryEmbedding = await embedQuery(query)

//   // Atlas Vector Search aggregation pipeline
//   const results = await PdfChunk.aggregate([
//     {
//       $vectorSearch: {
//         index: 'pdf_embedding_index', // Tên index tạo trên Atlas UI
//         path:  'embedding',
//         queryVector: queryEmbedding,
//         numCandidates: topK * 10,
//         limit: topK,
//         filter: {
//           mindmapId: { $eq: mindmapId } // Chỉ tìm trong mindmap này
//         }
//       }
//     },
//     {
//       $project: {
//         text:       1,
//         page:       1,
//         chunkIndex: 1,
//         bbox:       1,
//         filename:   1,
//         score: { $meta: 'vectorSearchScore' }
//       }
//     }
//   ])

//   console.log(`🔍 Retrieved ${results.length} chunks for query: "${query}"`)
//   return results
// }

// /**
//  * Lấy tất cả chunks của một mindmap (dùng khi generate toàn bộ mindmap)
//  * Sort theo page để giữ thứ tự
//  */
// export async function getAllChunks(mindmapId) {
//   return PdfChunk.find({ mindmapId })
//     .sort({ page: 1, chunkIndex: 1 })
//     .select('-embedding') // Không cần embedding khi đọc text
//     .lean()
// }

// GenAI/services/retriever.js - PURE JS VERSION (local MongoDB)
import PdfChunk from '../models/PDFChunk.js'
import { embedQuery } from './embedder.js'

/**
 * Tìm top-k chunks liên quan nhất với query
 * Dùng cosine similarity thuần JS — không cần Atlas Vector Search
 */
export async function retrieveTopChunks(mindmapId, query, topK = 10) {
  // 1. Lấy tất cả chunks của mindmap từ MongoDB
  const chunks = await PdfChunk.find({ mindmapId })
    .select('text page bbox filename embedding chunkIndex')
    .lean()

  if (chunks.length === 0) {
    console.warn(`No chunks found for mindmapId: ${mindmapId}`)
    return []
  }

  console.log(`Scoring ${chunks.length} chunks for query: "${query}"`)

  // 2. Embed query
  const queryVector = await embedQuery(query)

  // 3. Tính cosine similarity với từng chunk
  const scored = chunks.map(chunk => ({
    text:       chunk.text,
    page:       chunk.page,
    bbox:       chunk.bbox,
    filename:   chunk.filename,
    chunkIndex: chunk.chunkIndex,
    score:      cosineSimilarity(queryVector, chunk.embedding)
  }))

  // 4. Sort descending và lấy top-k
  scored.sort((a, b) => b.score - a.score)
  const results = scored.slice(0, topK)

  console.log(`Top ${results.length} chunks | scores: ${results.map(r => r.score.toFixed(3)).join(', ')}`)
  return results
}

/**
 * Lấy tất cả chunks của một mindmap (sort theo page)
 */
export async function getAllChunks(mindmapId) {
  return PdfChunk.find({ mindmapId })
    .sort({ page: 1, chunkIndex: 1 })
    .select('-embedding')
    .lean()
}

// ── Helper ───────────────────────────────────────────────────────────────────

function cosineSimilarity(vecA, vecB) {
  if (!vecA?.length || !vecB?.length || vecA.length !== vecB.length) return 0

  let dot = 0, normA = 0, normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dot   += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
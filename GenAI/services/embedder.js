// GenAI/services/embedder.js

import PDFChunk from '../models/PDFChunk.js'
import { MongoClient } from 'mongodb'

const OLLAMA_BASE  = process.env.OLLAMA_URL        || 'http://localhost:11434'
const EMBED_MODEL  = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'
const EMBED_DIM    = parseInt(process.env.EMBED_DIM  || '768')


export async function embedBatch(texts) {
  if (!texts || texts.length === 0) return []

  const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[Embedder] /api/embed ${res.status}: ${err}`)
  }

  const data = await res.json()
  if (!Array.isArray(data.embeddings)) {
    throw new Error(`[Embedder] Bad response shape: ${JSON.stringify(data).slice(0, 200)}`)
  }

  return data.embeddings   // float[][]
}


export async function embedText(text) {
  const vecs = await embedBatch([text])
  return vecs[0]
}

// Safe chunked batch
export async function embedBatchSafe(texts, batchSize = 64) {
  const results = []
  const total   = Math.ceil(texts.length / batchSize)
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    console.log(`[Embedder] Batch ${Math.floor(i / batchSize) + 1}/${total} (${batch.length} texts)...`)
    results.push(...await embedBatch(batch))
  }
  return results
}


export async function embedAndStore(mindmapId, chunks, filename) {
  if (!chunks?.length) return []

  console.log(`[Embedder] Embedding ${chunks.length} chunks...`)
  const vectors = await embedBatchSafe(chunks.map(c => c.text))

  await PDFChunk.deleteMany({ mindmapId })

  const docs = chunks.map((chunk, i) => ({
    mindmapId,
    text:       chunk.text,
    pageNum:    chunk.pageNum,
    embedding:  vectors[i] ?? [],
    chunkIndex: chunk.chunkIndex ?? i,
    metadata: { filename, pageEstimate: chunk.pageNum },
  }))

  const saved = await PDFChunk.insertMany(docs)
  console.log(`[Embedder] Stored ${saved.length} chunks`)
  return saved
}


export async function createVectorIndex() {
  const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017')
  await client.connect()
  try {
    await client.db(process.env.MONGO_DB || 'mindmap').command({
      createSearchIndexes: process.env.MONGO_COLL || 'pdfchunks',
      indexes: [{
        name: 'vector_index',
        type: 'vectorSearch',
        definition: {
          fields: [{
            type:          'vector',
            path:          'embedding',
            numDimensions: EMBED_DIM,
            similarity:    'cosine',
          }],
        },
      }],
    })
    console.log('[Embedder] Vector index created')
  } catch (err) {
    if (err.codeName === 'IndexAlreadyExists') {
      console.log('[Embedder] Index already exists, skipping')
    } else {
      throw err
    }
  } finally {
    await client.close()
  }
}
// GenAI/utils/validate.js
// Changes: + cosineSimilarity helper needed by improved retriever

/**
 * Cosine similarity between two numeric arrays
 */
export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Validate that value is a non-empty string
 */
export function requireString(val, name) {
  if (typeof val !== 'string' || !val.trim()) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return val.trim()
}
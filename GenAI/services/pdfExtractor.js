import pdfParse from 'pdf-parse'

export async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer)
  return { text: data.text, pages: data.numpages }
}

// Chunk thông minh — sliding window có overlap
export function chunkText(text, options = {}) {
  const { chunkSize = 400, overlap = 80 } = options

  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 20)

  const chunks = []
  let currentChunk = ''
  let currentSize  = 0

  for (const para of paragraphs) {
    const paraWords = para.split(' ').length

    if (currentSize + paraWords > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim())
      // Giữ overlap để không mất context ở ranh giới chunk
      const words       = currentChunk.split(' ')
      const overlapText = words.slice(-overlap).join(' ')
      currentChunk = overlapText + ' ' + para
      currentSize  = overlap + paraWords
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para
      currentSize  += paraWords
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim())
  return chunks
}
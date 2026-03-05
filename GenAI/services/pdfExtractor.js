import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const pdfParse = require('pdf-parse')

export async function extractChunksFromPdf(buffer, filename = '') {
  const data = await pdfParse(buffer)

  const pages = data.text.split('\f')
  const chunks = []

  pages.forEach((pageText, pageIndex) => {
    const page = pageIndex + 1
    const cleaned = pageText.trim()
    if (!cleaned) return

    const paragraphs = splitIntoParagraphs(cleaned, 500)

    paragraphs.forEach((para, paraIdx) => {
      if (para.trim().length < 30) return

      chunks.push({
        filename,
        text: para.trim(),
        page,
        chunkIndex: paraIdx,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      })
    })
  })

  console.log(` Extracted ${chunks.length} chunks from ${pages.length} pages`)
  return chunks
}

/**
 * Chia text thành đoạn nhỏ theo số ký tự, không cắt giữa câu
 */
function splitIntoParagraphs(text, maxLength = 500) {
  // Thử tách theo đoạn văn trước
  const naturalParagraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)

  const result = []

  naturalParagraphs.forEach(para => {
    if (para.length <= maxLength) {
      result.push(para)
      return
    }

    // Đoạn quá dài → tách theo câu
    const sentences = para.match(/[^.!?]+[.!?]+/g) || [para]
    let current = ''

    sentences.forEach(sentence => {
      if ((current + sentence).length > maxLength && current) {
        result.push(current.trim())
        current = sentence
      } else {
        current += ' ' + sentence
      }
    })

    if (current.trim()) result.push(current.trim())
  })

  return result
}
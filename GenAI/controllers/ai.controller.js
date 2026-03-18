import { extractTextFromPDF, chunkText } from '../services/pdfExtractor.js';
import { embedAndStore } from '../services/embedder.js';
import { extractTextFromPDF, chunkText } from '../services/pdfExtractor.js'
import { embedAndStore } from '../services/embedder.js'

export async function generateFromPdf(req, res) {
  try {
    const { mindmapId, filename } = req.body
    if (!req.file)    return res.status(400).json({ error: 'Missing PDF' })
    if (!mindmapId)   return res.status(400).json({ error: 'Missing mindmapId' })

    // 1. Extract (Theo cấu trúc MỚI: bóc tách từng trang)
    const { pagesData, totalPages } = await extractTextFromPDF(req.file.buffer)

    // 2. Chunk (Theo cấu trúc MỚI: truyền mảng pagesData vào)
    // Các chunks lúc này đã tự động có sẵn thuộc tính .pageNum bên trong!
    const chunksWithMetadata = chunkText(pagesData, { chunkSize: 400, overlap: 80 })

    // 3. Xóa chunks cũ & Embed & Store (Dùng hàm đã fix rò rỉ kết nối)
    await embedAndStore(mindmapId, chunksWithMetadata, filename);

    // 4. Generate mindmap dùng RAG (Hãy gọi hàm generate từ ai.service.js của bạn)
    // Ví dụ: const result = await generateFromPdfService(mindmapId, filename);

    res.json({ 
      ok: true, 
      // structure: result.mindmap, 
      meta: { filename, pages: totalPages, totalChunks: chunksWithMetadata.length } 
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
/**
 * GenAI/services/pdfExtractor.js  –  UPGRADED
 * ==========================================
 * Cải tiến:
 * 1. Dùng pdfjs-dist để đọc chính xác từng trang PDF.
 * 2. Trả về mảng [{ pageNum: 1, text: "..." }, ...] thay vì 1 cục text khổng lồ.
 * 3. Hàm chunkText được nâng cấp để giữ nguyên metadata số trang cho từng chunk.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

// Vô hiệu hóa worker trong môi trường Node.js để tránh lỗi
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

/**
 * Đọc file PDF từ bộ nhớ (Buffer) và trích xuất chữ theo từng trang.
 * @param {Buffer} buffer - File buffer từ multer
 * @returns {Promise<{pagesData: Array, totalPages: number}>}
 */
export async function extractTextFromPDF(buffer) {
  try {
    // Chuyển Buffer của Node.js thành Uint8Array để pdf.js có thể đọc
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    
    const numPages = pdfDocument.numPages;
    const pagesData = [];

    // Lặp qua từng trang để bóc tách chữ
    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      
      // Các chữ trong PDF thường bị rời rạc, ta nối chúng lại bằng dấu cách
      const textItems = textContent.items.map(item => item.str);
      const pageText = textItems.join(' ');
      
      // Xóa các khoảng trắng thừa
      const cleanedText = pageText.replace(/\s+/g, ' ').trim();

      pagesData.push({
        pageNum: i,
        text: cleanedText
      });
    }

    console.log(`[PDF Extractor] ✅ Trích xuất thành công ${numPages} trang.`);
    return { pagesData, totalPages: numPages };
  } catch (error) {
    console.error("[PDF Extractor] Lỗi khi đọc file PDF:", error);
    throw new Error("Không thể trích xuất nội dung từ file PDF này.");
  }
}

/**
 * Cắt nhỏ text theo từng trang (sliding window có overlap)
 * Khác với bản cũ, bản này sẽ KHÔNG cắt lẹm từ trang này sang trang kia,
 * đảm bảo Chunk số 1 chắc chắn thuộc Trang số 1.
 * * @param {Array} pagesData - Mảng [{ pageNum, text }] từ hàm extract
 * @param {Object} options - Cấu hình chunk
 * @returns {Array} - Mảng các chunks [{ text, pageNum }]
 */
export function chunkText(pagesData, options = {}) {
  const { chunkSize = 400, overlap = 80 } = options;
  const chunks = [];

  for (const page of pagesData) {
    const { pageNum, text } = page;
    
    // Tách text của trang thành mảng các từ
    const words = text.split(' ');
    let startIndex = 0;

    while (startIndex < words.length) {
      // Lấy ra số lượng từ bằng chunkSize
      const endIndex = Math.min(startIndex + chunkSize, words.length);
      const chunkWords = words.slice(startIndex, endIndex);
      const chunkTextStr = chunkWords.join(' ');

      // Bỏ qua các chunk quá ngắn (rác dữ liệu)
      if (chunkTextStr.trim().length > 20) {
        chunks.push({
          text: chunkTextStr,
          pageNum: pageNum // GIÁ TRỊ QUAN TRỌNG NHẤT ĐỂ TRACEBACK!
        });
      }

      // Nhích cửa sổ lên, trừ đi phần overlap để giữ văn cảnh
      startIndex += (chunkSize - overlap);
    }
  }

  return chunks;
}
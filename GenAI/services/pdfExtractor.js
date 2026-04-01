/**
 * GenAI/services/pdfExtractor.js
 * ==========================================
 * Giải pháp: Dùng pdf-parse nhưng hook vào pagerender để lấy text từng trang.
 * Chạy cực kỳ ổn định trên Node.js, không lo lỗi Worker.
 */

import pdfParse from 'pdf-parse';

export async function extractTextFromPDF(buffer) {
  try {
    const pagesData = [];

    // Hàm này sẽ được pdf-parse gọi tự động cho mỗi trang PDF nó đọc được
    const render_page = async function(pageData) {
      // pageData chính là đối tượng của pdf.js bên dưới hood
      const textContent = await pageData.getTextContent();
      
      // Nối các đoạn text rời rạc trên 1 trang lại
      const text = textContent.items.map(item => item.str).join(' ');
      const cleanedText = text.replace(/\s+/g, ' ').trim();

      // Lưu vào mảng của chúng ta kèm theo SỐ TRANG
      pagesData.push({
        pageNum: pageData.pageNumber, // pageNumber bắt đầu từ 1
        text: cleanedText
      });

      // pdf-parse cần trả về string để nó nối thành 1 cục text bự (dù ta không xài tới)
      return cleanedText;
    };

    const options = {
      pagerender: render_page
    };

    // Đẩy buffer vào pdf-parse kèm theo hàm hook của chúng ta
    await pdfParse(buffer, options);

    console.log(`[PDF Extractor]  Trích xuất thành công ${pagesData.length} trang.`);
    return { pagesData, totalPages: pagesData.length };
    
  } catch (error) {
    console.error("[PDF Extractor] Lỗi thực sự từ thư viện:", error);
    throw new Error(`Không thể trích xuất nội dung từ file PDF này. Chi tiết: ${error.message}`);
  }
}

// Hàm chunkText giữ nguyên như cũ, vì nó đã hoạt động hoàn hảo với mảng pagesData
export function chunkText(pagesData, { maxChunkSize = 1000, overlap = 200 } = {}) {
  const chunks = [];
  let globalChunkIndex = 0;

  for (const page of pagesData) {
    const sentences = page.text.match(/[^.!?\n]+[.!?\n]+/g) || [page.text];

    let currentChunkText = "";

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;
      if (sentence.length > maxChunkSize) {
        if (currentChunkText) {
          chunks.push({
            pageNum: page.pageNum,
            chunkIndex: globalChunkIndex++,
            text: currentChunkText.trim()
          });
          currentChunkText = "";
        }
        
        for (let j = 0; j < sentence.length; j += maxChunkSize) {
          chunks.push({
            pageNum: page.pageNum,
            chunkIndex: globalChunkIndex++,
            text: sentence.slice(j, j + maxChunkSize).trim()
          });
        }
        continue;
      }

      if ((currentChunkText.length + sentence.length) > maxChunkSize && currentChunkText.length > 0) {
        chunks.push({
          pageNum: page.pageNum,
          chunkIndex: globalChunkIndex++,
          text: currentChunkText.trim()
        });

        let overlapText = "";
        let backIndex = i - 1;
        while (backIndex >= 0 && overlapText.length < overlap) {
          overlapText = sentences[backIndex].trim() + " " + overlapText;
          backIndex--;
        }

        currentChunkText = overlapText.trim() + " " + sentence;
      } else {
        currentChunkText += (currentChunkText ? " " : "") + sentence;
      }
    }

    if (currentChunkText.trim().length > 0) {
      chunks.push({
        pageNum: page.pageNum,
        chunkIndex: globalChunkIndex++,
        text: currentChunkText.trim()
      });
    }
  }

  return chunks;
}
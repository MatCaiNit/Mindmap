import pdfParse from 'pdf-parse';

export async function extractTextFromPDF(buffer) {
    const pagesData = [];
    const render_page = async function(pageData) {
        const textContent = await pageData.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        const cleanedText = text.replace(/\s+/g, ' ').trim();
        pagesData.push({ pageNum: pageData.pageNumber, text: cleanedText });
        return cleanedText;
    };
    await pdfParse(buffer, { pagerender: render_page });
    return { pagesData };
}

export function chunkText(pagesData, { maxChunkSize = 1000, overlap = 200 } = {}) {
    const chunks = [];
    let globalChunkIndex = 0;

    for (const page of pagesData) {
        const sentences = page.text.match(/[^.!?\n]+[.!?\n]+/g) || [page.text];
        let currentChunk = "";

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim();
            if ((currentChunk.length + sentence.length) > maxChunkSize && currentChunk.length > 0) {
                chunks.push({
                    pageNum: page.pageNum,
                    chunkIndex: globalChunkIndex++,
                    text: currentChunk.trim()
                });
                currentChunk = currentChunk.slice(-overlap) + " " + sentence;
            } else {
                currentChunk += (currentChunk ? " " : "") + sentence;
            }
        }
        if (currentChunk) {
            chunks.push({ pageNum: page.pageNum, chunkIndex: globalChunkIndex++, text: currentChunk.trim() });
        }
    }
    return chunks;
}

export function groupChunksToParts(chunks, chunkSize = 15) {
    const parts = [];
    for (let i = 0; i < chunks.length; i += chunkSize) {
        parts.push(chunks.slice(i, i + chunkSize));
    }
    return parts;
}

export function analyzeStructure(pagesData) {
    // Tìm các từ khóa báo hiệu Mục lục
    const tocPattern = /(mục lục|content|table of contents|1\.|1\.1)/i;
    // Tìm các dòng in hoa ngắn (Khả năng cao là Headings)
    const headings = pagesData
        .slice(0, 10)
        .flatMap(p => p.text.split('. '))
        .filter(sentence => sentence.length < 60 && sentence === sentence.toUpperCase());

    const hasTOC = pagesData.slice(0, 5).some(p => tocPattern.test(p.text));
    
    return {
        hasTOC: hasTOC,
        headings: headings, // Trả về mảng rỗng nếu không có, giúp không bị lỗi .length
        isStructured: hasTOC || headings.length >= 3,
        recommendation: (hasTOC || headings.length >= 3) ? "CHAPTER_BASED" : "SEMANTIC_WINDOW"
    };
}

export function chunkByStructure(pagesData, structureInfo) {
    const chunks = [];
    let currentChunkText = "";
    let globalChunkIndex = 0;
    let currentPage = 1;

    // Regex nhận diện Tiêu đề (Headings) chuẩn Việt Nam:
    // Bắt các mẫu: "CHƯƠNG 1", "PHẦN I", "I.", "1.", "1.1", "1.1.1"
    const headingRegex = /^(CHƯƠNG\s+\d+|PHẦN\s+[IVX]+|[IVX]+\.|[1-9]+\.\d*)\b/i;

    for (const page of pagesData) {
        currentPage = page.pageNum;
        
        // Tách trang thành các câu/dòng dựa trên dấu câu hoặc xuống dòng
        const sentences = page.text.match(/[^.!?\n]+[.!?\n]+/g) || [page.text];

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim();
            if (!sentence) continue;

            // KIỂM TRA: Câu này có phải là Tiêu đề không?
            // Điều kiện: Khớp Regex và độ dài ngắn (< 150 ký tự) để tránh bắt nhầm đoạn văn
            const isHeading = headingRegex.test(sentence) && sentence.length < 150;

            if (isHeading) {
                // Nếu tìm thấy Tiêu đề mới -> Đóng gói "Chương" cũ lại thành Chunk
                if (currentChunkText.trim().length > 0) {
                    // Nếu Chương cũ quá dài (ví dụ > 1200 ký tự), phải tự động cắt nhỏ nó ra (Sub-chunking)
                    const subChunks = subChunkLongText(currentChunkText, currentPage, globalChunkIndex);
                    chunks.push(...subChunks);
                    globalChunkIndex += subChunks.length;
                }
                
                // Mở đầu một Chunk mới với Tiêu đề vừa tìm được
                currentChunkText = sentence;
            } else {
                // Gom nội dung vào Chương hiện tại
                currentChunkText += (currentChunkText ? " " : "") + sentence;
            }
        }
    }

    // Đóng gói đoạn text cuối cùng của cuốn sách
    if (currentChunkText.trim().length > 0) {
        const subChunks = subChunkLongText(currentChunkText, currentPage, globalChunkIndex);
        chunks.push(...subChunks);
    }

    return chunks;
}

// Hàm phụ trợ: Cắt nhỏ nội dung nếu một Chương quá dài (tránh vỡ Context Window của AI)
function subChunkLongText(text, pageNum, startIndex, maxLen = 1200, overlap = 200) {
    if (text.length <= maxLen) {
        return [{ pageNum, chunkIndex: startIndex, text: text.trim() }];
    }

    const results = [];
    let currentIndex = 0;
    let localIdx = 0;

    while (currentIndex < text.length) {
        let chunkStr = text.slice(currentIndex, currentIndex + maxLen);
        results.push({
            pageNum: pageNum, 
            chunkIndex: startIndex + localIdx,
            text: chunkStr.trim()
        });
        currentIndex += maxLen - overlap;
        localIdx++;
    }
    return results;
}
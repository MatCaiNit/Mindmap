// GenAI/services/pdfExtractor.js
import pdfParse from 'pdf-parse';

export async function extractTextFromPDF(buffer) {
    const pagesData = [];
    const render_page = async function(pageData) {
        const textContent = await pageData.getTextContent();
        // Giữ lại dấu xuống dòng để phân biệt các đoạn văn (paragraph) và tiêu đề
        const text = textContent.items.map(item => item.str).join('\n');
        
        // Làm sạch: gom nhiều khoảng trắng/xuống dòng thừa thành 1 hoặc 2
        const cleanedText = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        pagesData.push({ pageNum: pageData.pageNumber, text: cleanedText });
        return cleanedText;
    };
    await pdfParse(buffer, { pagerender: render_page });
    return { pagesData };
}

export function analyzeStructure(pagesData) {
    const sampleText = pagesData.slice(0, 10).map(p => p.text).join('\n');
    
    // 1. Check Mục lục (TOC)
    const tocPattern = /(mục lục|table of contents|contents|danh mục)/i;
    const hasTOC = tocPattern.test(sampleText);

    // 2. Check Tiêu đề (Headings) - Bắt nhiều format hơn
    // Mẫu: 1. / 1.1 / Chương 1 / Phần 1 / Bài 1 / CHỮ IN HOA TOÀN BỘ (ngắn)
    const lines = sampleText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const headingRegex = /^(CHƯƠNG\s+\d+|PHẦN\s+[IVX]+|BÀI\s+\d+|[IVX]+\.|[1-9]+\.\d*)\b/i;
    
    let headingCount = 0;
    lines.forEach(line => {
        if (headingRegex.test(line) && line.length < 100) headingCount++;
        // Bắt các dòng in hoa toàn bộ, độ dài ngắn (khả năng là tiêu đề)
        else if (line === line.toUpperCase() && line.length > 5 && line.length < 80) headingCount++;
    });

    let docType = "UNSTRUCTURED";
    if (hasTOC) docType = "TOC";
    else if (headingCount >= 4) docType = "HEADINGS";

    return {
        docType,
        isStructured: docType !== "UNSTRUCTURED",
        recommendation: docType === "UNSTRUCTURED" ? "SEMANTIC_CHUNK" : "STRUCTURE_CHUNK"
    };
}

export function chunkText(pagesData, { maxChunkSize = 1500, overlap = 300 } = {}) {
    // Dành cho Unstructured: Chunk theo ĐOẠN VĂN (Paragraph) thay vì cắt ngang câu
    const chunks = [];
    let globalChunkIndex = 0;

    for (const page of pagesData) {
        // Tách theo xuống dòng kép (hoặc đơn) để lấy đoạn văn
        const paragraphs = page.text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
        let currentChunk = "";

        for (const para of paragraphs) {
            if ((currentChunk.length + para.length) > maxChunkSize && currentChunk.length > 0) {
                chunks.push({
                    pageNum: page.pageNum,
                    chunkIndex: globalChunkIndex++,
                    text: currentChunk.trim()
                });
                // Overlap: Giữ lại một phần đoạn trước đó
                currentChunk = currentChunk.slice(-overlap) + "\n" + para;
            } else {
                currentChunk += (currentChunk ? "\n" : "") + para;
            }
        }
        if (currentChunk.trim()) {
            chunks.push({ pageNum: page.pageNum, chunkIndex: globalChunkIndex++, text: currentChunk.trim() });
        }
    }
    return chunks;
}

export function chunkByStructure(pagesData, structureInfo) {
    // Gom nhóm theo cấu trúc (Chương/Phần/Tiêu đề in hoa)
    const chunks = [];
    let currentChunkText = "";
    let globalChunkIndex = 0;
    let currentPage = 1;

    const headingRegex = /^(CHƯƠNG\s+\d+|PHẦN\s+[IVX]+|BÀI\s+\d+|[IVX]+\.|[1-9]+\.\d*)\b/i;

    for (const page of pagesData) {
        currentPage = page.pageNum;
        const lines = page.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        for (const line of lines) {
            const isHeading = (headingRegex.test(line) || (line === line.toUpperCase() && line.length > 5)) && line.length < 100;

            if (isHeading) {
                if (currentChunkText.trim().length > 0) {
                    chunks.push({ pageNum: currentPage, chunkIndex: globalChunkIndex++, text: currentChunkText.trim() });
                }
                // Đánh dấu Markdown ảo để LLM dễ nhận diện
                currentChunkText = `## ${line}\n`; 
            } else {
                currentChunkText += line + " ";
            }
        }
    }

    if (currentChunkText.trim().length > 0) {
        chunks.push({ pageNum: currentPage, chunkIndex: globalChunkIndex++, text: currentChunkText.trim() });
    }

    return chunks;
}
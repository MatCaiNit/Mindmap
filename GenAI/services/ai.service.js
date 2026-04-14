// GenAI/services/ai.service.js

import { GoogleGenerativeAI } from '@google/generative-ai'
import PDFChunk from '../models/PDFChunk.js'
import { extractTextFromPDF, chunkText, analyzeStructure, chunkByStructure } from './pdfExtractor.js'
import { embedText, embedBatch, embedAndStore } from './embedder.js'
import { calculateMetrics } from '../utils/validate.js' 
import { HybridRetriever } from './retriever.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite' 
const TOP_K = 5
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function parseJSON(raw) {
    const clean = raw.replace(/```json|```/g, '').trim()
    try { return JSON.parse(clean) } catch (_) {
        const m = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
        if (m) return JSON.parse(m[0])
        throw new Error('AI returned invalid JSON')
    }
}

async function getAiModel(useSearch = false) {
    if (useSearch && process.env.GEMINI_SEARCH_GROUNDING === 'true') {
        return genAI.getGenerativeModel({
            model: MODEL_NAME,
            tools: [{ googleSearch: {} }],
        })
    }
    return genAI.getGenerativeModel({ model: MODEL_NAME })
}

export async function generateFromPdf(fileBuffer, filename, mindmapId) {
    console.log(`\n[AI] generateFromPdf — ${filename} (${mindmapId})`);

    const { pagesData } = await extractTextFromPDF(fileBuffer);
    console.log(`[AI]  Extracted ${pagesData.length} pages`);

    const structureInfo = analyzeStructure(pagesData);
    let isStructured = structureInfo.isStructured;
    let rawChunks = [];
    
    if (isStructured) {
        console.log(`[AI] Tài liệu CÓ CẤU TRÚC: [${structureInfo.docType}]`);
        rawChunks = chunkByStructure(pagesData, structureInfo);
    } else {
        console.log("[AI] Tài liệu KHÔNG CẤU TRÚC (Plain Text).");
        rawChunks = chunkText(pagesData, { maxChunkSize: 1500, overlap: 300 });
    }

    // Embed & Lưu Database (Phục vụ cho tính năng RAG Suggest/Chat sau này)
    // Code nhúng của bạn giữ nguyên
    const BATCH = 100; // Giảm xuống 15 chunk mỗi lần gửi
    const embeddings = [];
    
    console.log(`[AI] Bắt đầu nhúng ${rawChunks.length} chunks...`);
    for (let i = 0; i < rawChunks.length; i += BATCH) {
        const batch = rawChunks.slice(i, i + BATCH).map(c => c.text);
        
        try {
            const vecs = await embedBatch(batch, 'RETRIEVAL_DOCUMENT');
            embeddings.push(...vecs);
            console.log(`[AI]  Đã nhúng xong batch ${i / BATCH + 1}`);
            
            // Delay để tránh Rate Limit (100 req/min của Free Tier)
            // Lấy 15 req mỗi batch -> 1 phút gửi được ~6 batch (90 req) -> Đợi 10s/batch là an toàn
            if (i + BATCH < rawChunks.length) {
                await sleep(10000); // Nghỉ 10 giây
            }
        } catch (error) {
            console.error(`[AI] Lỗi khi nhúng batch ${i / BATCH + 1}:`, error.message);
            // Nếu vẫn dính 429, đợi hẳn 35s (như log yêu cầu) rồi cho chạy lại batch này
            if (error.status === 429) {
                console.log("[AI] Dính Rate Limit, nghỉ 35 giây rồi thử lại...");
                await sleep(35000);
                i -= BATCH; // Lùi index lại để retry batch này ở vòng lặp sau
            } else {
                throw error; // Lỗi khác thì quăng ra luôn
            }
        }
    }

    await PDFChunk.deleteMany({ mindmapId });
    const saved = await PDFChunk.insertMany(rawChunks.map((c, idx) => ({
        mindmapId, text: c.text, pageNum: c.pageNum, chunkIndex: idx, embedding: embeddings[idx] || []
    })));
    console.log(`[AI]  Stored ${saved.length} chunks successfully`);

    // ==========================================
    // CƠ CHẾ SINH MINDMAP CHI TIẾT (MAP-REDUCE NẾU QUÁ DÀI)
    // ==========================================
    const model = await getAiModel(false);
    let mindmap;

    // Thay vì drop text, gom nhóm tối đa để tận dụng context. 
    // Nếu sách siêu dài (vd > 50 chunks to), chia làm nhiều phần để build, rồi ghép lại (Map-Reduce).
    const MAX_CHUNKS_PER_PROMPT = 35; // Tùy vào limit token của model bạn xài (Flash/Pro)
    
    if (saved.length <= MAX_CHUNKS_PER_PROMPT) {
        // Xử lý 1 lần (Single-pass)
        mindmap = await generateDeepMindmap(saved, filename, model, structureInfo.docType);
    } else {
        // Map-Reduce cho sách dài
        console.log(`[AI] File dài (${saved.length} chunks) -> Kích hoạt Map-Reduce...`);
        const parts = [];
        for (let i = 0; i < saved.length; i += MAX_CHUNKS_PER_PROMPT) {
            const partChunks = saved.slice(i, i + MAX_CHUNKS_PER_PROMPT);
            const partMindmap = await generateDeepMindmap(partChunks, `${filename} - Phần ${i / MAX_CHUNKS_PER_PROMPT + 1}`, model, structureInfo.docType);
            parts.push(partMindmap);
        }
        // Gộp các phần lại
        mindmap = await stitchMindmaps(parts, filename, model);
    }

    const rawPdfText = saved.map(c => c.text || "").join(' ');
    let evaluationReport = { status: "Skipped", metrics: {} };
    
    try {
        evaluationReport = calculateMetrics(mindmap, rawPdfText);
        console.log("\n" + "=".repeat(30));
        console.log("📊 BÁO CÁO CHẤT LƯỢNG MINDMAP");
        console.table(evaluationReport.metrics);
        console.log("Trạng thái:", evaluationReport.status);
        console.log("=".repeat(30) + "\n");
    } catch (e) {
        console.log("[AI] Evaluation failed:", e.message);
    }

    return {
        ok: true,
        mindmap,
        chunks: saved.map(c => ({ _id: c._id, text: c.text, pageNum: c.pageNum, chunkIndex: c.chunkIndex })),
        meta: { totalChunks: saved.length }
    };
}

// HÀM GENERATE LÕI - ÉP SÂU TỚI LEVEL 5
async function generateDeepMindmap(chunks, filename, model, docType) {
    const contextStr = chunks.map(c => `[Chunk:${c.chunkIndex}|Page:${c.pageNum}]\n${c.text}`).join('\n---\n');

    const prompt = `Bạn là một AI chuyên trích xuất dữ liệu sâu (Deep Extraction) để tạo Mindmap giống hệ thống Xmind.
Tài liệu này được phân loại là: ${docType}.
Dữ liệu đầu vào:
${contextStr}

YÊU CẦU BẮT BUỘC ĐỂ TẠO MINDMAP SIÊU CHI TIẾT:
1. Độ sâu phân cấp (Depth): Phải đạt từ 5 đến 6 level. KHÔNG được dừng lại ở ý chung chung.
   - Level 0: Tên file / Chủ đề chính
   - Level 1 (Chương/Phần): Các nhánh lớn (vd: 1. Giới thiệu)
   - Level 2 (Mục): Các chủ đề con (vd: 1.1. Lịch sử hình thành)
   - Level 3 (Chi tiết): Các khái niệm, quy trình (vd: 1.1.1. Giai đoạn sơ khai)
   - Level 4 (Con số/Sự kiện): Các fact cụ thể (vd: 1.1.1.1. Năm 1990 ra mắt phiên bản đầu)
   - Level 5 (Lá - Tận cùng): Giải thích, trích dẫn, hoặc hậu quả (vd: 1.1.1.1.a. Tạo ra doanh thu 2 triệu USD).
2. Tận dụng tối đa nội dung: Bóc tách MỌI định nghĩa, MỌI danh sách, MỌI con số và quy trình đưa vào level 4 và 5.
3. Node "sourceChunk": Bắt buộc có ở mọi node (từ level 1 trở đi) để trace lại xem nó lấy từ Chunk nào.

TRẢ VỀ DUY NHẤT ĐỊNH DẠNG JSON (Không giải thích, không bọc text markdown):
{
  "root": {
    "text": "${filename}",
    "sourceChunk": null,
    "children": [
      {
        "text": "[Level 1] Tên Chương/Nhánh",
        "sourceChunk": 0,
        "children": [
           // ... Tiếp tục lồng sâu xuống Level 2, 3, 4, 5...
        ]
      }
    ]
  }
}`;

    const res = await model.generateContent(prompt);
    return parseJSON(res.response.text());
}

// HÀM GHÉP (REDUCE) NẾU FILE QUÁ DÀI
async function stitchMindmaps(mindmapParts, filename, model) {
    // Thu gọn JSON các phần để tiết kiệm token
    const partsString = mindmapParts.map((m, i) => `Phần ${i+1}:\n${JSON.stringify(m)}`).join('\n\n');
    
    const prompt = `Tôi có các mảnh JSON của một Mindmap khổng lồ được trích xuất từ tài liệu "${filename}".
Nhiệm vụ của bạn là HỢP NHẤT chúng thành một JSON Mindmap duy nhất.

Quy tắc:
1. Root node duy nhất là "${filename}".
2. Gom các nhánh (Level 1) của các phần lại làm con của Root.
3. TUYỆT ĐỐI GIỮ NGUYÊN cấu trúc chi tiết (Level 2, 3, 4, 5) của các nhánh con, KHÔNG ĐƯỢC tóm tắt hay cắt gọt đi. Giữ nguyên toàn bộ dữ liệu lá.
4. Trả về đúng định dạng JSON chuẩn.

Dữ liệu:
${partsString}`;

    const res = await model.generateContent(prompt);
    return parseJSON(res.response.text());
}

async function processUnstructuredFile(chunks, filename, model) {
    const parts = [];
    const groupSize = 20; 

    for (let i = 0; i < chunks.length; i += groupSize) {
        const context = chunks.slice(i, i + groupSize).map(c => c.text).join('\n');
        const prompt = `Phân tích đoạn văn bản sau và tạo sơ đồ tư duy CHI TIẾT (Depth Level 5+). 
                        Mục tiêu: Trích xuất các con số, định nghĩa và quy trình cụ thể.
                        Dữ liệu: ${context}
                        Trả về định dạng JSON: {"root": {"text": "...", "children": [...]}}`;
        
        const res = await model.generateContent(prompt);
        parts.push(res.response.text());
    }

    
    const stitchPrompt = `Hợp nhất các phần sơ đồ sau thành một Master Mindmap duy nhất cho tài liệu "${filename}". 
                         QUY TẮC:
                         1. Loại bỏ các ý trùng lặp.
                         2. Giữ lại các chi tiết sâu nhất (level 5-6).
                         3. Root node phải là "${filename}".
                         Dữ liệu các phần: ${parts.join('\n')}`;

    const finalRes = await model.generateContent(stitchPrompt);
    return parseJSON(finalRes.response.text());
}


async function processStructuredFile(chunks, filename, model) {
    //Dùng toàn bộ chunks được truyền vào (thay vì chỉ cắt 20 chunks đầu tiên)
    const contextStr = chunks
        .map(c => `[${c.chunkIndex}|p${c.pageNum}] ${c.text.slice(0, 800)}`)
        .join('\n---\n');

    const prompt = `Bạn là một chuyên gia Mindmap. Tài liệu "${filename}" có cấu trúc rõ ràng (có mục lục/tiêu đề).
Dựa trên các đoạn trích dẫn sau (định dạng: [chunk:N|page:P] nội dung):

${contextStr}

Hãy tạo một Mindmap CỰC KỲ CHI TIẾT.

YÊU CẦU BẮT BUỘC:
1. Cây thư mục PHẢI có ít nhất 4-5 tầng (root -> chương -> phần -> chi tiết -> thông số/định nghĩa cụ thể).
2. Tuyệt đối KHÔNG trả về "children": [] ở các node trên cùng. Phải phân tích thật sâu để tạo ra các nhánh con.
3. Node lá (tầng cuối cùng) phải chứa các định nghĩa, con số, hoặc ví dụ cụ thể từ văn bản.
4. Mỗi node phải có "sourceChunk" (số nguyên tương ứng với đoạn trích).
5. Trả về DUY NHẤT mã JSON hợp lệ, không giải thích, không bọc markdown.

JSON schema (BẮT BUỘC tuân thủ cấu trúc lồng nhau này):
{
  "root": {
    "text": "Tên tài liệu / Chủ đề chính",
    "sourceChunk": null,
    "children": [
      {
        "text": "Tên Chương / Nhánh 1",
        "sourceChunk": 0,
        "children": [
          {
            "text": "Tiêu đề phụ (Phần 1.1)",
            "sourceChunk": 1,
            "children": [
              {
                "text": "Chi tiết quan trọng",
                "sourceChunk": 2,
                "children": [
                  {
                    "text": "Giải thích cụ thể, định nghĩa, thông số hoặc ví dụ",
                    "sourceChunk": 3,
                    "children": []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}`;
    
    const res = await model.generateContent(prompt);
    return parseJSON(res.response.text());
}



export async function generateFromPrompt(promptText) {
  console.log(`\n[AI] generateFromPrompt — "${promptText.slice(0, 80)}..."`)

  const model = await getAiModel(true)

  const prompt = `Create a comprehensive mindmap about: "${promptText}"

CRITICAL RULES:
1. The tree MUST have AT LEAST 4 levels of depth (root=level0, branches=level1, sub-branches=level2, details=level3, specifics=level4)
2. Sources — MANDATORY for every non-root node:
   • "url": a REAL, currently accessible URL. Prefer Wikipedia (en.wikipedia.org), \
official documentation sites (developer.mozilla.org, docs.python.org, etc.), \
government portals, well-known educational sites.
   • "title": the actual page title.
   • "searchText": a short phrase of 6–12 words that VERBATIM EXISTS on that page. \
This is used for browser text highlighting, so it must be exact.
   • If you are not confident a URL is real and accessible, use a reputable Wikipedia \
or MDN page that covers the topic instead — never invent URLs.
3. Root node: concise title (3-6 words max)
4. Level 1 nodes (branches): short category names (2-4 words), 4-6 branches total
5. Level 2 nodes (sub-branches): short sub-topic labels (2-5 words), 2-4 per branch
6. Level 3 nodes (details): medium descriptions (5-12 words), 2-3 per sub-branch  
7. Level 4 nodes (leaf specifics): DETAILED explanations (10-25 words with concrete facts, examples, numbers, or explanations). These are the most informative nodes.
8. Set "aiGenerated": true on every node.
9. Return ONLY valid JSON — no markdown, no explanation.

Example of a GOOD source object:
{
  "title": "Mind map — Wikipedia",
  "url": "https://en.wikipedia.org/wiki/Mind_map",
  "searchText": "visual thinking tool that helps structure information"
}

JSON schema (follow exactly):
{
  "root": {
    "text": "Topic",
    "aiGenerated": true,
    "children": [
      {
        "text": "Branch",
        "aiGenerated": true,
        "sources": [
          {
            "title": "string",
            "url": "https://en.wikipedia.org/wiki/Concept_map",
            "searchText": "exact short phrase from that page"
          }
        ],
        "children": [
          {
            "text": "Sub-node",
            "aiGenerated": true,
            "sources": [
              {
                "title": "string",
                "url": "https://...",
                "searchText": "exact phrase"
              }
            ]
          }
        ]
      }
    ]
  }
}`

  const result = await model.generateContent(prompt)
  const raw = result.response.text()

  let groundingSources = []
  try {
    const meta = result.response.candidates?.[0]?.groundingMetadata
    if (meta?.groundingChunks) {
      groundingSources = meta.groundingChunks
        .filter(c => c.web?.uri)
        .map(c => ({ title: c.web.title || c.web.uri, url: c.web.uri }))
    }
  } catch (_) { /* grounding not available */ }

  const mindmap = parseJSON(raw)

  if (groundingSources.length > 0) {
    attachGroundingSources(mindmap.root, groundingSources)
  }

  sanitiseSources(mindmap.root)

  return { ok: true, mindmap, groundingSources }
}

function attachGroundingSources(node, sources) {
  if (!node) return
  if (!node.sources?.length && sources.length) {
    node.sources = sources.slice(0, 2)
  }
  ;(node.children || []).forEach(c => attachGroundingSources(c, sources))
}

function sanitiseSources(node) {
  if (!node) return
  if (Array.isArray(node.sources)) {
    node.sources = node.sources.filter(s => {
      if (!s?.url) return false
      try {
        const u = new URL(s.url)
        if (['localhost', '127.0.0.1', 'example.com'].includes(u.hostname)) return false
        if (!['http:', 'https:'].includes(u.protocol)) return false
        return true
      } catch (_) { return false }
    })
  }
  ;(node.children || []).forEach(sanitiseSources)
}

export async function suggestNodes(context) {
  const { currentNode, parentNodes = [], siblings = [], mindmapId } = context
  console.log(`[AI] suggestNodes — "${currentNode}"`)

  let docContext = "Không có tài liệu tham chiếu cụ thể.";

  
  if (mindmapId) {
     try {
        const retriever = new HybridRetriever(process.env.MONGO_URI);
        
        
        const searchQuery = [...parentNodes, currentNode].join(' '); 
        const relevantDocs = await retriever.retrieve(searchQuery, mindmapId, { 
            topK: 4, 
            useMMR: true 
        });
        
        if (relevantDocs.length > 0) {
            docContext = relevantDocs.map(d => d.text).join('\n---\n');
        }
     } catch (err) {
        console.error("[AI] Error retrieving context for suggestNodes:", err);
     }
  }

  const model = await getAiModel(false)

  const prompt = `Bạn là chuyên gia tạo Mindmap. Dựa vào tài liệu nội bộ sau đây:
<Context>
${docContext}
</Context>

Hãy gợi ý 5 node con (child nodes) tiếp theo cho node: "${currentNode}"
Chuỗi node cha: ${parentNodes.slice(-3).join(' > ') || 'root'}
Các node anh em đã có: ${siblings.slice(0, 3).join(', ') || 'none'}

YÊU CẦU:
- Bám sát nội dung <Context> được cung cấp (nếu có).
- Return ONLY a JSON array of 5 objects: [{"text":"concise label"},...]
- No explanation, no markdown.`

  const result = await model.generateContent(prompt)
  const raw = result.response.text()
  const arr = parseJSON(raw)
  return Array.isArray(arr) ? arr : (arr.suggestions || [])
}

export async function deleteChunks(mindmapId) {
  const res = await PDFChunk.deleteMany({ mindmapId })
  return res.deletedCount
}
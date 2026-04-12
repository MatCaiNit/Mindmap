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
        console.log("[AI] Tài liệu CÓ CẤU TRÚC (Phát hiện Mục lục / Tiêu đề).");
        rawChunks = chunkByStructure(pagesData, structureInfo);
    } else {
        console.log("[AI] Tài liệu KHÔNG CẤU TRÚC.");
        rawChunks = chunkText(pagesData, { maxChunkSize: 1000, overlap: 200 });
    }

    
    const BATCH = 20;
    const embeddings = [];
    for (let i = 0; i < rawChunks.length; i += BATCH) {
        const batch = rawChunks.slice(i, i + BATCH).map(c => c.text);
        const vecs = await embedBatch(batch, 'RETRIEVAL_DOCUMENT');
        embeddings.push(...vecs);
    }

    await PDFChunk.deleteMany({ mindmapId });
    const saved = await PDFChunk.insertMany(
        rawChunks.map((c, idx) => ({
            mindmapId,
            text:       c.text,
            pageNum:    c.pageNum,
            chunkIndex: idx,
            embedding:  embeddings[idx] || [],
        }))
    );
    console.log(`[AI]  Stored ${saved.length} chunks`);

    const MAX_CHUNKS_FOR_PROMPT = 15;
    const MAX_CHUNK_IN_PROMPT = 800;
    let selectedChunks = [];

    if (saved.length <= MAX_CHUNKS_FOR_PROMPT) {
        selectedChunks = saved;
    } else {
        const step = saved.length / MAX_CHUNKS_FOR_PROMPT;
        for (let i = 0; i < MAX_CHUNKS_FOR_PROMPT; i++) {
            const index = Math.floor(i * step);
            if (saved[index]) selectedChunks.push(saved[index]);
        }
    }

    const model = await getAiModel(false);
    let mindmap;

    if (isStructured) {
        console.log("[AI] Routing to processStructuredFile...");
        mindmap = await processStructuredFile(selectedChunks, filename, model);
    } else {
        console.log("[AI] Routing to Strict Prompt Builder...");
        const contextStr = selectedChunks
            .map(c => `[${c.chunkIndex}|p${c.pageNum}] ${c.text.slice(0, MAX_CHUNK_IN_PROMPT)}`)
            .join('\n---\n');

        const prompt = `You are an expert mindmap architect. Given these document excerpts (format: [chunk:N|page:P] text):

${contextStr}

Create a DEEP, comprehensive hierarchical mindmap JSON for the document "${filename}".

STRICT REQUIREMENTS:
1. The tree MUST have AT LEAST 4 levels of depth (root=level0, branches=level1, sub-branches=level2, details=level3, specifics=level4)
2. Root node: concise title (4-8 words max)
3. Level 1 nodes (branches): short category names (2-4 words each), 4-6 branches
4. Level 2 nodes (sub-branches): short sub-topic labels (2-5 words), 2-4 per branch
5. Level 3 nodes (details): medium descriptions (5-12 words), 2-3 per sub-branch
6. Level 4 nodes (leaf specifics): DETAILED explanations (10-25 words with facts, numbers, examples from the document). These are the most informative nodes.
7. Each node MUST have "sourceChunk" (integer chunk index from above, or null if not from a specific chunk)
8. Return ONLY valid JSON, no markdown, no explanation

JSON schema (strictly follow this structure):
{
  "root": {
    "text": "Concise Root Title",
    "sourceChunk": null,
    "children": [
      {
        "text": "Branch Name",
        "sourceChunk": 0,
        "children": [
          {
            "text": "Sub-branch",
            "sourceChunk": 1,
            "children": [
              {
                "text": "Detail topic",
                "sourceChunk": 2,
                "children": [
                  {
                    "text": "Specific leaf with detailed explanation from document content here",
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
        const aiResult = await model.generateContent(prompt); 
        mindmap = parseJSON(aiResult.response.text());
    }

    const rawPdfText = saved.map(c => c.text || "").join(' ');
    let evaluationReport = { status: "Skipped", metrics: {} };
    // try {
    //     evaluationReport = calculateMetrics(mindmap, rawPdfText);
    //     console.log("\n" + "=".repeat(30));
    //     console.log("📊 BÁO CÁO CHẤT LƯỢNG MINDMAP");
    //     console.table(evaluationReport.metrics);
    //     console.log("Trạng thái:", evaluationReport.status);
    //     console.log("=".repeat(30) + "\n");
    // } catch (e) {
    //     console.log("[AI] Evaluation failed:", e.message);
    // }

    return {
        ok: true,
        mindmap,
        evaluation: evaluationReport,
        chunks: saved.map(c => ({
            _id:        c._id,
            text:       c.text,
            pageNum:    c.pageNum,
            chunkIndex: c.chunkIndex,
        })),
        meta: { totalChunks: saved.length, usedChunks: selectedChunks.length },
    };
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
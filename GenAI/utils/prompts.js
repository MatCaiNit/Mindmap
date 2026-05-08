// GenAI/utils/prompts.js
// Centralized, battle-tested prompts — XMind-style specificity
// Anti-generic, anti-hallucination, structured output

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectLang(text = '') {
  const sample = text.slice(0, 800)
  const viChars = (sample.match(/[àáâãèéêìíòóôõùúýăđơưÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐƠƯ]/g) || []).length
  const totalAlpha = (sample.match(/[a-zA-ZÀ-ỹ]/g) || []).length
  return totalAlpha > 0 && viChars / totalAlpha > 0.08 ? 'vi' : 'en'
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1A: OUTLINE FROM DOCUMENT
// XMind approach: extract skeleton only, no explanations, strict JSON
// ─────────────────────────────────────────────────────────────────────────────

export function PROMPT_OUTLINE({ title, context, userIntent, lang }) {
  const isVi = lang === 'vi'

  const antiGeneric = isVi
    ? `NGHIÊM CẤM dùng các từ chung chung: "Tổng quan", "Giới thiệu", "Kết luận", "Các vấn đề", "Nhiều khía cạnh".
Mỗi nhánh PHẢI là một khái niệm cụ thể trích từ nội dung.`
    : `STRICTLY FORBIDDEN generic labels: "Overview", "Introduction", "Key Points", "Various Aspects", "Important Concepts".
Every branch MUST be a specific concept extracted from the actual content.`

  const example = isVi ? `
VÍ DỤ XẤU (NGHIÊM CẤM):
{"branches": [{"text": "Tổng quan hệ thống", "children": [{"text": "Các thành phần chính"}]}]}

VÍ DỤ TỐT (BẮT BUỘC):
{"branches": [{"text": "Kiến trúc Microservices", "children": [{"text": "API Gateway xác thực JWT"}, {"text": "Message Queue RabbitMQ"}]}]}` : `
BAD EXAMPLE (FORBIDDEN):
{"branches": [{"text": "System Overview", "children": [{"text": "Key Components"}]}]}

GOOD EXAMPLE (REQUIRED):
{"branches": [{"text": "Microservices Architecture", "children": [{"text": "JWT Auth via API Gateway"}, {"text": "RabbitMQ Message Queue"}]}]}`

  const intentHint = userIntent
    ? (isVi
        ? `\nYÊU CẦU NGƯỜI DÙNG: "${userIntent}" — Ưu tiên cấu trúc mindmap theo góc nhìn này.\n`
        : `\nUSER INTENT: "${userIntent}" — Structure the mindmap to answer this perspective.\n`)
    : ''

  const ctx = context?.trim()
    ? (isVi ? `\nNỘI DUNG TÀI LIỆU:\n${context.slice(0, 3500)}` : `\nDOCUMENT CONTENT:\n${context.slice(0, 3500)}`)
    : ''

  return isVi ? `Bạn là chuyên gia phân tích tài liệu tạo mindmap theo chuẩn XMind.
${intentHint}
NHIỆM VỤ: Tạo OUTLINE (khung xương) cho mindmap "${title}".
Chỉ tạo cấu trúc — KHÔNG giải thích, KHÔNG mô tả dài.
${antiGeneric}
${example}

RÀNG BUỘC BẮT BUỘC:
- 4 đến 7 nhánh chính (branches)
- Mỗi nhánh có 2-4 nhánh con (children)  
- Mỗi nhánh con PHẢI có 2-3 node con nữa (detail level)
- Tên nhánh: 3-8 từ, cụ thể, có thể là cụm danh từ kỹ thuật
- Depth tối đa: 3 tầng (branch → sub → sub-sub)
- Mỗi sub-branch PHẢI có children (ít nhất 2)
- Không có description, không có keywords (sẽ expand sau)
${ctx}

Trả về ĐÚNG format JSON sau (không markdown, không text thêm):
{
  "title": "...",
  "branches": [
    {
      "text": "Main topic",
      "children": [
        {
          "text": "Sub topic",
          "children": [
            { "text": "Detail 1" },
            { "text": "Detail 2" }
          ]
        }
      ]
    }
  ]
}` : `You are a document analyst creating XMind-quality mindmaps.
${intentHint}
TASK: Create an OUTLINE (skeleton only) for mindmap "${title}".
Structure only — NO explanations, NO long descriptions.
${antiGeneric}
${example}

STRICT RULES:
- 4 to 7 main branches
- Each branch has 2-4 children
- Branch names: 3-8 words, specific, preferably technical noun phrases
- Max depth: 3 levels in this outline phase (branch → sub → sub-sub)
- No description, no keywords (will be expanded later)
${ctx}

Return EXACTLY this JSON (no markdown, no extra text):
{
  "title": "${title}",
  "branches": [
    {
      "text": "Specific branch name",
      "children": [
        {"text": "Specific sub-branch 1"},
        {"text": "Specific sub-branch 2"}
      ]
    }
  ]
}`
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1B: OUTLINE FROM COMBINED (PDF + PROMPT)
// ─────────────────────────────────────────────────────────────────────────────

export function PROMPT_OUTLINE_COMBINED({ title, userIntent, pdfContext, lang }) {
  const isVi = lang === 'vi'

  return isVi ? `Bạn là chuyên gia tạo mindmap theo chuẩn XMind Pro.

TÀI LIỆU: "${title}"
YÊU CẦU NGƯỜI DÙNG: "${userIntent}"

NHIỆM VỤ: Tạo OUTLINE mindmap tích hợp nội dung tài liệu VÀ yêu cầu của người dùng.
- Ưu tiên cấu trúc theo góc nhìn: "${userIntent}"
- Lấy dữ liệu cụ thể từ tài liệu để làm phong phú nội dung
- KHÔNG chỉ tóm tắt tài liệu — phải trả lời câu hỏi/yêu cầu của người dùng

NGHIÊM CẤM: "Tổng quan", "Giới thiệu", "Kết luận", nhánh quá chung chung.
BẮT BUỘC: 
- Mỗi nhánh phải là khái niệm/thông tin cụ thể từ tài liệu.
- Depth tối thiểu 3 cấp
- Mỗi nhánh chính có 3-5 nhánh con
- Mỗi nhánh con có ít nhất 2 detail nodes

NỘI DUNG TÀI LIỆU:
${(pdfContext || '').slice(0, 3000)}

Trả về JSON (không markdown):
{
  "title": "${userIntent || title}",
  "branches": [
    {"text": "Tên nhánh cụ thể", "children": [{"text": "Tên nhánh con"}]}
  ]
}` : `You are an expert mindmap creator following XMind Pro standards.

DOCUMENT: "${title}"
USER REQUEST: "${userIntent}"

TASK: Create an OUTLINE mindmap integrating document content AND user intent.
- Prioritize structure based on: "${userIntent}"
- Extract specific data from the document to enrich nodes
- DO NOT just summarize — answer the user's question/request

FORBIDDEN: "Overview", "Introduction", "Summary", generic branches.
REQUIRED: Every branch must be a specific concept/fact from the document.

DOCUMENT CONTENT:
${(pdfContext || '').slice(0, 3000)}

Return JSON (no markdown):
{
  "title": "${userIntent || title}",
  "branches": [
    {"text": "Specific branch", "children": [{"text": "Specific sub-branch"}]}
  ]
}`
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2A: EXPAND NODE WITH RAG CONTEXT
// XMind approach: each node gets specific content from document
// ─────────────────────────────────────────────────────────────────────────────

export function PROMPT_EXPAND_NODE_RAG({ nodeText, parentChain, ragChunks, lang, maxChildren = 4 }) {
  const isVi = lang === 'vi'
  const breadcrumb = [...parentChain, nodeText].join(' → ')
  const safeChunks = Array.isArray(ragChunks) ? ragChunks : [];

    const context = safeChunks
    .map((c, i) => {
        if (!c) return ''; // Nếu chunk bị null -> bỏ qua
        
        // 2. Gom mọi trường hợp tên field chứa text (phòng hờ vector DB dùng tên khác)
        const rawText = c.text || c.content || c.pageContent || '';
        
        if (!rawText) return ''; // Nếu text rỗng -> không gọi hàm .slice() để tránh crash
        
        return `[Chunk ${i + 1}${c.pageNum ? `, trang ${c.pageNum}` : ''}]:\n${rawText.slice(0, 400)}`;
    })
    .filter(Boolean) // Lọc bỏ các phần tử rỗng
    .join('\n---\n');

  const antiGenericExamples = isVi ? `
VÍ DỤ XẤU (NGHIÊM CẤM tạo ra):
[{"text": "Các tính năng quan trọng", "description": "Có nhiều tính năng", "keywords": ["tính năng", "quan trọng"]}]

VÍ DỤ TỐT (BẮT BUỘC):
[{"text": "Cache L1/L2 với TTL 300s", "description": "Dữ liệu cache phân tầng giảm 80% database query", "keywords": ["cache", "TTL", "L1", "L2"]}]` : `
BAD EXAMPLE (FORBIDDEN):
[{"text": "Key Features", "description": "There are many important features", "keywords": ["features", "important"]}]

GOOD EXAMPLE (REQUIRED):
[{"text": "L1/L2 Cache with 300s TTL", "description": "Layered cache reduces database queries by 80%", "keywords": ["cache", "TTL", "L1", "L2"]}]`

  return isVi ? `Bạn là chuyên gia phân tích mở rộng node mindmap với dữ liệu cụ thể.

NODE CẦN MỞ RỘNG: "${nodeText}"
ĐƯỜNG DẪN: ${breadcrumb}

NGUỒN TÀI LIỆU (dùng để lấy thông tin cụ thể):
${context}

NHIỆM VỤ: 
- Tạo ${maxChildren}-5 node con cho "${nodeText}" dựa trên nội dung tài liệu.
- Nếu một node con có thể được chia nhỏ hơn nữa, hãy tạo thêm 1 cấp con (sub-children)
${antiGenericExamples}

RÀNG BUỘC:
- Mỗi node: text (3-10 từ), description (1 câu cụ thể ≤20 từ), keywords (2-4 từ khóa kỹ thuật)
- Text PHẢI là thông tin cụ thể từ tài liệu, KHÔNG được là ý kiến chung
- Description PHẢI có số liệu, tên kỹ thuật, hoặc quy trình cụ thể nếu có trong tài liệu
- Keywords PHẢI là thuật ngữ kỹ thuật/chuyên ngành, KHÔNG là từ thông dụng

Trả về JSON array (không markdown, không text thêm):
[
  {
    "text": "Tên node cụ thể",
    "description": "Một câu mô tả cụ thể với số liệu hoặc tên kỹ thuật",
    "keywords": ["từ1", "từ2", "từ3"],
    "sourceRef": <số chunk hoặc null>
  }
]` : `You are an expert at expanding mindmap nodes with specific document data.

NODE TO EXPAND: "${nodeText}"
BREADCRUMB: ${breadcrumb}

DOCUMENT SOURCES (use to extract specific info):
${context}

TASK: 
- Create ${maxChildren}-5 child nodes for "${nodeText}" from the document content.
- If a child node can be further broken down, include 1 level of sub-children
${antiGenericExamples}

CONSTRAINTS:
- Each node: text (3-10 words), description (1 specific sentence ≤20 words), keywords (2-4 technical terms)
- Text MUST be specific information from the document, NOT general opinion
- Description MUST include numbers, technical names, or specific processes if present
- Keywords MUST be technical/domain-specific terms, NOT common words

Return JSON array (no markdown, no extra text):
[
  {
    "text": "Specific node name",
    "description": "One specific sentence with numbers or technical names",
    "keywords": ["term1", "term2", "term3"],
    "sourceRef": <chunk number or null>
  }
]`
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2B: EXPAND NODE FROM PROMPT (no PDF)
// ─────────────────────────────────────────────────────────────────────────────

export function PROMPT_EXPAND_NODE_PROMPT({ nodeText, parentChain, topic, lang, maxChildren = 4 }) {
  const isVi = lang === 'vi'
  const breadcrumb = [...parentChain, nodeText].join(' → ')

  return isVi ? `Bạn là chuyên gia tạo mindmap chuyên sâu về: "${topic}".

NODE CẦN MỞ RỘNG: "${nodeText}"
ĐƯỜNG DẪN: ${breadcrumb}

NHIỆM VỤ: Tạo ${maxChildren}-5 node con CỰC KỲ CỤ THỂ cho "${nodeText}".

NGHIÊM CẤM:
- "Các khía cạnh quan trọng", "Nhiều yếu tố", "Tính năng chính"
- Bất kỳ node nào có thể áp dụng cho chủ đề KHÁC

BẮT BUỘC:
- Mỗi node phải là khái niệm/kỹ thuật/bước quy trình CỤ THỂ trong lĩnh vực "${topic}"
- Description: 1 câu có động từ hành động và kết quả cụ thể
- Keywords: thuật ngữ kỹ thuật trong lĩnh vực này

Trả về JSON array:
[{"text": "...", "description": "...", "keywords": ["..."], "sourceRef": null}]` : `You are a domain expert creating deep-dive mindmaps about: "${topic}".

NODE TO EXPAND: "${nodeText}"
BREADCRUMB: ${breadcrumb}

TASK: Create ${maxChildren}-5 HIGHLY SPECIFIC child nodes for "${nodeText}".

STRICTLY FORBIDDEN:
- "Key Aspects", "Various Factors", "Important Features"
- Any node that could apply to a DIFFERENT topic

REQUIRED:
- Each node must be a specific concept/technique/process step unique to "${topic}"
- Description: 1 sentence with action verb and concrete outcome
- Keywords: technical terms in this domain

Return JSON array:
[{"text": "...", "description": "...", "keywords": ["..."], "sourceRef": null}]`
}

// ─────────────────────────────────────────────────────────────────────────────
// SUGGEST NODES (toolbar AI button)
// ─────────────────────────────────────────────────────────────────────────────

export function PROMPT_SUGGEST_NODES({ currentNode, parentChain, siblings, ragContext, lang }) {
  const isVi = lang === 'vi'
  const context = ragContext
    ? (isVi ? `\nNGUỒN TÀI LIỆU:\n${ragContext.slice(0, 800)}\n` : `\nDOCUMENT CONTEXT:\n${ragContext.slice(0, 800)}\n`)
    : ''
  const siblingHint = siblings?.length
    ? (isVi ? `\nCÁC NODE ANH EM ĐÃ CÓ (KHÔNG được lặp lại): ${siblings.join(', ')}` : `\nEXISTING SIBLINGS (do NOT repeat): ${siblings.join(', ')}`)
    : ''

  return isVi ? `Gợi ý 4 node con cho "${currentNode}" trong mindmap.
Đường dẫn: ${[...parentChain, currentNode].join(' → ')}
${context}${siblingHint}

Yêu cầu: cụ thể, không trùng lặp, phù hợp ngữ cảnh.
Trả về JSON: [{"text": "gợi ý 1"}, {"text": "gợi ý 2"}, {"text": "gợi ý 3"}, {"text": "gợi ý 4"}]` : `Suggest 4 child nodes for "${currentNode}" in the mindmap.
Path: ${[...parentChain, currentNode].join(' → ')}
${context}${siblingHint}

Requirements: specific, non-repetitive, contextually appropriate.
Return JSON: [{"text": "suggestion 1"}, {"text": "suggestion 2"}, {"text": "suggestion 3"}, {"text": "suggestion 4"}]`
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC TOC (AI fallback when no structural TOC found)
// ─────────────────────────────────────────────────────────────────────────────

export function PROMPT_SYNTHETIC_TOC({ sampleText, totalPages, lang }) {
  const isVi = lang === 'vi'
  return isVi ? `Phân tích ${totalPages} trang tài liệu và suy luận MỤC LỤC LOGIC.

Đoạn trích mẫu:
${sampleText}

Yêu cầu:
- 4-7 chương/phần chính, mỗi chương 2-4 mục nhỏ
- Tên chương phản ánh ĐÚNG nội dung (không dùng "Chương 1", "Phần A" chung chung)
- Sắp xếp theo thứ tự logic của tài liệu

Trả về JSON (không markdown):
{
  "chapters": [
    {
      "title": "Tên chương cụ thể",
      "subSections": ["Mục 1.1", "Mục 1.2"],
      "pageHint": null,
      "confidence": 0.8
    }
  ]
}` : `Analyze this ${totalPages}-page document and infer a LOGICAL TABLE OF CONTENTS.

Sample excerpts:
${sampleText}

Requirements:
- 4-7 main chapters/sections, each with 2-4 sub-sections
- Chapter titles MUST reflect actual content (not generic "Chapter 1", "Section A")
- Order should follow document's logical flow

Return JSON (no markdown):
{
  "chapters": [
    {
      "title": "Specific chapter name",
      "subSections": ["Section 1.1", "Section 1.2"],
      "pageHint": null,
      "confidence": 0.8
    }
  ]
}`
}
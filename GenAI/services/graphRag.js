// GenAI/services/graphRag.js
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJSON(raw) {
  const clean = raw.replace(/```json[\s\S]*?```|```/g, '').trim()
  try { return JSON.parse(clean) } catch (_) {
    const m = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (m) return JSON.parse(m[0])
    throw new Error('GraphRAG: invalid JSON from AI')
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function parseRetryDelayMs(err) {
  try {
    for (const d of (err?.errorDetails || [])) {
      if (d['@type']?.includes('RetryInfo') && d.retryDelay) {
        return parseFloat(d.retryDelay) * 1000
      }
    }
  } catch (_) {}
  return null
}

/** Retry with exponential back-off on 429 */
async function callWithRetry(model, prompt, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(prompt)
    } catch (err) {
      const is429 = err?.status === 429 || String(err?.message).includes('429')
      if (!is429 || attempt === maxRetries) throw err

      const wait = parseRetryDelayMs(err) || (12000 * Math.pow(2, attempt))
      console.warn(`[GraphRAG] 429 — retry ${attempt + 1}/${maxRetries} in ${Math.round(wait / 1000)}s`)
      await sleep(wait + Math.random() * 2000)
    }
  }
}

/** Sample chunks evenly so the prompt stays within token limits */
function sampleChunks(chunks, maxChunks = 12, maxCharsEach = 500) {
  if (chunks.length <= maxChunks) {
    return chunks.map(c => ({ ...c, text: c.text.slice(0, maxCharsEach) }))
  }
  const step = chunks.length / maxChunks
  return Array.from({ length: maxChunks }, (_, i) => {
    const c = chunks[Math.floor(i * step)]
    return c ? { ...c, text: c.text.slice(0, maxCharsEach) } : null
  }).filter(Boolean)
}

// ─────────────────────────────────────────────────────────────────────────────
// CALL 1 (unstructured only): Generate a synthetic table-of-contents
// ─────────────────────────────────────────────────────────────────────────────
export async function generateSyntheticTOC(pagesData) {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME })
  const total = pagesData.length

  const idxSet = new Set([0, 1, Math.floor(total * 0.3), Math.floor(total * 0.6), total - 1])
  const sample = [...idxSet]
    .filter(i => i < total)
    .map(i => `[Trang ${pagesData[i].pageNum}]\n${pagesData[i].text.slice(0, 400)}`)
    .join('\n\n')

  const prompt = `Phân tích các đoạn trích từ tài liệu và tạo MỤC LỤC LOGIC.
Tài liệu KHÔNG có mục lục sẵn — hãy suy luận cấu trúc từ nội dung.

Đoạn trích:
${sample}

Yêu cầu:
- 4-7 chương/phần chính, mỗi chương có 2-4 mục nhỏ
- Tên chương súc tích, phản ánh đúng nội dung thực tế
- Trả về JSON THUẦN (không markdown):

{
  "docTitle": "Tiêu đề tài liệu",
  "chapters": [
    { "title": "Tên chương", "subSections": ["Mục 1.1", "Mục 1.2"] }
  ]
}`

  const res = await callWithRetry(model, prompt)
  const toc = parseJSON(res.response.text())
  console.log(`[GraphRAG] Synthetic TOC: "${toc.docTitle}" — ${toc.chapters?.length || 0} chương`)
  return toc
}

// ─────────────────────────────────────────────────────────────────────────────
// CALL 1 or 2: Fused GraphRAG (graph + communities + mindmap in ONE call)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Core GraphRAG: extract entities → cluster into communities → mindmap branches.
 * Everything happens in a SINGLE Gemini prompt to stay within quota.
 *
 * @param {string}      docTitle     filename or document title
 * @param {Array}       chunks       [{text, pageNum, chunkIndex}, ...]
 * @param {Object|null} syntheticTOC result of generateSyntheticTOC(), or null
 * @returns {{ root: Object }}       mindmap JSON
 */
export async function buildGraphRAGMindmap(docTitle, chunks, syntheticTOC = null) {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME })

  const sampled   = sampleChunks(chunks, 12, 500)
  const contextStr = sampled
    .map(c => `[${c.chunkIndex ?? 0}|p${c.pageNum ?? '?'}] ${c.text}`)
    .join('\n---\n')

  const tocHint = syntheticTOC?.chapters?.length
    ? `\nTham khảo cấu trúc MỤC LỤC GỢI Ý khi phân cụm:\n${
        syntheticTOC.chapters.map((ch, i) =>
          `  Chương ${i + 1}: ${ch.title}${ch.subSections?.length ? ' → ' + ch.subSections.join(', ') : ''}`
        ).join('\n')
      }\n`
    : ''

  const rootTitle = (syntheticTOC?.docTitle || docTitle).replace(/\.pdf$/i, '')

  const prompt = `Bạn là chuyên gia phân tích tài liệu và xây dựng mindmap theo phương pháp GraphRAG.

PHƯƠNG PHÁP (thực hiện tuần tự trong một lượt):
① Trích xuất ENTITY quan trọng (khái niệm, quy trình, hệ thống, thuật ngữ kỹ thuật)
② Xác định QUAN HỆ giữa các entity (liên kết, phụ thuộc, bao gồm, dẫn đến...)
③ Phân cụm entity thành COMMUNITIES (nhóm liên kết chặt = 1 nhánh mindmap)
④ Mỗi community → tiêu đề nhánh + sub-topic chi tiết từ văn bản
${tocHint}
VĂN BẢN NGUỒN:
${contextStr}

TIÊU ĐỀ TÀI LIỆU: "${rootTitle}"

YÊU CẦU ĐẦU RA (BẮT BUỘC):
- 4-7 nhánh chính (mỗi nhánh = 1 community)
- Mỗi nhánh: 3-5 sub-topic chi tiết (8-20 từ, trích từ nội dung thực tế)
- Cây PHẢI có ≥4 tầng; node lá chứa thông tin cụ thể (con số, định nghĩa, ví dụ)
- "sourceChunk": index của chunk chứa thông tin (số nguyên, hoặc null)
- Trả về JSON THUẦN — KHÔNG markdown, KHÔNG giải thích

{
  "root": {
    "text": "${rootTitle}",
    "sourceChunk": null,
    "children": [
      {
        "text": "Tên nhánh (community 1)",
        "sourceChunk": 0,
        "children": [
          {
            "text": "Sub-topic cụ thể",
            "sourceChunk": 1,
            "children": [
              { "text": "Chi tiết / định nghĩa / con số", "sourceChunk": 2, "children": [] }
            ]
          }
        ]
      }
    ]
  }
}`

  console.log('[GraphRAG] Calling Gemini (fused: graph + communities + mindmap)...')
  const res = await callWithRetry(model, prompt)
  const mindmap = parseJSON(res.response.text())

  if (!mindmap?.root?.children?.length) {
    throw new Error('GraphRAG: returned empty or invalid mindmap structure')
  }

  console.log(`[GraphRAG] Done — branches: ${mindmap.root.children.length}`)
  return mindmap
}
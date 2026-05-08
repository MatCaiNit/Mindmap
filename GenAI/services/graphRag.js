// GenAI/services/graphRag.js
// GraphRAG: entity extraction → community detection → synthetic TOC / mindmap
// 100% Ollama — không dùng Gemini
// FIX: generateSyntheticTOC nhận tham số `lang` để chọn prompt đúng ngôn ngữ

const OLLAMA_BASE = process.env.OLLAMA_URL       || 'http://localhost:11434'
const GEN_MODEL   = process.env.OLLAMA_GEN_MODEL || 'qwen2.5:3b'

import { extractJSON } from '../utils/jsonSafe.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))


async function ollamaJSON(prompt, {
  maxRetries  = 2,
  temperature = 0.1,
  numCtx      = 4096,
  timeoutMs   = 60_000,
} = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      console.warn(`[GraphRAG] Attempt ${attempt + 1} timed out — aborting`)
      controller.abort()
    }, timeoutMs)

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method:  'POST',
        signal:  controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:  GEN_MODEL,
          prompt,
          format: 'json',
          stream: true,
          options: { temperature, num_ctx: numCtx, num_gpu: 99 },
        }),
      })
      if (!res.ok) throw new Error(`[GraphRAG] Ollama ${res.status}: ${await res.text()}`)

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let full     = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value, { stream: true }).split('\n').filter(Boolean)) {
          try { const o = JSON.parse(line); if (o.response) full += o.response } catch (_) {}
        }
      }

      clearTimeout(timer)

      const parsed = extractJSON(full)
      if (parsed !== null) return parsed

      if (attempt < maxRetries) {
        console.warn(`[GraphRAG] JSON parse failed attempt ${attempt + 1}, retrying...`)
        await sleep(1000 * (attempt + 1))
        continue
      }
      throw new Error(`[GraphRAG] Invalid JSON after ${maxRetries + 1} tries: ${full.slice(0, 300)}`)

    } catch (err) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        console.warn(`[GraphRAG] Attempt ${attempt + 1} aborted (timeout)`)
        if (attempt < maxRetries) { await sleep(2000); continue }
        throw new Error(`[GraphRAG] All ${maxRetries + 1} attempts timed out`)
      }
      throw err
    }
  }
}


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


function buildSyntheticTOCPromptVI(sample) {
  return `Phân tích các đoạn trích từ tài liệu và tạo MỤC LỤC LOGIC.
Tài liệu KHÔNG có mục lục sẵn — suy luận cấu trúc từ nội dung thực tế.

Đoạn trích:
${sample}

Yêu cầu:
- 4-7 chương/phần chính, mỗi chương có 2-4 mục nhỏ
- Tên chương súc tích, phản ánh đúng nội dung
- Trả về JSON THUẦN (không markdown):

{
  "docTitle": "Tiêu đề tài liệu",
  "chapters": [
    { "title": "Tên chương", "subSections": ["Mục 1.1", "Mục 1.2"] }
  ]
}`
}

function buildSyntheticTOCPromptEN(sample) {
  return `Analyze the document excerpts below and infer a logical TABLE OF CONTENTS.
The document has NO explicit TOC — derive structure purely from the content.

Excerpts:
${sample}

Requirements:
- 4-7 main chapters/sections, each with 2-4 sub-sections
- Chapter titles must be concise and reflect actual content
- Return ONLY pure JSON (no markdown, no preamble):

{
  "docTitle": "Document title here",
  "chapters": [
    { "title": "Chapter title", "subSections": ["Section 1.1", "Section 1.2"] }
  ]
}`
}


export async function generateSyntheticTOC(pagesData, lang = 'vi') {
  const total  = pagesData.length

  // Sample trải đều 6 điểm trong tài liệu để model có cái nhìn toàn cục
  const idxSet = new Set([
    0,
    1,
    Math.floor(total * 0.25),
    Math.floor(total * 0.5),
    Math.floor(total * 0.75),
    total - 1,
  ])

  const sample = [...idxSet]
    .filter(i => i >= 0 && i < total)
    .map(i => `[Page ${pagesData[i].pageNum}]\n${pagesData[i].text.slice(0, 500)}`)
    .join('\n\n')

  const prompt = lang === 'vi'
    ? buildSyntheticTOCPromptVI(sample)
    : buildSyntheticTOCPromptEN(sample)

  console.log(`[GraphRAG] Synthetic TOC — lang: ${lang}, pages sampled: ${[...idxSet].filter(i => i < total).length}`)

  const toc = await ollamaJSON(prompt, { temperature: 0.2 })

  if (!toc || !Array.isArray(toc.chapters) || toc.chapters.length === 0) {
    console.warn('[GraphRAG] Synthetic TOC invalid shape:', JSON.stringify(toc).slice(0, 200))
    return null
  }

  // Guard: chapter title phải có ít nhất 2 từ thực sự
  const validChapters = toc.chapters.filter(ch => {
    if (!ch?.title) return false
    const words = ch.title.split(/\s+/).filter(w => /[A-Za-zÀ-ỹ]{2,}/.test(w))
    return words.length >= 2
  })

  if (validChapters.length < 2) {
    console.warn('[GraphRAG] Synthetic TOC: not enough valid chapters after filtering')
    return null
  }

  toc.chapters = validChapters
  console.log(`[GraphRAG] Synthetic TOC OK: "${toc.docTitle || '(no title)'}" — ${toc.chapters.length} chapters`)
  return toc
}


export async function buildGraphRAGMindmap(docTitle, chunks, syntheticTOC = null, lang = 'vi') {
  const sampled    = sampleChunks(chunks, 12, 500)
  const contextStr = sampled
    .map(c => `[${c.chunkIndex ?? 0}|p${c.pageNum ?? '?'}] ${c.text}`)
    .join('\n---\n')

  const tocHint = syntheticTOC?.chapters?.length
    ? `\n${lang === 'vi' ? 'Tham khảo MỤC LỤC GỢI Ý' : 'Reference SUGGESTED TOC'}:\n${
        syntheticTOC.chapters.map((ch, i) =>
          `  ${i + 1}. ${ch.title}${ch.subSections?.length ? ' → ' + ch.subSections.join(', ') : ''}`
        ).join('\n')
      }\n`
    : ''

  const rootTitle = (syntheticTOC?.docTitle || docTitle).replace(/\.pdf$/i, '')

  const prompt = lang === 'vi'
    ? buildGraphRAGMindmapPromptVI(rootTitle, contextStr, tocHint)
    : buildGraphRAGMindmapPromptEN(rootTitle, contextStr, tocHint)

  console.log('[GraphRAG] Calling Ollama (graph + communities + mindmap)...')
  const mindmap = await ollamaJSON(prompt, { temperature: 0.2 })

  if (!mindmap?.root?.children?.length) {
    throw new Error('[GraphRAG] Returned empty or invalid mindmap structure')
  }

  console.log(`[GraphRAG] Done — branches: ${mindmap.root.children.length}`)
  return mindmap
}

function buildGraphRAGMindmapPromptVI(rootTitle, contextStr, tocHint) {
  return `Bạn là chuyên gia phân tích tài liệu và xây dựng mindmap theo phương pháp GraphRAG.

PHƯƠNG PHÁP (tuần tự):
① Trích xuất ENTITY quan trọng (khái niệm, quy trình, hệ thống, thuật ngữ kỹ thuật)
② Xác định QUAN HỆ giữa các entity
③ Phân cụm entity thành COMMUNITIES (nhóm liên kết chặt = 1 nhánh mindmap)
④ Mỗi community → tiêu đề nhánh + sub-topic chi tiết từ văn bản
${tocHint}
VĂN BẢN NGUỒN:
${contextStr}

TIÊU ĐỀ: "${rootTitle}"

YÊU CẦU:
- 4-7 nhánh chính (mỗi nhánh = 1 community)
- Mỗi nhánh: 3-5 sub-topic (8-20 từ, trích từ nội dung thực tế)
- Cây PHẢI có ≥4 tầng; node lá chứa thông tin cụ thể
- "sourceChunk": index chunk chứa thông tin (số nguyên hoặc null)
- Trả về JSON THUẦN, KHÔNG markdown

{
  "root": {
    "text": "${rootTitle}",
    "sourceChunk": null,
    "children": [
      {
        "text": "Tên nhánh",
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
}

function buildGraphRAGMindmapPromptEN(rootTitle, contextStr, tocHint) {
  return `You are an expert document analyst building a mindmap using the GraphRAG method.

METHOD (sequential steps):
① Extract KEY ENTITIES (concepts, processes, systems, technical terms)
② Identify RELATIONSHIPS between entities
③ Cluster entities into COMMUNITIES (tightly-linked groups = one mindmap branch each)
④ For each community → branch title + detailed sub-topics from the source text
${tocHint}
SOURCE TEXT:
${contextStr}

TITLE: "${rootTitle}"

REQUIREMENTS:
- 4-7 main branches (each branch = one community)
- Each branch: 3-5 sub-topics (8-20 words, drawn from actual content)
- Tree MUST have ≥4 levels; leaf nodes contain specific information
- "sourceChunk": integer index of the chunk containing the info (or null)
- Return ONLY pure JSON, NO markdown

{
  "root": {
    "text": "${rootTitle}",
    "sourceChunk": null,
    "children": [
      {
        "text": "Branch name",
        "sourceChunk": 0,
        "children": [
          {
            "text": "Specific sub-topic",
            "sourceChunk": 1,
            "children": [
              { "text": "Detail / definition / figure", "sourceChunk": 2, "children": [] }
            ]
          }
        ]
      }
    ]
  }
}`
}
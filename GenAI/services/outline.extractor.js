// GenAI/services/outline.extractor.js
// Multi-strategy TOC extraction — XMind-inspired scoring approach
// Strategy priority: PDF metadata → numbered headings → visual scoring → AI synthesis

import { extractJSON } from '../utils/jsonSafe.js'
import { PROMPT_SYNTHETIC_TOC, detectLang } from '../utils/prompts.js'

const OLLAMA_BASE = process.env.OLLAMA_URL       || 'http://localhost:11434'
const GEN_MODEL   = process.env.OLLAMA_GEN_MODEL || 'qwen2.5:3b'

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the','and','for','are','but','not','you','can','has','its','may','now',
  'this','that','with','have','they','will','been','more','also','than',
  'when','were','what','your','said','each','which','from','into',
  // Vietnamese
  'và','của','các','là','có','được','cho','với','từ','trong','này','đó',
  'một','những','hay','hoặc','nhưng','mà','khi','nếu','thì','vì','theo',
])

const GENERIC_TITLES = new Set([
  'introduction','overview','summary','conclusion','appendix','references',
  'bibliography','acknowledgments','abstract','preface','foreword','contents',
  'table of contents','mục lục','lời mở đầu','lời nói đầu','kết luận',
  'tóm tắt','tài liệu tham khảo','phụ lục',
])

const NOISE_PATTERNS = [
  /^(?:đại học|trường|khoa|faculty|university|institute|department)/i,
  /^(?:gvhd|svth|giáo viên|sinh viên|msv|mã số|nhóm|lớp|khóa)/i,
  /^(?:page|trang)\s*\d+$/i,
  /^(?:figure|hình|bảng|table|fig\.?)\s*[\d.]+/i,
  /^(?:www\.|http|email|tel|fax)/i,
  /^\d{4}[\s–\-]\d{4}$/,
  /^[©®™]/,
  /^[=\+\-]{5,}$/,
]

function isNoise(text) {
  if (!text || text.length < 3 || text.length > 200) return true
  return NOISE_PATTERNS.some(p => p.test(text.trim()))
}

function isGeneric(text) {
  const norm = text.toLowerCase().trim().replace(/^[\d.]+\s*/, '')
  return GENERIC_TITLES.has(norm)
}

function countWords(text) {
  return text.split(/\s+/).filter(w => /[A-Za-zÀ-ỹ]{2,}/.test(w)).length
}

function normTitle(text) {
  return text.toLowerCase()
    .replace(/^[\d.]+[\s.:]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 0: NUMBERED HEADING DETECTION
// Most reliable — academic papers, reports, technical docs
// ─────────────────────────────────────────────────────────────────────────────

const NUMBERED_PATTERNS = [
  // "1  Introduction", "2.1  Background"
  { re: /^(\d{1,2}(?:\.\d{1,2}){0,3})\s{1,4}([A-ZÀ-Ỹa-zà-ỹ][^$\n]{3,80})/m, type: 'numeric' },
  // "1. Introduction"
  { re: /^(\d{1,2}(?:\.\d{1,2}){0,3})[.\s:]+([A-ZÀ-Ỹ][^$\n]{3,80})/m, type: 'numeric' },
  // "Chapter 1: ..." / "Chương 1: ..."
  { re: /^(?:Chapter|Chương|CHƯƠNG|CHAPTER)\s+(\d+)[:\s.]+([A-ZÀ-Ỹa-zà-ỹ][^$\n]{3,80})/im, type: 'chapter' },
  // "Part I: ...", "Phần I: ..."
  { re: /^(?:Part|Phần|PHẦN|PART)\s+([IVX\d]+)[:\s.]+([A-ZÀ-Ỹa-zà-ỹ][^$\n]{3,80})/im, type: 'part' },
  // "I.  Introduction", "II.  Background"
  { re: /^([IVX]{1,5})[.\s]{2,}([A-ZÀ-Ỹ][^$\n]{5,80})/m, type: 'roman' },
]

const REJECT_NUMBERED = [
  /[=÷∑∫√≤≥≠±∀∃∈∉⊆]/,
  /[α-ωΑ-Ω]/,
  /\[\d+\]/,
  /et al\./i,
  /\bfig(?:ure)?\s*\d/i,
  /\.{3,}/,
]

export function extractNumberedHeadings(pagesData) {
  const fullText = pagesData.map(p => p.text || '').join('\n')
  // Limit search area (exclude last 10% which is usually references)
  const searchText = fullText.slice(0, Math.floor(fullText.length * 0.9))

  const entries = []
  const seenLabels = new Set()
  const seenTitles = new Set()

  for (const { re, type } of NUMBERED_PATTERNS) {
    const global = new RegExp(re.source, 'gim')
    let match
    while ((match = global.exec(searchText)) !== null) {
      const label = match[1].trim()
      const rawTitle = match[2].replace(/\.{2,}\s*\d+\s*$/, '').replace(/\s+\d+\s*$/, '').trim()
      const title = rawTitle.slice(0, 100)

      if (title.length < 4 || title.length > 120) continue
      if (isNoise(title)) continue
      if (REJECT_NUMBERED.some(p => p.test(title))) continue
      if (!/[A-Za-zÀ-ỹ]{3,}/.test(title)) continue

      const key = `${label}|${title.slice(0, 30)}`
      if (seenLabels.has(key)) continue
      seenLabels.add(key)

      const normT = normTitle(title)
      if (seenTitles.has(normT)) continue
      seenTitles.add(normT)

      const dotCount = type === 'numeric' ? (label.match(/\./g) || []).length : 0
      const level = type === 'roman' ? 1 : type === 'chapter' || type === 'part' ? 1 : dotCount + 1

      entries.push({ label, title, level, type, full: `${label} ${title}` })
    }
  }

  if (entries.length < 3) return null

  // Count per level — need at least 2 entries at level 1
  const level1 = entries.filter(e => e.level === 1)
  if (level1.length < 2) return null

  return buildChapterTree(entries)
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 1: VISUAL SCORING (improved XMind-style)
// Combines: font size ratio, bold, indent, all-caps, line length
// Uses confidence scoring instead of hard thresholds
// ─────────────────────────────────────────────────────────────────────────────

export function extractByVisualScoring(pagesData, bodyFont = 11) {
  if (!pagesData?.length) return null

  // Collect all line metrics
  const allFontSizes = pagesData
    .flatMap(p => p.lines || [])
    .map(l => l.avgFont || 12)
    .filter(f => f > 0)

  // Body font = 50th percentile
  const sorted = [...allFontSizes].sort((a, b) => a - b)
  const detectedBodyFont = sorted[Math.floor(sorted.length * 0.5)] || bodyFont
  const headingThreshold = detectedBodyFont * 1.15 // 15% larger = potential heading

  const candidates = []
  const seenTitles = new Set()

  for (const page of pagesData) {
    for (const line of page.lines || []) {
      const text = (line.text || '').trim()
      if (!text || text.length < 4 || text.length > 120) continue
      if (isNoise(text)) continue

      const wordCount = countWords(text)
      if (wordCount < 2 || wordCount > 15) continue

      const sizeRatio = (line.avgFont || 12) / detectedBodyFont
      const isLarger = sizeRatio >= headingThreshold / detectedBodyFont
      const isBold = line.isBold || false
      const isAllCaps = text === text.toUpperCase() && text.length >= 10 && /[A-ZÀ-Ỹ]{3,}/.test(text)
      const hasNumber = /^\d+(?:\.\d+)*[\s.:]+/.test(text)

      // Scoring: each signal contributes
      let score = 0
      if (sizeRatio >= 1.4)  score += 40
      else if (sizeRatio >= 1.25) score += 25
      else if (sizeRatio >= 1.15) score += 15
      if (isBold)    score += 20
      if (isAllCaps) score += 15
      if (hasNumber) score += 25
      if (line.indent < 50) score += 10  // left-aligned = likely heading
      if (wordCount <= 8)   score += 10  // short = likely heading

      if (score < 30) continue

      // Avoid consecutive duplicate titles
      const normT = normTitle(text)
      if (seenTitles.has(normT)) continue
      seenTitles.add(normT)

      // Determine level from score + numbering
      let level = 1
      if (hasNumber) {
        const numMatch = text.match(/^(\d+(?:\.\d+)*)/)
        if (numMatch) level = (numMatch[1].match(/\./g) || []).length + 1
      } else {
        if (score < 50) level = 2
        if (score < 40) level = 3
      }

      candidates.push({
        text,
        title: text.replace(/^\d+(?:\.\d+)*[\s.:]+/, '').trim(),
        level,
        score,
        page: page.pageNum,
        sizeRatio,
        isBold,
      })
    }
  }

  if (candidates.length < 4) return null

  // Filter: keep level 1 entries with score >= 40
  const level1 = candidates.filter(c => c.level === 1 && c.score >= 40)
  if (level1.length < 2) return null

  return buildChapterTree(candidates)
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 2: TOC PAGE EXTRACTION
// Look for explicit table of contents pages
// ─────────────────────────────────────────────────────────────────────────────

const TOC_PAGE_MARKERS = [
  /^(?:mục lục|table of contents|contents|nội dung)\s*$/i,
  /^(?:mục lục|table of contents)\b/i,
]

// Patterns for TOC entries (with and without page numbers)
const TOC_ENTRY_PATTERNS = [
  // "1.2  Section title ......... 42"
  /^(\d{1,2}(?:\.\d{1,2}){0,2})\s+(.{4,80?})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
  // "Chapter 1  Title ........ 12"
  /^(?:chương|chapter)\s+(\d+)[:\s]+(.{4,80?})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/i,
  // "1.2  Section title" (no page)
  /^(\d{1,2}(?:\.\d{1,2}){0,2})\s{2,}(.{4,80})$/,
  // "Chương 1 Title" (no page)
  /^(?:chương|chapter|phần|part)\s+([IVX\d]+)[:\s]+(.{4,80})/i,
]

export function extractTOCPage(pagesData) {
  // Search first 12 pages for TOC marker
  let tocPageIdx = -1
  for (let i = 0; i < Math.min(12, pagesData.length); i++) {
    const firstLines = (pagesData[i].lines || []).slice(0, 6).map(l => l.text.trim())
    if (firstLines.some(l => TOC_PAGE_MARKERS.some(p => p.test(l)))) {
      tocPageIdx = i
      break
    }
  }
  if (tocPageIdx === -1) return null

  const entries = []
  // Parse up to 4 TOC pages
  for (let pi = tocPageIdx; pi < Math.min(tocPageIdx + 4, pagesData.length); pi++) {
    for (const line of pagesData[pi].lines || []) {
      const text = (line.text || '').trim()
      if (!text || text.length < 4) continue

      for (const pattern of TOC_ENTRY_PATTERNS) {
        const match = text.match(pattern)
        if (!match) continue

        const label = match[1]
        const rawTitle = (match[2] || '').replace(/\.{2,}\s*\d+\s*$/, '').trim()
        const pageNum = match[3] ? parseInt(match[3], 10) : null

        if (rawTitle.length < 3) continue
        if (isNoise(rawTitle)) continue

        const dotCount = (label.match(/\./g) || []).length
        const isRoman = /^[IVX]+$/i.test(label)
        const level = isRoman ? 1 : dotCount + 1

        entries.push({ label, title: rawTitle, level, pageStart: pageNum, full: `${label} ${rawTitle}` })
        break
      }
    }
  }

  if (entries.length < 3) return null
  return buildChapterTree(entries)
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 3: AI SYNTHESIS (fallback)
// Uses LLM to infer structure from sampled text
// ─────────────────────────────────────────────────────────────────────────────

async function ollamaGenerateJSON(prompt, timeoutMs = 60000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEN_MODEL,
        prompt,
        format: 'json',
        stream: true,
        options: { temperature: 0.1, num_ctx: 4096, num_gpu: 99 },
      }),
    })

    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of dec.decode(value, { stream: true }).split('\n').filter(Boolean)) {
        try { const o = JSON.parse(line); if (o.response) full += o.response } catch (_) {}
      }
    }
    return extractJSON(full)
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('TOC AI timed out')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function extractTOCWithAI(pagesData, lang = 'en') {
  const totalPages = pagesData.length

  // Sample 8 evenly-spaced pages
  const indices = Array.from({ length: 8 }, (_, i) => Math.floor(i * totalPages / 8))
    .filter(i => i < totalPages)

  const sampleText = indices.map(i =>
    `[Page ${pagesData[i].pageNum}]:\n${(pagesData[i].text || '').slice(0, 500)}`
  ).join('\n\n')

  const prompt = PROMPT_SYNTHETIC_TOC({ sampleText, totalPages, lang })

  try {
    const result = await ollamaGenerateJSON(prompt, 45000)
    if (!result?.chapters?.length) return null

    // Validate chapters
    const valid = (result.chapters || []).filter(ch => {
      if (!ch?.title) return false
      const words = ch.title.split(/\s+/).filter(w => /[A-Za-zÀ-ỹ]{2,}/.test(w))
      return words.length >= 2 && ch.confidence !== 0
    })

    if (valid.length < 2) return null

    return {
      chapters: valid.map((ch, i) => ({
        title: ch.title,
        subSections: ch.subSections || [],
        pageStart: ch.pageHint || null,
        confidence: ch.confidence || 0.7,
      })),
      _synthetic: true,
    }
  } catch (err) {
    console.warn('[TOC-AI] Failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TREE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildChapterTree(entries) {
  if (!entries?.length) return null

  const minLevel = Math.min(...entries.map(e => e.level || 1))
  const normalized = entries.map(e => ({ ...e, level: (e.level || 1) - minLevel + 1 }))

  const chapters = []
  for (const entry of normalized) {
    if (entry.level === 1) {
      chapters.push({
        title: entry.full || entry.title,
        subSections: [],
        pageStart: entry.pageStart || null,
        _source: entry.type || 'detected',
      })
    } else if (chapters.length > 0) {
      chapters[chapters.length - 1].subSections.push(entry.full || entry.title)
    }
  }

  // Filter: need meaningful titles (≥2 real words)
  const valid = chapters.filter(ch => {
    const bare = (ch.title || '').replace(/^[\d.]+\s*/, '').trim()
    return countWords(bare) >= 2 && !isGeneric(bare)
  })

  // Keep generics if nothing else (e.g. pure academic paper)
  const finalChapters = valid.length >= 2 ? valid : chapters.filter(c => countWords(c.title) >= 2)

  return finalChapters.length >= 2 ? { chapters: finalChapters } : null
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// Tries all strategies, returns first success + metadata
// ─────────────────────────────────────────────────────────────────────────────

export async function extractOutline(pagesData, options = {}) {
  const { lang = 'en', useAI = true } = options
  const results = []

  // S0: TOC page (most reliable when present)
  const tocPage = extractTOCPage(pagesData)
  if (tocPage?.chapters?.length >= 2) {
    console.log(`[Outline] ✓ Strategy 0 (TOC page): ${tocPage.chapters.length} chapters`)
    results.push({ toc: tocPage, strategy: 'toc-page', confidence: 0.95 })
  }

  // S1: Numbered headings (very reliable for academic/technical docs)
  const numbered = extractNumberedHeadings(pagesData)
  if (numbered?.chapters?.length >= 2) {
    console.log(`[Outline] ✓ Strategy 1 (numbered headings): ${numbered.chapters.length} chapters`)
    results.push({ toc: numbered, strategy: 'numbered', confidence: 0.6 })
  }

  // S2: Visual scoring
  const bodyFont = pagesData[0]?.bodyFont || 11
  const visual = extractByVisualScoring(pagesData, bodyFont)
  if (visual?.chapters?.length >= 2) {
    console.log(`[Outline] ✓ Strategy 2 (visual scoring): ${visual.chapters.length} chapters`)
    results.push({ toc: visual, strategy: 'visual', confidence: 0.75 })
  }

  // Return best result without AI if we have 2+ good strategies agreeing
  if (results.length >= 2) {
    const best = results.sort((a, b) => b.confidence - a.confidence)[0]
    console.log(`[Outline] Using strategy: ${best.strategy} (${best.confidence} confidence)`)
    return best.toc
  }

  if (results.length === 1) {
    console.log(`[Outline] Using strategy: ${results[0].strategy} (single match)`)
    return results[0].toc
  }

  // S3: AI fallback
  if (useAI) {
    console.log('[Outline] Falling back to AI synthesis...')
    const aiToc = await extractTOCWithAI(pagesData, lang)
    if (aiToc?.chapters?.length >= 2) {
      console.log(`[Outline] ✓ Strategy 3 (AI): ${aiToc.chapters.length} chapters`)
      return aiToc
    }
  }

  console.warn('[Outline] All strategies failed — will use semantic grouping')
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVE PAGE RANGES
// ─────────────────────────────────────────────────────────────────────────────

export function resolvePageRanges(chapters, pagesData) {
  const totalPages = pagesData[pagesData.length - 1]?.pageNum ?? 9999
  return chapters.map((ch, i) => {
    const next = chapters[i + 1]
    return {
      ...ch,
      pageEnd: next?.pageStart ? next.pageStart - 1 : totalPages,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// CHUNK ASSIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

export function assignChunksToChapters(chapters, allChunks) {
  const hasPages = chapters.some(c => c.pageStart != null && c.pageStart > 0)

  if (hasPages) {
    return chapters.map((ch, i) => {
      const start = ch.pageStart ?? 1
      const end = ch.pageEnd ?? 99999
      let chunks = allChunks.filter(c => c.pageNum >= start && c.pageNum <= end)
      if (!chunks.length) {
        // Wider window
        chunks = allChunks.filter(c => c.pageNum >= start - 2 && c.pageNum <= end + 2)
      }
      if (!chunks.length) {
        // Index-based fallback
        const idx = Math.floor(i / chapters.length * allChunks.length)
        chunks = allChunks.slice(Math.max(0, idx - 1), idx + 5)
      }
      return { chapter: ch, chunks }
    })
  }

  // Even distribution with overlap
  const perCh = Math.max(4, Math.ceil(allChunks.length / chapters.length))
  return chapters.map((ch, i) => {
    const start = Math.max(0, i * perCh - 1)
    const end = Math.min(start + perCh + 2, allChunks.length)
    return { chapter: ch, chunks: allChunks.slice(start, end) }
  })
}
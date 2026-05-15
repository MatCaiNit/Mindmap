// GenAI/utils/tocExtractor.js — v7 (restored from user's working version)
// Only change vs original v7: improve findBoundaries full-doc scan + author rejection

const OLLAMA_BASE = process.env.OLLAMA_URL       || 'http://localhost:11434'
const GEN_MODEL   = process.env.OLLAMA_GEN_MODEL || 'qwen2.5:3b'

function normalise(t) {
  return (t || '').toLowerCase()
    .replace(/^(\d+[\.\):]?\s*)+/, '').replace(/^[ivxIVX]+[\.\s]+/, '')
    .replace(/\(p\.\s*\d+\)/g, '').replace(/\.{3,}\s*\d+\s*$/, '')
    .replace(/\s{2,}/g, ' ').trim()
}

const EXCLUDE_EXACT = new Set([
  // Front/back matter — NOT content, skip in mindmap
  'abstract',
  'acknowledgements','acknowledgments','acknowledgement',
  'table of contents','contents','list of contents',
  'list of figures','list of tables','list of abbreviations',
  'list of symbols','nomenclature',
  'references','bibliography','works cited',
  'appendix','appendices','annex',
  'preface','foreword','dedication','glossary','index',
  // Vietnamese equivalents
  'tóm tắt','tóm tắt nội dung','lời cảm ơn','lời cám ơn',
  'mục lục','danh mục','bảng mục lục',
  'danh mục hình','danh mục bảng','danh mục từ viết tắt',
  'tài liệu tham khảo','phụ lục',
  'lời nói đầu','lời mở đầu','lời giới thiệu',
  'nhận xét của giáo viên',
  // NOTE: 'summary','conclusions','discussion','challenges','introduction'
  // are all valid CONTENT sections — do NOT add them here.
])

const EXCLUDE_PATTERNS = [
  /^\[\d+\]/,
  /^(figure|fig\.?|hình|table|bảng|tab\.?)\s+[\d.]+/i,
  /^[-*•●▪▸►▶]\s/,
  /^[=+\-]{4,}$/,
  /^\d{4}\s*[-–]\s*\d{4}\s*$/,
  /^[A-Z][a-zA-Z\-]{1,20},\s+[A-Z][A-Z]?\./,
  /^[A-Z][a-zA-Z\-]{1,20}\s+[A-Z][A-Z]?,/,
  /\(\d{4}\)\s*[A-Z]/,
  /^(submitted|prepared|presented)/i,
  /^(student|author|instructor|supervisor)\s*:/i,
  /^(university|faculty|college|trường|đại học|khoa)\s/i,
  /^(giảng viên|sinh viên|hướng dẫn|msv|mssv)\s*:/i,
  /^(tp\.|thành phố|hà nội|ho chi minh)\s*,/i,
  /^(©|copyright)\s/i,
  /^(email|tel|fax|www\.)/i,
  /^(page|trang)\s+\d+$/i,
  /^(IEEE|ACM|Springer|Elsevier|Nature|MDPI|Wiley)\s/i,
]

function isExcluded(text) {
  const t = (text || '').trim()
  if (!t || t.length < 2) return true
  if (t.split(/\s+/).length > 14) return true
  if (EXCLUDE_PATTERNS.some(p => p.test(t))) return true
  if (EXCLUDE_EXACT.has(normalise(t))) return true
  return false
}

function cleanHeadingLine(text) {
  if (!text) return ''
  const t = text.trim()

  // Fix: "IntroductionFor working out..." — PDF merges heading+body without space.
  // Detect lowercase immediately followed by uppercase (no space in between).
  // Only apply when line is suspiciously long AND split point is in heading range.
  if (t.length > 30) {
    const noSpaceIdx = t.search(/[a-zà-ỹ][A-ZÀ-Ỹ]/)
    if (noSpaceIdx !== -1 && noSpaceIdx > 4 && noSpaceIdx < 55) {
      // noSpaceIdx points to the lowercase char; +1 includes it, cuts before uppercase
      return t.slice(0, noSpaceIdx + 1).trim()
    }
  }

  if (t.length <= 90) return t
  // Fallback: cut at first sentence boundary (space + uppercase) after 8+ chars
  const m = t.match(/^(.{8,90}?[a-zà-ỹ])\s+[A-ZÀ-Ỹ]/)
  return m ? m[1].trim() : t.slice(0, 90).trim()
}

function buildFreqMap(pagesData) {
  const map = new Map()
  for (const pg of pagesData)
    for (const l of (pg.lines || [])) {
      const k = (l.text || '').trim().toLowerCase().slice(0, 45)
      if (!map.has(k)) map.set(k, new Set())
      map.get(k).add(pg.pageNum)
    }
  return map
}
function isRunning(text, freqMap) {
  return (freqMap.get((text || '').trim().toLowerCase().slice(0, 45))?.size || 0) > 3
}

function findBoundaries(pagesData) {
  const total = pagesData.length
  const BACK_HEADINGS = [
    /^(references?|bibliography|tài liệu tham khảo)\s*$/i,
    /^(appendix|appendices|phụ lục)\s*[a-z]?\s*$/i,
    /^(index|glossary)\s*$/i,
  ]
  const BACK_SCAN_START = Math.floor(total * 0.55)
  let backIdx = total - 1
  for (let i = BACK_SCAN_START; i < total; i++) {
    const lines = (pagesData[i].lines || []).map(l => l.text.trim())
    const found = lines.some(l => l.length >= 5 && l.length <= 40 && BACK_HEADINGS.some(p => p.test(l)))
    if (found) { backIdx = Math.max(0, i - 1); console.log(`[TOC] Back boundary: page ${pagesData[i].pageNum}`); break }
  }
  const FRONT_HEADINGS = [
    /^(abstract|tóm tắt|acknowledgements?|lời cảm ơn)/i,
    /^(table of contents|mục lục|danh mục|list of)/i,
    /^(preface|foreword|lời nói đầu)/i,
  ]
  const FRONT_CUTOFF = Math.min(Math.ceil(total * 0.15), 8)
  let frontIdx = 0
  for (let i = 0; i < FRONT_CUTOFF; i++) {
    const lines = (pagesData[i].lines || []).slice(0, 8).map(l => l.text.trim())
    if (lines.some(l => FRONT_HEADINGS.some(p => p.test(l)))) frontIdx = Math.max(frontIdx, i + 1)
  }
  return {
    startIdx: Math.max(0, frontIdx), endIdx: Math.min(total - 1, backIdx),
    startPage: pagesData[Math.max(0, frontIdx)]?.pageNum ?? 1,
    endPage:   pagesData[Math.min(total - 1, backIdx)]?.pageNum ?? 9999,
  }
}

// ─── detectScheme: first-occurrence ordering ──────────────────────────────────
// Each distinct label format is a "family". Whichever family appears first in
// the TOC entries → Level 1, next family → Level 2, etc.
//
// Families (sorted by first-occurrence position, not predefined priority):
//   'chapter'    → Chương 1, Chapter 1, Chap 1, Phần 1, Part 1
//   'upper'      → A.  B.  C.  D.  E.
//   'ROMAN'      → I.  II.  III.  IV.  V. ... (uppercase roman)
//   'lower'      → a.  b.  c.  d.  e.
//   'roman'      → i.  ii.  iii.  iv.  v. ... (lowercase roman)
//   'arabic'     → 1.  2.  3.  4.
//   'dotted'     → 1.1  1.2  2.1  (always child of 'arabic')
//   'nolabel'    → "Title ........... 3"  (treated as L1)
//   'sub'        → a.  b.  (same as 'lower', merged)
//
// Example — Báo cáo thực tập:
//   A. (upper, first)  → L1
//   I. (ROMAN, second) → L2
//   1. (arabic, third) → L3
//
// Example — PSO paper:
//   1. (arabic, first)  → L1
//   1.1 (dotted, after) → L2

function detectScheme(entries) {
  // All distinct format families, in the order they first appear in entries
  const FAMILIES = [
    { name: 'chapter', test: e => e.type === 'chapter' || e.type === 'part' },
    { name: 'upper',   test: e => e.type === 'upper' },
    { name: 'ROMAN',   test: e => e.type === 'roman' },
    { name: 'lower',   test: e => e.type === 'lower' || e.type === 'sub' },
    { name: 'roman',   test: e => e.type === 'lowerroman' },
    { name: 'arabic',  test: e => e.type === 'arabic' },
  ]

  // Find first occurrence index for each family
  const order = FAMILIES
    .map(f => {
      const idx = entries.findIndex(e => f.test(e))
      return { name: f.name, idx, test: f.test }
    })
    .filter(f => f.idx !== -1)
    .sort((a, b) => a.idx - b.idx)

  // Assign levels: first-occurring family = L1, next = L2, etc.
  const levelOf = {}
  order.forEach((f, i) => { levelOf[f.name] = i + 1 })

  // dotted (1.1, 1.2) is always one level below arabic
  const arabicLevel = levelOf['arabic'] ?? order.length + 1
  const maxNamedLevel = order.length

  console.log('[TOC] Scheme:', order.map(f => `${f.name}→L${levelOf[f.name]}`).join(', '))

  return (e) => {
    if (e.type === 'chapter' || e.type === 'part')   return levelOf['chapter'] ?? 1
    if (e.type === 'upper')                           return levelOf['upper']   ?? 1
    if (e.type === 'roman')                           return levelOf['ROMAN']   ?? 1
    if (e.type === 'lower' || e.type === 'sub')       return levelOf['lower']   ?? 2
    if (e.type === 'lowerroman')                      return levelOf['roman']   ?? 2
    if (e.type === 'arabic')                          return arabicLevel
    if (e.type === 'dotted')                          return arabicLevel + e.dots  // 1.1=L+1, 1.1.1=L+2
    if (e.type === 'nolabel')                         return 1   // no-label = top-level
    return maxNamedLevel + 1
  }
}

// adjustArabicLevels: fix edge case where arabic appears at wrong level
// due to context (e.g., arabic used as L1 but immediately after a chapter entry)
function adjustArabicLevels(entries) {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].type !== 'arabic') continue
    // Find nearest non-arabic entry before this one
    let j = i - 1
    while (j >= 0 && (entries[j].type === 'arabic' || entries[j].type === 'dotted')) j--
    if (j >= 0) {
      const contextLevel = entries[j].level + 1
      // Only correct if context suggests this arabic should be shallower
      if (contextLevel < entries[i].level)
        entries[i] = { ...entries[i], level: contextLevel }
    }
  }
  return entries
}

function buildTree(entries) {
  if (!entries?.length) return null
  const minL = Math.min(...entries.map(e => e.level))
  const norm = entries.map(e => ({ ...e, level: e.level - minL + 1 }))

  // Use a stack to track current path at each level
  const root = { children: [] }
  const stack = [{ node: root, level: 0 }]

  for (const e of norm) {
    const node = {
      title:     e.title,
      level:     e.level,
      pageStart: e.pageStart ?? null,
      pageEnd:   null,
      children:  [],
    }

    // Pop stack until we find the right parent level
    while (stack.length > 1 && stack[stack.length - 1].level >= e.level) {
      stack.pop()
    }

    const parent = stack[stack.length - 1].node
    parent.children.push(node)
    stack.push({ node, level: e.level })
  }

  const chapters = root.children
  if (!chapters.length) return null

  // Set pageEnd for each chapter
  for (let i = 0; i < chapters.length; i++) {
    chapters[i].pageEnd = i + 1 < chapters.length
      ? (chapters[i + 1].pageStart ?? 9999) - 1
      : 9999
  }

  const ok = chapters.filter(c =>
    c.title.split(/\s+/).some(w => /[A-Za-zÀ-ỹ]{2,}/.test(w))
  )
  return ok.length >= 2 ? ok : null
}

// ─── S1: Find TOC page → send raw text to LLM ───────────────────────────────
// No regex parsing. Just find the page, grab its text, let LLM parse it.
// LLM reads TOC pages perfectly regardless of format (A., I., 1., etc.)

const TOC_PAGE_MARKERS = [
  // Exact header line (whole line = TOC title)
  /^(mục lục|mụclục|table of contents|tableofcontents|contents|danh mục|nội dung)\s*$/i,
  // Partial match at start of line
  /^(mục lục|table of contents|contents)\b/i,
  // In-document "Contents" followed by TOC entries
  /^(Contents|CONTENTS|TABLE OF CONTENTS|MỤC LỤC)$/,
]

// Returns all lines from TOC page(s), or null if no TOC page found
function findTOCPageText(pagesData) {
  let tocStart = -1
  // Search in first 20% of document (not just first 15 pages)
  const searchLimit = Math.min(Math.max(15, Math.floor(pagesData.length * 0.20)), 30)
  for (let i = 0; i < Math.min(searchLimit, pagesData.length); i++) {
    const allLines = (pagesData[i].lines || []).map(l => l.text.trim()).filter(Boolean)
    // Check first 8 lines of page (header might not be line 0 if there's a page number)
    if (allLines.slice(0, 8).some(l => TOC_PAGE_MARKERS.some(p => p.test(l)))) {
      tocStart = i; break
    }
  }
  if (tocStart === -1) return null

  const skipPages = new Set()
  const tocLines  = []

  // Collect all TOC pages — stop when we hit body content.
  // A page is still TOC if it has entries with dots/page numbers.
  // A page is body content if: most lines are long prose (>80 chars)
  // and it has very few dot-separated entries.
  for (let pi = tocStart; pi < Math.min(tocStart + 15, pagesData.length); pi++) {
    const pageLines = (pagesData[pi].lines || []).map(l => l.text.trim()).filter(Boolean)
    if (!pageLines.length) continue

    if (pi > tocStart) {
      // Count TOC-like lines (have dots/page number or short titles with labels)
      const tocLike = pageLines.filter(l =>
        /\.{3,}|\s{4,}\d+\s*$/.test(l) ||           // has dots or trailing page
        /^(?:[A-Z]\.|[IVX]+\.|i{1,3}v?\.|\d+\.)/.test(l) // starts with label
      ).length
      const prose = pageLines.filter(l => l.length > 80 && !/\.{3,}/.test(l)).length

      // Stop if: less than 20% TOC-like AND more than 50% prose
      if (tocLike < pageLines.length * 0.2 && prose > pageLines.length * 0.5) {
        console.log(`[TOC] S1: stopped at page index ${pi} (body content detected)`)
        break
      }
    }

    skipPages.add(pagesData[pi].pageNum)
    tocLines.push(...pageLines)
  }

  if (tocLines.length < 3) return null
  console.log(`[TOC] S1: Found TOC page at index ${tocStart}, ${tocLines.length} lines (${skipPages.size} pages)`)
  return { lines: tocLines, text: tocLines.join('\n'), skipPages }
}

// ── JS TOC parser (no LLM) ────────────────────────────────────────────────────
// Patterns for TOC entries. Matched in order — first match wins.
const TOC_ENTRY_RE = [
  // "1.2  Title ........ 12"  or  "1.2.3  Title ... 12"
  /^(\d{1,2}(?:\.\d{1,2}){0,3})[\.\s]{1,3}(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
  // "1.2  Title" (no page number)
  /^(\d{1,2}(?:\.\d{1,2}){0,3})[\.\s]{1,3}(.{3,150})\s*$/,
  // "Chương 1 - Title .... 4"
  /^(?:chương|chapter|phần|part)\s+(\d+)\s*[-–—:\s.]*\s*(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/i,
  // "Chương I: Title"
  /^(?:chương|chapter|phần|part)\s+([IVXivx\d]+)\s*[-–—:\s.]*\s*(.{3,150})/i,
  // "I.  Title .... 4"  (Roman upper)
  /^(XI{0,2}|X|IX|VI{0,3}|V|IV|I{1,3})\s*[.\s]+(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
  /^(XI{0,2}|X|IX|VI{0,3}|V|IV|I{1,3})\s*[.\s]+(.{3,150})\s*$/,
  // "i.  Title .... 4"  (Roman lower)
  /^(xi{0,2}|x|ix|vi{0,3}|v|iv|i{1,3})\s*[.\s]+(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
  /^(xi{0,2}|x|ix|vi{0,3}|v|iv|i{1,3})\s*[.\s]+(.{3,150})\s*$/,
  // "A.  Title .... 4"  (Uppercase letter — Vietnamese A, B, C, D, E sections)
  /^([A-Z])\.\s+(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
  /^([A-Z])\.\s+(.{3,150})\s*$/,
  // "a.  Title .... 4"  (Lowercase letter)
  /^([a-z])\.\s+(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
  // "Title ......... 4"  (no label — e.g. "Lời nói đầu ..... 3")
  /^()(.{5,150})(?:\.{5,}|\s{10,})\s*(\d{1,4})\s*$/,
]

function parseTOCPageJS(tocResult, pagesData) {
  const { lines, skipPages } = tocResult

  // ── Merge continuation lines ─────────────────────────────────────────────
  // Long TOC titles wrap to next line in PDF, e.g.:
  //   "1. Phát triển, thiết kế game để số hóa các bài tập, hình ảnh trong sách"
  //   "thành các game có thể tương tác được.................... 4"   ← continuation
  //
  // A line is a CONTINUATION if it does NOT start with any known label format.
  const LABEL_START = /^(?:\d{1,2}(?:\.\d{1,2})*[\.\s]|[A-Za-z][\.]\s|(?:chương|chapter|chap|phần|part)\s+\d|(?:XI{0,2}|X|IX|VI{0,3}|V|IV|I{1,3})\s*[.\s]|(?:xi{0,2}|x|ix|vi{0,3}|v|iv|i{1,3})\s*[.\s])/i

  const merged = []
  for (const line of lines) {
    if (!line.trim()) continue
    const t = line.trim()
    if (TOC_PAGE_MARKERS.some(p => p.test(t))) continue  // skip header line "Mục lục"

    // Is this a continuation of previous line?
    // Key insight: the LABEL line comes first (no page/dots), the CONTINUATION
    // line comes second (may or may not have dots+page).
    // So: if PREVIOUS line has no page number yet AND current line doesn't
    // start a new entry → it's a continuation.
    const prevLine = merged[merged.length - 1] ?? ''
    const prevHasPage = /\.{3,}\s*\d+\s*$|\s{4,}\d+\s*$|\d{1,4}\s*$/.test(prevLine)
    const isContinuation = merged.length > 0
      && !prevHasPage                   // previous line incomplete (no page yet)
      && !LABEL_START.test(t)           // current line not a new entry
      && t.length > 3
      && !TOC_PAGE_MARKERS.some(p=>p.test(t))
      && !t.match(/^[A-ZĐÀẢÃÁẠĂẮẶẰẲẴÂẤẬẦẨẪ]{3,}/u)  // not all-caps new heading

    if (isContinuation) {
      // Append to previous line with a space
      merged[merged.length - 1] = merged[merged.length - 1] + ' ' + t
    } else {
      merged.push(t)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const rawEntries = [], seen = new Set()

  for (const text of merged) {
    if (!text || TOC_PAGE_MARKERS.some(p => p.test(text))) continue
    if (text.length < 3 || text.length > 400) continue

    for (const re of TOC_ENTRY_RE) {
      const m = text.match(re); if (!m) continue
      const label    = (m[1] || '').trim()
      const rawTitle = (m[2] || '')
        .replace(/\.{2,}[\s\d]*$/, '')
        .replace(/\s{4,}\d+\s*$/, '')
        .trim()
      const title = rawTitle || label
      if (title.length < 2 || isExcluded(title)) break

      const n = normalise(title); if (seen.has(n)) break; seen.add(n)

      const isChapter     = /^(chương|chapter|chap|phần|part)/i.test(text)
      const isUpperRoman  = /^(XI{0,2}|X|IX|VI{0,3}|V|IV|I{1,3})$/.test(label) && label === label.toUpperCase() && label.length > 0
      const isLowerRoman  = /^(xi{0,2}|x|ix|vi{0,3}|v|iv|i{1,3})$/.test(label) && label === label.toLowerCase() && /[ivx]/.test(label)
      const isUpperLetter = /^[A-Z]$/.test(label) && !isUpperRoman
      const isLowerLetter = /^[a-z]$/.test(label) && !isLowerRoman
      const isNoLabel     = label === ''
      const dots          = (label.match(/\./g) || []).length

      const type = isChapter     ? 'chapter'
                 : isUpperRoman  ? 'roman'        // I. II. III. (uppercase roman)
                 : isLowerRoman  ? 'lowerroman'   // i. ii. iii. (lowercase roman)
                 : isUpperLetter ? 'upper'         // A. B. C.
                 : isLowerLetter ? 'lower'         // a. b. c.
                 : isNoLabel     ? 'nolabel'
                 : dots > 0      ? 'dotted'        // 1.1 1.2 2.1
                 : 'arabic'                        // 1. 2. 3.

      rawEntries.push({ label, title, type, dots, pageStart: m[3] ? parseInt(m[3]) : null })
      break
    }
  }

  if (rawEntries.length < 2) {
    console.log(`[TOC] S1-JS: only ${rawEntries.length} entries, too few`)
    return null
  }

  // Detect no-space PDF artifact: if >40% of entries have titles with no internal spaces
  // and title is long → likely concatenated words (e.g. "BackgroundandMotivation")
  const noSpaceCount = rawEntries.filter(e => {
    const t = e.title.trim()
    return t.length > 12 && !t.includes(' ') && !/^[A-Za-z]$/.test(t)
  }).length
  if (noSpaceCount > rawEntries.length * 0.4) {
    console.log(`[TOC] S1-JS: ${noSpaceCount}/${rawEntries.length} entries look like no-space PDF artifacts → LLM`)
    return null   // signals extractTOCBest to use LLM
  }

  const scheme  = detectScheme(rawEntries)
  const entries = adjustArabicLevels(rawEntries.map(e => ({ ...e, level: scheme(e) })))
  const chapters = buildTree(entries)
  console.log(`[TOC] S1-JS: ${chapters?.length || 0} chapters, ${rawEntries.length} entries`)
  return chapters?.length >= 2
    ? { chapters: assignPageRanges(chapters, pagesData), method: 'toc-page-js', skipPages }
    : null
}

// Parse TOC page text via LLM (fallback when JS parse fails)
async function parseTOCPageWithLLM(tocPageText, pagesData, lang = 'en') {
  const isVi = lang === 'vi'
  const prompt = isVi ? `/no_think
Đây là trang MỤC LỤC của tài liệu:

${tocPageText}

Chuyển trang mục lục trên thành Markdown:
- ## = Chương / Phần chính (A., B., C. hoặc I., II. hoặc 1, 2, 3...)
- ### = Mục con (I., II. hoặc 1., 2. bên dưới chương chính)
BỎ QUA: Lời cảm ơn, Tài liệu tham khảo, Phụ lục, Nhận xét giảng viên.
CHỈ xuất heading. KHÔNG văn xuôi. KHÔNG thêm gì ngoài mục lục.

MỤC LỤC MARKDOWN:
##` : `/no_think
This is the TABLE OF CONTENTS page of a document:

${tocPageText}

Convert the TOC above into Markdown:
- ## = Main chapter / section (A., B., C. or I., II. or 1, 2, 3...)
- ### = Subsection (I., II. or 1., 2. under a main chapter)
SKIP: Acknowledgements, References, Appendix, Reviewer comments.
Output ONLY headings. NO prose. NO extra content.

MARKDOWN TOC:
##`

  console.log(`[TOC-AI] Parsing TOC page (${tocPageText.length} chars) via LLM...`)
  const ctl = new AbortController()
  const tm  = setTimeout(() => ctl.abort(), 60_000)

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEN_MODEL, prompt, stream: true,
        options: { temperature: 0.05, num_ctx: 4096, num_predict: 2000, num_gpu: 99, num_thread: 4 },
      }),
    })
    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const rdr = res.body.getReader(), dec = new TextDecoder()
    let raw = ''
    while (true) {
      const { done, value } = await rdr.read(); if (done) break
      for (const ln of dec.decode(value, { stream:true }).split('\n').filter(Boolean)) {
        try { const o = JSON.parse(ln); if (o.thinking) continue; if (o.response) raw += o.response } catch(_) {}
      }
    }
    clearTimeout(tm)
    // Prompt ends with "##" → model continues from there, so raw starts with " GIỚI THIỆU..."
    // Prepend "##" so parseMarkdownTOC sees proper headings
    let md = ('## ' + raw)
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*/g, '')
      .trim()

    // If model already output its own "##" (didn't continue our seed), avoid "## ## ..."
    md = md.replace(/^## ##\s+/, '## ').replace(/^##\s*##\s+/, '## ')

    console.log(`[TOC-AI] TOC page parsed: ${md.length} chars`)
    console.log('[TOC-AI] First 400:', md.slice(0, 400).replace(/\n/g, ' | '))
    const parsed = parseMarkdownTOC(md)
    if (!parsed?.length) return null
    console.log(`[TOC-AI] S1-LLM: ${parsed.length} chapters`)
    return { chapters: assignPageRanges(parsed, pagesData), method: 'toc-page-llm' }
  } catch (err) {
    clearTimeout(tm)
    if (err.name !== 'AbortError') console.error('[TOC-AI S1]', err.message)
    return null
  }
}

export function extractTOCRobust(pagesData) {
  // Synchronous: just detect if TOC page exists and return its raw text
  if (!pagesData?.length) return null
  return findTOCPageText(pagesData)   // { text, skipPages } | null
}


// ─── extractTOCWithFullText: heading signals + sampled content → LLM ────────
// Early-version approach that produced accurate, complete TOCs.
// Sends:
//   1. Heading signals: bold/large/numbered lines from every page (structured)
//   2. First ~10 pages full text (captures early structure)
//   3. Evenly sampled snippets from rest of doc
// Much cleaner than raw full-text — model focuses on heading signals.
export async function extractTOCWithFullText(pagesData, options = {}) {
  const { lang = 'en', targetDepth = 3 } = options
  const totalPages = pagesData.length

  // ── 1. Collect heading signals (bold/large/numbered lines across ALL pages) ──
  const headingLines = pagesData.flatMap(pg => {
    const bodyFont = pg.bodyFont || 11
    return (pg.lines || [])
      .filter(l => {
        const t = (l.text || '').trim()
        if (!t || t.length < 3 || t.length > 150) return false
        if (/^[A-Z][a-z]+,\s+[A-Z]/.test(t)) return false   // author names
        if (/^\[\d+\]/.test(t)) return false                  // references
        const isBold    = l.isBold === true
        const isBig     = (l.avgFont || 0) > bodyFont * 1.08
        const isNum     = /^\d{1,2}[\.\s]/.test(t)
        const isChap    = /^(chương|chapter|phần|part)\s+\d+/i.test(t)
        const isRoman   = /^[IVX]{1,5}[\.\s]/.test(t)
        const isUpper   = /^[A-E]\.\s/.test(t)               // Vietnamese A. B. C.
        return isBold || isBig || isNum || isChap || isRoman || isUpper
      })
      .map(l => `[p${pg.pageNum}] ${l.text.trim()}`)
  })
  // Deduplicate: same text across multiple pages = running header → keep first only
  const seenHL = new Set()
  const uniqHeadings = headingLines.filter(line => {
    const key = line.replace(/^\[p\d+\]\s*/, '').toLowerCase().trim().slice(0, 50)
    if (seenHL.has(key)) return false
    seenHL.add(key); return true
  }).slice(0, 300)

  // ── 2. First pages (full text, captures intro + structure) ──────────────────
  const firstPages = pagesData.slice(0, Math.min(10, pagesData.length))
  const firstText  = firstPages
    .map(p => `[p${p.pageNum}]\n${(p.text || '').slice(0, 600)}`)
    .join('\n\n')

  // ── 3. Sampled snippets across full document ─────────────────────────────────
  const step = pagesData.length / Math.min(25, pagesData.length)
  const sampledText = Array.from({ length: Math.min(25, pagesData.length) }, (_, i) => {
    const pg = pagesData[Math.floor(i * step)]
    return pg ? `[p${pg.pageNum}] ${(pg.text || '').slice(0, 350)}` : ''
  }).filter(Boolean).join('\n\n')

  // Estimate chapter count from heading signals for instruction
  const chapHints = uniqHeadings.filter(l =>
    /chương|chapter|^[A-E]\.\s/i.test(l.replace(/^\[p\d+\]\s*/,''))
  ).length
  const estChapters = Math.max(chapHints || 0, 3)

  const isVi = lang === 'vi'

  const prompt = isVi ? `/no_think
Bạn là chuyên gia phân tích cấu trúc tài liệu ${totalPages} trang.
Nhiệm vụ: Tạo MỤC LỤC MARKDOWN chính xác từ tài liệu bên dưới.

CÁC TIÊU ĐỀ TÌM THẤY (ưu tiên cao nhất):
${uniqHeadings.slice(0, 200).join('\n')}

NỘI DUNG ĐẦU TÀI LIỆU:
${firstText.slice(0, 3000)}

NỘI DUNG MẪU (phân bố đều):
${sampledText.slice(0, 3000)}

QUY TẮC:
- ## = Chương / Phần chính (tài liệu có ~${estChapters} mục chính)
- ### = Mục con
- BỎ QUA: Tài liệu tham khảo, Phụ lục, Lời cảm ơn, Mục lục, Nhận xét giảng viên
- Liệt kê TẤT CẢ chương ##, không bỏ sót
- CHỈ xuất ## và ###. KHÔNG ####. KHÔNG văn xuôi.

MỤC LỤC MARKDOWN:
##` : `/no_think
You are a document structure expert analyzing a ${totalPages}-page document.
Task: Generate an accurate MARKDOWN TABLE OF CONTENTS from the document below.

HEADING SIGNALS FOUND (highest priority — use these first):
${uniqHeadings.slice(0, 200).join('\n')}

DOCUMENT START (full text):
${firstText.slice(0, 3000)}

SAMPLED CONTENT (evenly distributed):
${sampledText.slice(0, 3000)}

RULES:
- ## = Main chapter / part (document has ~${estChapters} main sections)
- ### = Section / subsection
- SKIP: References, Appendix, Acknowledgements, TOC pages, Reviewer comments
- List ALL ## chapters — do NOT skip any
- Output ONLY ## and ###. NO ####. NO prose.

MARKDOWN TOC:
##`

  console.log(`[TOC-AI] heading signals: ${uniqHeadings.length} | first: ${firstText.length}c | sampled: ${sampledText.length}c → Ollama...`)
  const ctl = new AbortController()
  const tm  = setTimeout(() => ctl.abort(), 180_000)

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      signal:  ctl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  GEN_MODEL,
        prompt,
        stream: true,
        options: {
          temperature: 0.05,
          num_ctx:     16384,
          num_predict: 4000,
          num_gpu:     99,
          num_thread:  4,
        },
      }),
    })
    if (!res.ok) throw new Error(`Ollama ${res.status}`)

    const rdr = res.body.getReader(), dec = new TextDecoder()
    let raw = ''
    while (true) {
      const { done, value } = await rdr.read(); if (done) break
      for (const ln of dec.decode(value, { stream:true }).split('\n').filter(Boolean)) {
        try {
          const o = JSON.parse(ln)
          if (o.thinking) continue
          if (o.response) raw += o.response
        } catch (_) {}
      }
    }
    clearTimeout(tm)

    let md = ('## ' + raw)
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*/g, '')
      .replace(/^## ##\s+/, '## ').replace(/^##\s*##\s+/, '## ')
      .trim()

    console.log(`[TOC-AI] Got ${md.length} chars: ${md.slice(0, 250).replace(/\n/g,' ')}`)

    const parsed = parseMarkdownTOC(md)
    if (!parsed?.length) { console.log('[TOC-AI] parseMarkdownTOC returned null'); return null }

    console.log(`[TOC-AI] Parsed: ${parsed.length} chapters`)
    return { chapters: assignPageRanges(parsed, pagesData), method: 'ai-fulltext' }

  } catch (err) {
    clearTimeout(tm)
    if (err.name !== 'AbortError') console.error('[TOC-AI]', err.message)
    return null
  }
}


// ─── extractTOCBest: 3-path strategy ─────────────────────────────────────────
// Path 1a: TOC page found → JS parse (instant, 0ms)
// Path 1b: JS parse fails → LLM parse the TOC page text (fast, ~10-20s)
// Path 2:  No TOC page → LLM full-text with heading signals (~30-60s)
export async function extractTOCBest(pagesData, options = {}) {
  const { lang = 'en' } = options

  const tocPage = findTOCPageText(pagesData)

  if (tocPage) {
    // Path 1a: JS parse (no LLM needed)
    const jsResult = parseTOCPageJS(tocPage, pagesData)
    if (jsResult?.chapters?.length >= 2) {
      console.log(`[TOC] S1-JS: ${jsResult.chapters.length} chapters ✅`)
      return jsResult
    }

    // Path 1b: JS failed → send TOC page text to LLM
    console.log('[TOC] S1-JS failed → sending TOC page to LLM...')
    const llmResult = await parseTOCPageWithLLM(tocPage.text, pagesData, lang)
    if (llmResult?.chapters?.length >= 2) {
      console.log(`[TOC] S1-LLM: ${llmResult.chapters.length} chapters ✅`)
      return llmResult
    }
    console.log('[TOC] S1-LLM also failed → full-text AI fallback')
  } else {
    console.log('[TOC] No TOC page → full-text AI...')
  }

  // Path 2: Full-text AI (heading signals + sampled content)
  const ai = await extractTOCWithFullText(pagesData, options)
  if (ai?.chapters?.length >= 2) return ai

  console.log('[TOC] All paths failed')
  return null
}


function parseMarkdownTOC(md) {
  const entries = []
  for (const line of md.split('\n').map(l => l.trim()).filter(Boolean)) {
    const hm = line.match(/^(#{1,4})\s+(.+)/)
    if (hm) {
      const title = hm[2]
        .replace(/\*\*/g, '')
        .replace(/\[p\d+\]/g, '')
        .replace(/^\d+[\.\ ]\s*/, '')
        .trim()
      if (title.length >= 2 && !isExcluded(title))
        entries.push({ level: hm[1].length, title, pageStart: null, type: 'ai' })
    }
  }
  if (entries.length < 2) return null
  const minL = Math.min(...entries.map(e => e.level))
  return buildTree(entries.map(e => ({ ...e, level: e.level - minL + 1 })))
}


export function assignPageRanges(chapters, pagesData) {
  if(!chapters?.length||!pagesData?.length) return chapters||[]
  const lastPage=pagesData[pagesData.length-1]?.pageNum??9999
  const idx=[]
  for(const pg of pagesData)for(const l of (pg.lines||[])){const t=(l.text||'').trim();if(t.length>=3&&(l.isBold||(l.avgFont||0)>(pg.bodyFont||11)*1.04))idx.push({norm:normalise(t),pageNum:pg.pageNum})}
  function findPage(title){const nt=normalise(title);for(const{norm,pageNum}of idx)if(norm===nt)return pageNum;const tw=nt.split(/\s+/).filter(w=>w.length>2);if(!tw.length)return null;for(const{norm,pageNum}of idx)if(tw.filter(w=>norm.includes(w)).length/tw.length>=0.6)return pageNum;return null}
  function walk(nodes,defS=1,defE=lastPage){for(let i=0;i<nodes.length;i++){const ch=nodes[i],next=nodes[i+1];ch.pageStart=ch.pageStart??findPage(ch.title)??defS;const ns=next?(next.pageStart??findPage(next.title)):null;ch.pageEnd=ns?ns-1:defE;if(ch.children?.length)walk(ch.children,ch.pageStart,ch.pageEnd)}return nodes}
  return walk([...chapters])
}

export function getChapterChunks(chapter, allChunks, topK=10) {
  const{pageStart,pageEnd,title}=chapter;let pool=allChunks
  if(pageStart>0&&pageEnd!=null){const strict=allChunks.filter(c=>c.pageNum!=null&&c.pageNum>=pageStart&&c.pageNum<=pageEnd);if(strict.length>=1)pool=strict;else{const wide=allChunks.filter(c=>c.pageNum!=null&&c.pageNum>=pageStart-3&&c.pageNum<=pageEnd+3);if(wide.length>=1)pool=wide}}
  const bySection=allChunks.filter(c=>c.sectionTitle&&normalise(c.sectionTitle).includes(normalise(title).slice(0,20)));if(bySection.length>=1)pool=[...new Map([...pool,...bySection].map(c=>[c.chunkIndex,c])).values()]
  const terms=title.toLowerCase().split(/\s+/).filter(w=>w.length>2&&!/^(và|của|the|and|for)$/.test(w))
  return pool.map(c=>({...c,_s:terms.reduce((s,t)=>s+((c.text||'').toLowerCase().includes(t)?1:0),0)/Math.max(terms.length,1)})).sort((a,b)=>b._s-a._s).slice(0,topK)
}

export function levenshtein(a,b){const m=a.length,n=b.length;const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);return dp[m][n]}
export function isTooSimilar(a,b,thr=0.75){const na=a.toLowerCase().trim(),nb=b.toLowerCase().trim();if(na===nb)return true;return 1-levenshtein(na,nb)/Math.max(na.length,nb.length,1)>=thr}
export function dedupNodes(candidates,ancestorTitles=[],thr=0.78){const kept=[];for(const c of candidates){const title=c.text||c.title||'';if(!title)continue;if(ancestorTitles.some(a=>isTooSimilar(title,a,thr)))continue;if(kept.some(k=>isTooSimilar(title,k.text||k.title||'',thr)))continue;kept.push(c)};return kept}
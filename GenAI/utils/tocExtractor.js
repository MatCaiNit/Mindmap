// GenAI/utils/tocExtractor.js — v8 (streamLLM transport + 0-signal fast-skip)
// Changes vs v7:
//  · parseTOCPageWithLLM / extractTOCWithFullText now stream via shared
//    streamLLM (../utils/llm.js) → toggle Ollama/Gemini by LLM_PROVIDER env.
//  · extractTOCWithFullText returns null IMMEDIATELY when < 3 heading signals
//    (structureless doc) — no wasted LLM round-trip. This is the fix for the
//    "[TOC-AI] heading signals: 0 ... → Ollama" hang on prose PDFs.

import { streamLLM } from "./llm.js";

const OLLAMA_BASE = process.env.OLLAMA_URL       || 'http://localhost:11434'
const GEN_MODEL   = process.env.OLLAMA_GEN_MODEL || 'qwen2.5:3b'

function normalise(t) {
  return (t || '').normalize('NFC').toLowerCase()
    .replace(/^(\d+[\.\):]?\s*)+/, '')
    .replace(/^[ivxIVX]+[\.\s]+/, '')
    .replace(/\(p\.\s*\d+\)/g, '')
    .replace(/\.{3,}\s*\d+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const EXCLUDE_EXACT = new Set([
  'abstract',
  'acknowledgements','acknowledgments','acknowledgement',
  'table of contents','contents','list of contents',
  'list of figures','list of tables','list of abbreviations',
  'list of symbols','nomenclature',
  'references','bibliography','works cited',
  'appendix','appendices','annex',
  'preface','foreword','dedication','glossary','index',
  'tóm tắt','tóm tắt nội dung','lời cảm ơn','lời cám ơn',
  'mục lục','danh mục','bảng mục lục',
  'danh mục hình','danh mục bảng','danh mục từ viết tắt',
  'tài liệu tham khảo','phụ lục',
  'lời nói đầu','lời mở đầu','lời giới thiệu',
  'nhận xét của giáo viên',
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
  /^(danh sách hình|danhsáchhình|danh sách bảng|danhsáchbảng)\b/i,
  /^(danh mục (hình|bảng|ký hiệu|từ viết tắt|các từ))/i,
  /^(list of (figures|tables|abbreviations|symbols))/i,
  /^(lời cam đoan|lờicamđoan|lời cảm ơn|lờicảmơn)\s*$/i,
  /^(tóm tắt|tómtắt|abstract)\s*$/i,
  /^(danh mục|danhmục|danhsách)\s+/i,
  ]

function isExcluded(text) {
  const t = (text || '').trim()
  if (!t || t.length < 2) return true
  if (t.split(/\s+/).length > 14) return true
  if (EXCLUDE_PATTERNS.some(p => p.test(t))) return true
  if (EXCLUDE_EXACT.has(normalise(t))) return true
  if (/[a-zà-ỹ]\.$/.test(t) && t.split(/\s+/).length <= 6) return true
  return false
}

function cleanHeadingLine(text) {
  if (!text) return ''
  const t = text.trim()
  if (t.length > 30) {
    const noSpaceIdx = t.search(/[a-zà-ỹ][A-ZÀ-Ỹ]/)
    if (noSpaceIdx !== -1 && noSpaceIdx > 4 && noSpaceIdx < 55) {
      return t.slice(0, noSpaceIdx + 1).trim()
    }
  }
  if (t.length <= 90) return t
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
    /^(table of contents|mục lục|danh mục|list of|contents|content)/i,
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

function detectScheme(entries) {
  const FAMILIES = [
    { name: 'chapter', test: e => e.type === 'chapter' || e.type === 'part' },
    { name: 'upper',   test: e => e.type === 'upper' },
    { name: 'ROMAN',   test: e => e.type === 'roman' },
    { name: 'alphadot',test: e => e.type === 'alphadot' },
    { name: 'lower',   test: e => e.type === 'lower' || e.type === 'sub' },
    { name: 'roman',   test: e => e.type === 'lowerroman' },
    { name: 'arabic',  test: e => e.type === 'arabic' },
  ]

  const order = FAMILIES
    .map(f => {
      const idx = entries.findIndex(e => f.test(e))
      return { name: f.name, idx, test: f.test }
    })
    .filter(f => f.idx !== -1)
    .sort((a, b) => a.idx - b.idx)

  const levelOf = {}
  order.forEach((f, i) => { levelOf[f.name] = i + 1 })

  const maxNamedLevel = order.length

  // The "base" level that dotted numbers (1.1, 2.2.1) hang under.
  // If the doc has a real standalone arabic level (entries like "1", "2"),
  // dotted sits just below it. But many theses use "Chương N" + "N.M" with
  // NO standalone "N" entries — then `levelOf['arabic']` is undefined and the
  // old fallback (order.length + 1) pushed 1.1 one level too deep, deleting a
  // whole tier and collapsing the tree to flat chapters. In that case dotted
  // must anchor to the top structural level (chapter/upper/roman = L1), so
  // "1.1" → L2, "1.1.1" → L3.
  const topStructLevel =
    levelOf['chapter'] ?? levelOf['upper'] ?? levelOf['ROMAN'] ?? 1
  const hasStandaloneArabic = levelOf['arabic'] != null
  const arabicLevel = hasStandaloneArabic
    ? levelOf['arabic']
    : topStructLevel + 1
  const dottedBase = hasStandaloneArabic ? levelOf['arabic'] : topStructLevel

  console.log('[TOC] Scheme:', order.map(f => `${f.name}→L${levelOf[f.name]}`).join(', '),
    `| dotted base L${dottedBase}`)

  return (e) => {
    if (e.type === 'chapter' || e.type === 'part')   return levelOf['chapter'] ?? 1
    if (e.type === 'upper')                           return levelOf['upper']   ?? 1
    if (e.type === 'roman')                           return levelOf['ROMAN']   ?? 1
    if (e.type === 'lower' || e.type === 'sub')       return levelOf['lower']   ?? 2
    if (e.type === 'lowerroman')                      return levelOf['roman']   ?? 2
    if (e.type === 'arabic')                          return arabicLevel
    // "1.1" (dots=1) → dottedBase+1 ; "1.1.1" (dots=2) → dottedBase+2
    if (e.type === 'dotted')                          return dottedBase + e.dots
    // "A.1" / "B.2" appendix sub-entry → one level below the letter tier
    if (e.type === 'alphadot') {
      const base = levelOf['upper'] ?? levelOf['chapter'] ?? 1
      return base + e.dots
    }
    if (e.type === 'nolabel')                         return 1
    return maxNamedLevel + 1
  }
}

function adjustArabicLevels(entries) {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].type !== 'arabic') continue
    let j = i - 1
    while (j >= 0 && (entries[j].type === 'arabic' || entries[j].type === 'dotted')) j--
    if (j >= 0) {
      const contextLevel = entries[j].level + 1
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

    while (stack.length > 1 && stack[stack.length - 1].level >= e.level) {
      stack.pop()
    }

    const parent = stack[stack.length - 1].node
    parent.children.push(node)
    stack.push({ node, level: e.level })
  }

  const chapters = root.children
  if (!chapters.length) return null

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

const TOC_PAGE_MARKERS = [
  /^(mục lục|mụclục|table of contents|tableofcontents|contents|danh mục|nội dung)\s*$/i,
  /^(mục lục|table of contents|contents)\b/i,
  /^(Contents|CONTENTS|TABLE OF CONTENTS|MỤC LỤC)$/,
  /^(?:mụclục|tableofcontents)\s*$/i,
  /^(?:contents|nộidung)\s*$/i,
]
const LIST_OF_X = /^(?:danh\s*(?:mục|sách)\s*(?:các\s*)?(?:hình|bảng|biểu(?:\s*đồ)?|sơ\s*đồ|đồ\s*thị|ảnh|từ\s*viết\s*tắt|chữ\s*viết\s*tắt|ký\s*hiệu|thuật\s*ngữ)|list\s+of\s+(?:figures?|tables?|charts?|abbreviations?|symbols?|illustrations?)|mục\s*lục\s+(?:hình|bảng))/i

function findTOCPageText(pagesData) {
  let tocStart = -1
  const searchLimit = Math.min(Math.max(15, Math.floor(pagesData.length * 0.20)), 30)
  for (let i = 0; i < Math.min(searchLimit, pagesData.length); i++) {
    const allLines = (pagesData[i].lines || []).map(l => l.text.trim()).filter(Boolean)
    if (allLines.slice(0, 8).some(l => TOC_PAGE_MARKERS.some(p => p.test(l)))) {
      tocStart = i; break
    }
  }
  if (tocStart === -1) return null

  const skipPages = new Set()
  const tocLines  = []

  for (let pi = tocStart; pi < Math.min(tocStart + 15, pagesData.length); pi++) {
    const pageLines = (pagesData[pi].lines || []).map(l => l.text.trim()).filter(Boolean)
    if (!pageLines.length) continue

    if (pi > tocStart) {
      const isListOfX = pageLines.slice(0, 8).some(l => LIST_OF_X.test(l.trim()))
      if (isListOfX) {
        console.log(`[TOC] S1: stopped at page index ${pi} (danh mục hình/bảng → end of TOC)`)
        break
      }
      const codey = pageLines.filter(l =>
        /^[\{\}\[\]]/.test(l.trim()) ||
        /^"[\w_]+"\s*:/.test(l.trim()) ||
        /[{}]\s*,?\s*$/.test(l.trim())
      ).length
      if (codey >= 3) {
        console.log(`[TOC] S1: stopped at page index ${pi} (code/JSON detected)`)
        break
      }

      // Dòng mục lục LUÔN mở đầu bằng nhãn cấu trúc: 1 / 1.1 / A. / I. /
      // Chương N / Phần N. KHÔNG phụ thuộc dấu chấm dẫn hay số trang nên
      // áp dụng cho MỌI kiểu mục lục (có chấm, không chấm, không số trang).
      // Trang không còn dòng nào có nhãn → đã sang thân bài → dừng.
      const LABEL_LINE = /^(?:\d{1,2}(?:\.\d{1,2})*[.\s)]|[A-Za-z][.)]\s|(?:chương|chapter|chap|phần|part|mục|bài)\s*[\dIVXivx]|X{0,3}(?:IX|IV|V?I{0,3})[.\s)])/i
      const labeled = pageLines.filter(l => LABEL_LINE.test(l.trim())).length
      if (labeled < Math.max(2, pageLines.length * 0.25)) {
        console.log(`[TOC] S1: stopped at page index ${pi} (no structural labels → end of TOC)`)
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

const TOC_ENTRY_RE = [
    /^(\d{1,2}(?:\.\d{1,2}){0,3})[\.\s]{0,3}(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
    /^(\d{1,2}(?:\.\d{1,2}){0,3})[\.\s]{0,3}(.{3,150})\s*$/,
    /^(?:chương|chapter|phần|part)\s*(\d+)\s*[-–—:\s.]*\s*(.{10,150})\s+(\d{1,4})\s*$/i,
    /^(?:chương|chapter|phần|part)\s*(\d+)\s*[-–—:\s.]*\s*(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/i,
    /^(?:chương|chapter|phần|part)\s*([IVXivx\d]+)\s*[-–—:\s.]*\s*(.{3,150})/i,
    /^(XI{0,2}|X|IX|VI{0,3}|V|IV|I{1,3})\s*[.\s]+(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
    /^(XI{0,2}|X|IX|VI{0,3}|V|IV|I{1,3})\s*[.\s]+(.{3,150})\s*$/,
    /^(xi{0,2}|x|ix|vi{0,3}|v|iv|i{1,3})\s*[.\s]+(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
    /^(xi{0,2}|x|ix|vi{0,3}|v|iv|i{1,3})\s*[.\s]+(.{3,150})\s*$/,
    /^([A-Z])\.\s+(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
    /^([A-Z])\.\s+(.{3,150})\s*$/,
    /^([a-z])\.\s+(.{3,150})(?:\.{2,}|\s{4,})\s*(\d{1,4})\s*$/,
    /^()(.{5,150})(?:\.{5,}|\s{10,})\s*(\d{1,4})\s*$/,
  ]

function parseTOCPageJS(tocResult, pagesData) {
  const { lines, skipPages } = tocResult
  console.log(`\n🔴🔴🔴 parseTOCPageJS ĐANG CHẠY — ${lines.length} dòng thô`)
  console.log('🔴 5 dòng đầu:', JSON.stringify(lines.slice(0, 5)))
  const gluedDbg = lines.filter(l =>
    /[A-Za-zÀ-ỹ]{15,}/.test((l||'').replace(/\.{2,}.*$/, '')) ||
    /^\d+(?:\.\d+)*[A-Za-zÀ-ỹ]/.test((l||'').trim()) ||
    /^(chương|chapter|phần|part)\d/i.test((l||'').trim())
  ).length
  console.log(`🔴 glued = ${gluedDbg}/${lines.length}`)
  const LABEL_START = /^(?:\d{1,2}(?:\.\d{1,2})*[\.\s]|[A-Za-z][\.]\s|(?:chương|chapter|chap|phần|part)\s+\d|(?:XI{0,2}|X|IX|VI{0,3}|V|IV|I{1,3})\s*[.\s]|(?:xi{0,2}|x|ix|vi{0,3}|v|iv|i{1,3})\s*[.\s])/i

  const merged = []
  for (const line of lines) {
    if (!line.trim()) continue
    const t = line.trim()
    if (TOC_PAGE_MARKERS.some(p => p.test(t))) continue

    const prevLine = merged[merged.length - 1] ?? ''
    const prevHasPage = /\.{3,}\s*\d+\s*$|\s{4,}\d+\s*$|\d{1,4}\s*$/.test(prevLine)
    const isContinuation = merged.length > 0
      && !prevHasPage
      && !LABEL_START.test(t)
      && t.length > 3
      && !TOC_PAGE_MARKERS.some(p=>p.test(t))
      && !t.match(/^[A-ZĐÀẢÃÁẠĂẮẶẰẲẴÂẤẬẦẨẪ]{3,}/u)

    if (isContinuation) {
      merged[merged.length - 1] = merged[merged.length - 1] + ' ' + t
    } else {
      merged.push(t)
    }
  }

  const rawEntries = [], seen = new Set()

  for (const text of merged) {
    if (!text || TOC_PAGE_MARKERS.some(p => p.test(text))) continue
    if (text.length < 3 || text.length > 400) continue
    if (/^[\{\}\[\]]/.test(text.trim())) continue
    if (/^"[\w_]+"\s*:/.test(text.trim())) continue
    if (/[{}]\s*,?\s*$/.test(text.trim()) && text.length < 60) continue
    const matchText = text
      .replace(/(?:\.\s*){3,}/g, ' .... ')
      .replace(/(\.{2,})\s*(\d{1,4})\s*$/, '$1 $2')
    for (const re of TOC_ENTRY_RE) {
      const m = matchText.match(re); if (!m) continue
      const label    = (m[1] || '').trim()
      const rawTitle = (m[2] || '')
        .replace(/\.{2,}\s*\d+\s*$/, '')
        .replace(/\s{4,}\d+\s*$/, '')
        .replace(/\s+\d{1,3}\s*$/, '')
        .replace(/\d{1,3}\s*$/, (match, offset, str) => {
          const charBefore = str[offset - 1] || ''
          return /[a-zà-ỹ\s]/.test(charBefore) ? '' : match
        })
        .trim()
      const title = rawTitle || label
      if (title.length < 2 || isExcluded(title)) break

      const n = `${label}|${normalise(title)}`; if (seen.has(n)) break; seen.add(n)

      const isChapter     = /^(chương|chapter|chap|phần|part|appendix|phụ lục)/i.test(text)
      const isUpperRoman  = /^(XI{0,2}|X|IX|VI{0,3}|V|IV|I{1,3})$/.test(label) && label === label.toUpperCase() && label.length > 0
      const isLowerRoman  = /^(xi{0,2}|x|ix|vi{0,3}|v|iv|i{1,3})$/.test(label) && label === label.toLowerCase() && /[ivx]/.test(label)
      const isUpperLetter = /^[A-Z]$/.test(label) && !isUpperRoman
      const isLowerLetter = /^[a-z]$/.test(label) && !isLowerRoman
      // Appendix-style sub-entry: "A.1", "B.2", "A.1.1" — a LETTER followed by
      // a dotted number. Must NOT be treated as decimal dotted (1.1) because
      // its parent is the appendix letter, a different tier.
      const isAlphaDotSub = /^[A-Za-z]\.\d/.test(label)
      const isNoLabel     = label === ''
      const dots          = (label.match(/\./g) || []).length

      const type = isChapter      ? 'chapter'
                 : isAlphaDotSub  ? 'alphadot'
                 : isUpperRoman   ? 'roman'
                 : isLowerRoman   ? 'lowerroman'
                 : isUpperLetter  ? 'upper'
                 : isLowerLetter  ? 'lower'
                 : isNoLabel      ? 'nolabel'
                 : dots > 0       ? 'dotted'
                 : 'arabic'

      rawEntries.push({ label, title, type, dots, pageStart: m[3] ? parseInt(m[3]) : null })
      break
    }
  }

  if (rawEntries.length < 2) {
    console.log(`[TOC] S1-JS: only ${rawEntries.length} entries, too few`)
    return null
  }

  const noSpaceCount = rawEntries.filter(e => {
    const t = e.title.trim()
    return t.length > 12 && !t.includes(' ') && !/^[A-Za-z]$/.test(t)
  }).length
  if (noSpaceCount > rawEntries.length * 0.4) {
    console.log(`[TOC] S1-JS: ${noSpaceCount}/${rawEntries.length} entries look like no-space PDF artifacts → LLM`)
    return null
  }
  const labeledTitles = new Set(
  rawEntries.filter(e => e.type !== 'nolabel').map(e => normalise(e.title))
  )
  const dedupedEntries = rawEntries.filter(e =>
    e.type !== 'nolabel' || !labeledTitles.has(normalise(e.title))
  )
  const scheme  = detectScheme(dedupedEntries)
  const entries = adjustArabicLevels(dedupedEntries.map(e => ({ ...e, level: scheme(e) })))
  const chapters = buildTree(entries)
  console.log(`[TOC] S1-JS: ${chapters?.length || 0} chapters, ${rawEntries.length} entries`)
  return chapters?.length >= 2
    ? { chapters: assignPageRanges(chapters, pagesData), method: 'toc-page-js', skipPages }
    : null
}

// Parse TOC page text via LLM (fallback when JS parse fails) — now via streamLLM
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
    let raw = ''
    for await (const piece of streamLLM(prompt, {
      signal: ctl.signal, maxTokens: 2000, temperature: 0.05, numCtx: 4096,
    })) raw += piece
    clearTimeout(tm)

    let md = ('## ' + raw)
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*/g, '')
      .trim()
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
  if (!pagesData?.length) return null
  return findTOCPageText(pagesData)
}

// ─── extractTOCWithFullText: heading signals + sampled content → LLM ────────
export async function extractTOCWithFullText(pagesData, options = {}) {
  const { lang = 'en', targetDepth = 3 } = options
  const totalPages = pagesData.length

  const headingLines = pagesData.flatMap(pg => {
    const bodyFont = pg.bodyFont || 11
    return (pg.lines || [])
      .filter(l => {
        const t = (l.text || '').trim()
        if (!t || t.length < 3 || t.length > 150) return false
        if (/^[A-Z][a-z]+,\s+[A-Z]/.test(t)) return false
        if (/^\[\d+\]/.test(t)) return false
        const isBold    = l.isBold === true
        const isBig     = (l.avgFont || 0) > bodyFont * 1.08
        const isNum     = /^\d{1,2}[\.\s]/.test(t)
        const isChap    = /^(chương|chapter|phần|part)\s+\d+/i.test(t)
        const isRoman   = /^[IVX]{1,5}[\.\s]/.test(t)
        const isUpper   = /^[A-E]\.\s/.test(t)
        return isBold || isBig || isNum || isChap || isRoman || isUpper
      })
      .map(l => `[p${pg.pageNum}] ${l.text.trim()}`)
  })
  const seenHL = new Set()
  const uniqHeadings = headingLines.filter(line => {
    const key = line.replace(/^\[p\d+\]\s*/, '').toLowerCase().trim().slice(0, 50)
    if (seenHL.has(key)) return false
    seenHL.add(key); return true
  }).slice(0, 300)

  // ── FAST-SKIP: structureless document ────────────────────────────────────
  // < 3 heading signals → no real TOC to extract. The LLM call here always
  // ends in parseMarkdownTOC returning null (wasted round-trip + the hang you
  // saw on prose PDFs). Bail now; stream.generator's single-call handles it.
  if (uniqHeadings.length < 3) {
    console.log(`[TOC-AI] only ${uniqHeadings.length} heading signals → skip full-text LLM (structureless)`)
    return null
  }

  const firstPages = pagesData.slice(0, Math.min(10, pagesData.length))
  const firstText  = firstPages
    .map(p => `[p${p.pageNum}]\n${(p.text || '').slice(0, 600)}`)
    .join('\n\n')

  const step = pagesData.length / Math.min(25, pagesData.length)
  const sampledText = Array.from({ length: Math.min(25, pagesData.length) }, (_, i) => {
    const pg = pagesData[Math.floor(i * step)]
    return pg ? `[p${pg.pageNum}] ${(pg.text || '').slice(0, 350)}` : ''
  }).filter(Boolean).join('\n\n')

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

  console.log(`[TOC-AI] heading signals: ${uniqHeadings.length} | first: ${firstText.length}c | sampled: ${sampledText.length}c → LLM...`)
  const ctl = new AbortController()
  const tm  = setTimeout(() => ctl.abort(), 180_000)

  try {
    let raw = ''
    for await (const piece of streamLLM(prompt, {
      signal: ctl.signal, maxTokens: 4000, temperature: 0.05, numCtx: 16384,
    })) raw += piece
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
export async function extractTOCBest(pagesData, options = {}) {
  const { lang = 'en' } = options

  const tocPage = findTOCPageText(pagesData)

  if (tocPage) {
    const jsResult = parseTOCPageJS(tocPage, pagesData)
    if (jsResult?.chapters?.length >= 2) {
      console.log(`[TOC] S1-JS: ${jsResult.chapters.length} chapters ✅`)
      return jsResult
    }

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
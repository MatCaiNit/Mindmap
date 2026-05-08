// GenAI/services/pdfExtractor.js
// Extract + Structure Analysis + TOC (4-strategy cascade) + Chunking

import pdfParse from 'pdf-parse'

const NOISE_PATTERNS = [
  /^(?:đại học|trường|khoa|faculty|university|institute|department)/i,
  /^(?:gvhd|svth|giáo viên|sinh viên|msv|mã số|nhóm|lớp|khóa|năm học)/i,
  /^(?:tp\.|thành phố|hà nội|hanoi|hồ chí minh)/i,
  /^\d{4}[\s–\-]\d{4}$/,
  /^[©®™]/,
  /^(?:page|trang)\s*\d+$/i,
  /^(?:figure|hình|bảng|table)\s*\d+/i,
  /^(?:www\.|http)/i,
]

const FRONT_MATTER_PATTERNS = [
  /^(?:mục lục|table of contents|contents)\s*$/i,
  /^(?:lời cảm ơn|lời nói đầu|lời mở đầu|acknowledgements?|preface|foreword)\s*$/i,
  /^(?:tóm tắt|abstract|summary)\s*$/i,
  /^(?:danh mục|list of|danh sách)\s/i,
  /^(?:nhận xét|đánh giá|nhận xét của giáo viên)\s*$/i,
]

function isFrontMatter(text) {
  return FRONT_MATTER_PATTERNS.some(p => p.test(text.trim()))
}

function avg(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function percentile(arr, p) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx    = Math.floor((p / 100) * sorted.length)
  return sorted[Math.min(idx, sorted.length - 1)]
}


export async function extractTextFromPDF(buffer) {
  const { EventEmitter } = await import('events')
  EventEmitter.defaultMaxListeners = 30

  const originalStderrWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk, ...args) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString()
    if (str.startsWith('Warning: TT:')) return true
    return originalStderrWrite(chunk, ...args)
  }

  const pagesData = []

  const render_page = async function (pageData) {
    const textContent = await pageData.getTextContent()

    const linesMap = new Map()
    textContent.items.forEach(item => {
      const y        = Math.round(item.transform[5])
      const x        = Math.round(item.transform[4])
      const fontSize = Math.abs(Math.round(item.height || item.transform[3] || 12))
      const fontName = (item.fontName || '').toLowerCase()
      const isBold   = /bold|heavy|black/i.test(fontName)

      if (!linesMap.has(y)) {
        linesMap.set(y, { texts: [], fontSizes: [], xPositions: [], isBolds: [] })
      }
      const line = linesMap.get(y)
      line.texts.push(item.str)
      line.fontSizes.push(fontSize)
      line.xPositions.push(x)
      line.isBolds.push(isBold)
    })

    const allFontSizes = [...linesMap.values()].flatMap(l => l.fontSizes).filter(s => s > 0)
    const bodyFont     = percentile(allFontSizes, 50) || 11

    const lines = [...linesMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, data]) => {
        const text    = data.texts.join('').trim()
        const avgFont = avg(data.fontSizes)
        const isBold  = data.isBolds.some(Boolean)
        const indent  = Math.min(...data.xPositions)
        const isBigger = avgFont > bodyFont * 1.1
        return { text, avgFont, isBold, indent, isBigger, y }
      })
      .filter(l => l.text.length > 0)

    pagesData.push({
      pageNum:  pageData.pageNumber,
      lines,
      text:     lines.map(l => l.text).join('\n'),
      bodyFont,
    })

    return ''
  }

  try {
    await pdfParse(buffer, { pagerender: render_page })
  } catch (err) {
    await pdfParse(buffer, { pagerender: render_page }).catch(() => {})
  } finally {
    process.stderr.write = originalStderrWrite
  }

  return { pagesData }
}

export function analyzeStructure(pagesData) {
  let bigFontLines  = 0
  let boldLines     = 0
  let numberedLines = 0
  let allCapsLines  = 0
  let totalLines    = 0
  const fontSizes   = []

  for (const page of pagesData.slice(0, Math.min(8, pagesData.length))) {
    for (const line of page.lines) {
      const text = line.text.trim()
      if (!text || text.length < 3) continue
      totalLines++
      fontSizes.push(line.avgFont)
      if (line.avgFont > 13) bigFontLines++
      if (line.isBold)       boldLines++
      if (/^\d+(\.\d+)*[\s.]\s+[A-ZÀ-Ỹa-zà-ỹ]/.test(text)) numberedLines++
      if (text === text.toUpperCase() && text.length > 10 && /[A-ZÀ-Ỹ]{3,}/.test(text)) allCapsLines++
    }
  }

  const bodyFont     = percentile(fontSizes, 50) || 11
  const headingStyle = detectHeadingStyle(pagesData)

  let docType      = 'UNSTRUCTURED'
  let isStructured = false

  if (numberedLines > 8 || (numberedLines > 4 && boldLines > 5)) {
    docType = 'STRUCTURED'; isStructured = true
  } else if (bigFontLines > 15 || boldLines > 10) {
    docType = 'SCIENTIFIC'; isStructured = true
  } else if (allCapsLines > 6) {
    docType = 'REPORT'; isStructured = true
  }

  return { docType, isStructured, bodyFont, headingStyle, totalLines }
}

function detectHeadingStyle(pagesData) {
  const sample = pagesData.slice(0, 5).flatMap(p => p.lines.map(l => l.text))
  return {
    CHAPTER_VI:   sample.some(t => /^chương\s+\d+/i.test(t)),
    CHAPTER_EN:   sample.some(t => /^chapter\s+\d+/i.test(t)),
    NUMBERED:     sample.some(t => /^\d+\.\s+[A-ZÀ-Ỹ]/.test(t)),
    NUMBERED_SUB: sample.some(t => /^\d+\.\d+\s+[A-ZÀ-Ỹ]/.test(t)),
    ALLCAPS:      sample.filter(t => t === t.toUpperCase() && t.length > 10).length > 3,
    ROMAN:        sample.some(t => /^[IVX]+\.\s+[A-ZÀ-Ỹ]/.test(t)),
  }
}


export function resolveChapterPageRanges(tocChapters, pagesData) {
  const totalPages = pagesData[pagesData.length - 1]?.pageNum ?? 9999
  return tocChapters.map((chapter, i) => {
    const next = tocChapters[i + 1]
    return {
      ...chapter,
      pageStart: chapter.pageStart ?? null,
      pageEnd:   next?.pageStart ? next.pageStart - 1 : totalPages,
    }
  })
}


export function buildLayoutHierarchy(pagesData, structureInfo) {
  const { bodyFont = 11 } = structureInfo

  const candidates = []
  for (const page of pagesData) {
    for (const line of page.lines) {
      const t = line.text.trim()
      if (!t || t.length < 4 || t.length > 120) continue
      if (NOISE_PATTERNS.some(p => p.test(t))) continue
      if (isFrontMatter(t)) continue

      const sizeRatio = line.avgFont / bodyFont
      const isHeading =
        (line.isBold && sizeRatio >= 1.15) ||
        sizeRatio >= 1.3 ||
        /^\d+(\.\d+)*\s+[A-ZÀ-Ỹ]/.test(t) ||
        /^(?:chương|chapter)\s+\d+/i.test(t)

      if (!isHeading) continue

      candidates.push({
        text:      t,
        pageNum:   page.pageNum,
        fontSize:  line.avgFont,
        isBold:    line.isBold,
        indent:    line.indent,
        sizeRatio,
      })
    }
  }

  if (candidates.length < 3) return null

  // Gán level bằng cách kết hợp indent (40%) + fontSize (60%)
  // hierarchyScore nhỏ = heading cấp cao hơn
  const indents   = candidates.map(c => c.indent)
  const minIndent = Math.min(...indents)
  const maxIndent = Math.max(...indents)
  const range     = maxIndent - minIndent || 1

  const scored = candidates.map(c => ({
    ...c,
    hierarchyScore:
      ((c.indent - minIndent) / range) * 0.4 +
      (1 - Math.min((c.sizeRatio - 1) / 1.5, 1)) * 0.6,
  }))

  // Chia 3 tầng bằng percentile 33/66
  const sorted = scored.map(c => c.hierarchyScore).sort((a, b) => a - b)
  const q33    = sorted[Math.floor(sorted.length * 0.33)]
  const q66    = sorted[Math.floor(sorted.length * 0.66)]

  const withLevel = scored.map(c => ({
    ...c,
    level: c.hierarchyScore <= q33 ? 1
         : c.hierarchyScore <= q66 ? 2
         : 3,
  }))

  // Level 1 phải xuất hiện ≥2 lần mới có ý nghĩa
  const lvl1Count = withLevel.filter(c => c.level === 1).length
  if (lvl1Count < 2) return null

  const chapters = []
  for (const node of withLevel) {
    if (node.level === 1) {
      chapters.push({
        title:       node.text,
        subSections: [],
        pageStart:   node.pageNum,
      })
    } else if (chapters.length > 0) {
      chapters[chapters.length - 1].subSections.push(node.text)
    }
  }

  const valid = chapters.filter(c => {
    const words = c.title.split(/\s+/).filter(w => /[A-Za-zÀ-ỹ]{2,}/.test(w))
    return words.length >= 2
  })

  return valid.length >= 2 ? { chapters: valid, _source: 'layout' } : null
}


export function extractTOC(pagesData, structureInfo) {
  // Check layout
  const tocFromLayout = buildLayoutHierarchy(pagesData, structureInfo)
  if (tocFromLayout?.chapters?.length >= 2) {
    console.log(`[TOC] Strategy 0 (Layout): ${tocFromLayout.chapters.length} chapters`)
    return tocFromLayout
  }

  //Tìm trang mục lục
  const tocFromPage = extractTOCPage(pagesData)
  if (tocFromPage?.chapters?.length >= 2) {
    console.log(`[TOC] Strategy 1 (TOC page): ${tocFromPage.chapters.length} chapters`)
    return tocFromPage
  }

  // Check số, ký tự La mã
  const tocFromPattern = extractTOCFromPatterns(pagesData)
  if (tocFromPattern?.chapters?.length >= 2) {
    console.log(`[TOC] Strategy 2 (Patterns): ${tocFromPattern.chapters.length} chapters`)
    return tocFromPattern
  }

  // Font chữ, in Bold
  const tocFromFont = extractTOCFromFontMetrics(pagesData, structureInfo)
  if (tocFromFont?.chapters?.length >= 2) {
    console.log(`[TOC] Strategy 3 (Font metrics): ${tocFromFont.chapters.length} chapters`)
    return tocFromFont
  }

  console.log('[TOC] All strategies failed → will use synthetic TOC')
  return null
}


function extractTOCPage(pagesData) {
  const TOC_MARKERS = [
    /^(?:mục lục|table of contents|contents|nội dung|danh mục)\s*$/i,
    /^(?:mục lục|table of contents)\b/i,
  ]

  let tocPageIdx = -1
  for (let i = 0; i < Math.min(10, pagesData.length); i++) {
    const firstLines = pagesData[i].lines.slice(0, 5).map(l => l.text.trim())
    if (firstLines.some(l => TOC_MARKERS.some(p => p.test(l)))) {
      tocPageIdx = i
      break
    }
  }
  if (tocPageIdx === -1) return null

  const entries = []
  for (let pi = tocPageIdx; pi < Math.min(tocPageIdx + 3, pagesData.length); pi++) {
    for (const line of pagesData[pi].lines) {
      const text = line.text.trim()
      if (!text || text.length < 4) continue

      // Format A: "1  Introduction .............. 3" — capture page number
      const matchA = text.match(
        /^(\d{1,2}(?:\.\d{1,2}){0,2})[.\s:]+(.{3,80?})(?:\.{2,}|\s{3,})\s*(\d+)\s*$/
      )
      // Format B: "1  Introduction" — no page number
      const matchB = text.match(
        /^(\d{1,2}(?:\.\d{1,2}){0,2})[.\s:]+(.{3,80})$/
      )
      // Format C: "Chương 1: Title ........ 5"
      const matchC = text.match(
        /^(?:chương|chapter)\s+(\d+)[:\s]+(.{3,80?})(?:\.{2,}|\s{3,})\s*(\d+)\s*$/i
      )
      // Format D: "Chương 1: Title"
      const matchD = text.match(
        /^(?:chương|chapter|phần|part|section)\s+([IVXivx\d]+)[:\s]+(.{3,80})/i
      )

      const match = matchA || matchC || matchB || matchD
      if (!match) continue

      const label     = match[1]
      const rawTitle  = match[2].replace(/\.{2,}\s*\d+\s*$/, '').trim()
      const pageStart = (matchA || matchC) && match[3] ? parseInt(match[3], 10) : null

      if (rawTitle.length < 3 || NOISE_PATTERNS.some(p => p.test(rawTitle))) continue
      if (!/[A-Za-zÀ-ỹ]{2,}/.test(rawTitle)) continue

      const dotCount = (label.match(/\./g) || []).length
      entries.push({
        label,
        title:     rawTitle,
        level:     dotCount + 1,
        full:      `${label} ${rawTitle}`,
        pageStart,
      })
    }
  }

  if (entries.length < 3) return null
  return buildChapterTree(entries)
}


function extractTOCFromPatterns(pagesData) {
  const fullText   = pagesData.map(p => p.text).join('\n')
  const refMatch   = /\n(?:References|Bibliography|Tài liệu tham khảo)\s*\n/i.exec(fullText)
  const searchText = refMatch ? fullText.slice(0, refMatch.index) : fullText

  const PATTERNS = [
    // "1  Introduction", "2.1  Related Work"
    /^(\d{1,2}(?:\.\d{1,2}){0,2})\s{2,}([A-ZÀ-Ỹ][^\n]{3,80})/gm,
    // "1. Introduction", "2.1. Background"
    /^(\d{1,2}(?:\.\d{1,2}){0,2})\.\s+([A-ZÀ-Ỹ][^\n]{3,80})/gm,
    // "Chapter 1: Title", "Chương 2 Title"
    /^(?:Chương|CHƯƠNG|Phần|PHẦN|Chapter|CHAPTER|Section)\s+([IVXivx\d]+)[.:‑\s]+([A-ZÀ-Ỹa-zà-ỹ][^\n]{3,80})/gm,
    // "I.  Introduction"
    /^([IVX]{1,5})[.\s]{2,}([A-ZÀ-Ỹ][^\n]{5,80})/gm,
  ]

 // Bỏ qua công thức
  const REJECT_PATTERNS = [
    /[=÷∑∫√≤≥≠±∀∃∈∉⊆⊂]/,
    /[α-ωΑ-Ω]/,
    /\[\d+\]/,
    /et al\./i,
    /^(?:see|cf\.|ibid)/i,
    /\bfig(?:ure)?\s*\d/i,
    /\btable\s+\d/i,
    /\.{2,}/,
    /\b(?:equation|eq\.)\s*\d/i,
    /\d\s*[×*]\s*\d/,   
  ]

  const entries    = []
  const seen       = new Set()
  const seenTitles = new Set()

  for (const pattern of PATTERNS) {
    let match
    while ((match = pattern.exec(searchText)) !== null) {
      const label = match[1].trim()
      const raw   = match[2].trim()
      const title = raw.replace(/\.{2,}\s*\d+\s*$/, '').replace(/\s+\d+\s*$/, '').trim()

      if (title.length < 4 || title.length > 120) continue
      if (!/[A-Za-zÀ-ỹ]{3,}/.test(title)) continue
      if (NOISE_PATTERNS.some(p => p.test(title))) continue
      if (REJECT_PATTERNS.some(p => p.test(title))) continue
      if (!/^[A-ZÀ-Ỹ\u0041-\u005A\u00C0-\u00D6\u00D8-\u00DE]/.test(title) &&
          !/^[a-zà-ỹ]/.test(title)) continue

      const key = `${label}|${title.slice(0, 40)}`
      if (seen.has(key)) continue
      seen.add(key)

      const normTitle = title.toLowerCase().replace(/\s+/g, ' ').trim()
      if (seenTitles.has(normTitle)) continue
      seenTitles.add(normTitle)

      const dotCount = (label.match(/\./g) || []).length
      const isRoman  = /^[IVX]+$/i.test(label)
      entries.push({ label, title, level: isRoman ? 1 : dotCount + 1, full: `${label} ${title}` })
    }
  }

  if (entries.length < 3) return null

  const levelCounts = {}
  entries.forEach(e => { levelCounts[e.level] = (levelCounts[e.level] || 0) + 1 })
  const validLevels = new Set(
    Object.entries(levelCounts).filter(([, c]) => c >= 2).map(([l]) => Number(l))
  )

  const filtered = entries.filter(e => validLevels.has(e.level))
  if (filtered.length < 3) return null

  const result = buildChapterTree(filtered)
  if (!result) return null

  const valid = result.chapters.filter(ch => {
    const words = ch.title.split(/\s+/).filter(w => /[A-Za-zÀ-ỹ]{2,}/.test(w))
    return words.length >= 2 && words.length <= 15
  })

  return valid.length >= 2 ? { chapters: valid } : null
}


function extractTOCFromFontMetrics(pagesData, structureInfo) {
  const { bodyFont = 11 } = structureInfo || {}
  const entries    = []
  const seenTitles = new Set()

  const contentPages = pagesData.slice(2, -1)

  for (const page of contentPages) {
    for (const line of page.lines) {
      const text = line.text.trim()
      if (!text || text.length < 5 || text.length > 100) continue
      if (NOISE_PATTERNS.some(p => p.test(text))) continue
      if (isFrontMatter(text)) continue

      const sizeRatio    = line.avgFont / bodyFont
      const isLarger     = sizeRatio >= 1.25
      const isBoldBigger = line.isBold && sizeRatio >= 1.15

      if (!isLarger && !isBoldBigger) continue

      const wordCount = text.split(/\s+/).length
      if (wordCount < 2 || wordCount > 12) continue
      if (!/^[A-ZÀ-Ỹ0-9]/.test(text)) continue
      if (/[,;:]$/.test(text)) continue
      if (/\b(and|or|the|a|an|of|in|to|for|is|are|was|were|with|by|on|at)\s+\w+\s+\w+/i.test(text)
          && wordCount > 6) continue

      const realWords = text.split(/\s+/).filter(w => /[A-Za-zÀ-ỹ]{2,}/.test(w))
      if (realWords.length < 2) continue

      const normalizedKey = text.toLowerCase().replace(/\s+/g, ' ')
      if (seenTitles.has(normalizedKey)) continue
      seenTitles.add(normalizedKey)

      let level = 1
      if (sizeRatio < 1.35 && line.isBold) level = 2
      if (sizeRatio < 1.2  && line.isBold) level = 3

      const numMatch = text.match(/^(\d+(?:\.\d+)*)\s+/)
      if (numMatch) level = (numMatch[1].match(/\./g) || []).length + 1

      const cleanTitle = numMatch ? text.slice(numMatch[0].length).trim() : text

      entries.push({
        label:  numMatch?.[1] || String(entries.length + 1),
        title:  cleanTitle,
        level,
        full:   text,
        page:   page.pageNum,
      })
    }
  }

  if (entries.length < 3) return null

  const levelCounts = {}
  entries.forEach(e => { levelCounts[e.level] = (levelCounts[e.level] || 0) + 1 })
  const validLevels = new Set(
    Object.entries(levelCounts).filter(([, c]) => c >= 2).map(([l]) => Number(l))
  )

  const filtered = entries.filter(e => validLevels.has(e.level))
  if (filtered.length < 3) return null
  return buildChapterTree(filtered)
}


function buildChapterTree(entries) {
  if (!entries.length) return null

  const minLevel   = Math.min(...entries.map(e => e.level))
  const normalized = entries.map(e => ({ ...e, level: e.level - minLevel + 1 }))

  const chapters = []
  for (const entry of normalized) {
    if (entry.level === 1) {
      chapters.push({
        title:       entry.full || entry.title,
        subSections: [],
        pageStart:   entry.pageStart ?? null,
      })
    } else if (chapters.length > 0) {
      chapters[chapters.length - 1].subSections.push(entry.full || entry.title)
    }
  }

  if (chapters.length < 2) return null

  const GENERIC    = /^(?:\d+|section|chapter|phần|chương|mục)\s*$/i
  const meaningful = chapters.filter(c => {
    const bare = c.title.replace(/^\d+\.?\s*/, '').trim()
    return !GENERIC.test(bare) && bare.length >= 3
  })

  return meaningful.length >= 2 ? { chapters: meaningful } : null
}


export function chunkText(pagesData, { maxChunkSize = 1500, overlap = 150 } = {}) {
  const chunks = []
  let chunkIndex = 0

  for (const page of pagesData) {
    const text = page.text || (page.lines || []).map(l => l.text).join('\n')
    if (!text) continue

    const paragraphs = text
      .split(/\n{2,}|\n(?=\s{2,})/)
      .map(p => p.trim())
      .filter(p => p.length > 20)

    let current   = ''
    let lastAdded = ''

    for (const para of paragraphs) {
      if (current.length + para.length > maxChunkSize && current.length > 0) {
        chunks.push({ pageNum: page.pageNum, chunkIndex: chunkIndex++, text: current.trim() })
        const sentences = current.split(/(?<=[.!?])\s+/)
        lastAdded = sentences.slice(-2).join(' ')
        current   = lastAdded + '\n' + para
      } else {
        current += (current ? '\n' : '') + para
      }
    }

    if (current.trim().length > 50) {
      chunks.push({ pageNum: page.pageNum, chunkIndex: chunkIndex++, text: current.trim() })
    }
  }

  return chunks
}

export function chunkByStructure(pagesData, structureInfo) {
  const chunks         = []
  let currentChunkText = ''
  let globalChunkIndex = 0
  let currentPage      = 1

  const headingPatterns = [
    /^(?:CHƯƠNG|Chương|CHAPTER|Chapter)\s+\d+/i,
    /^(?:PHẦN|Phần|PART|Part)\s+[IVX\d]+/i,
    /^(?:BÀI|Bài|UNIT|Unit)\s+\d+/i,
    /^\d+\.\s+[A-ZÀ-Ỹ]/,
  ]

  const NOISE = /^(?:đại học|trường|khoa|university|institute|faculty|gvhd|svth)/i

  for (const page of pagesData) {
    currentPage = page.pageNum

    for (const line of page.lines) {
      const text = line.text.trim()
      if (!text || NOISE.test(text)) continue

      const isAllCaps = text === text.toUpperCase()
        && text.split(/\s+/).length >= 3
        && text.length >= 15 && text.length < 100
        && /[A-ZÀ-Ỹ]{3,}/.test(text)

      const isNumberedHeading = headingPatterns.some(p => p.test(text)) && text.length < 120
      const isFontHeading     = line.isBold && line.isBigger && text.length < 120

      const isHeading = isAllCaps || isNumberedHeading || isFontHeading

      if (isHeading) {
        if (currentChunkText.trim().length > 100) {
          chunks.push({ pageNum: currentPage, chunkIndex: globalChunkIndex++, text: currentChunkText.trim() })
        }
        currentChunkText = `## ${text}\n`
      } else {
        currentChunkText += text + ' '
        if (currentChunkText.length > 2000) {
          const splitAt = currentChunkText.lastIndexOf('. ', 1800)
          if (splitAt > 500) {
            chunks.push({ pageNum: currentPage, chunkIndex: globalChunkIndex++, text: currentChunkText.slice(0, splitAt + 1).trim() })
            currentChunkText = currentChunkText.slice(splitAt + 2)
          }
        }
      }
    }
  }

  if (currentChunkText.trim().length > 50) {
    chunks.push({ pageNum: currentPage, chunkIndex: globalChunkIndex++, text: currentChunkText.trim() })
  }

  return chunks
}
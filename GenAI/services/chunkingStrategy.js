// GenAI/services/chunkingStrategy.js — v4

const MIN_CHUNK   = 100
const MAX_CHUNK   = 900
const MIN_SECTION = 150
const MAX_CHUNKS  = 120   // cap for paragraph fallback

function clean(t) {
  return (t || '').replace(/\s{3,}/g, '  ').replace(/\n{3,}/g, '\n\n').trim()
}

function splitSentences(text, maxChars) {
  const out = [], sents = text.split(/(?<=[.!?।])\s+/)
  let cur = ''
  for (const s of sents) {
    if (cur.length + s.length > maxChars && cur.length >= MIN_CHUNK) { out.push(cur.trim()); cur = s }
    else cur += (cur ? ' ' : '') + s
  }
  if (cur.trim().length >= MIN_CHUNK) out.push(cur.trim())
  return out
}

export function chunkByTOCSections(pagesData, tocChapters) {
  if (!tocChapters?.length) return null
  const sections = []
  function walk(nodes, depth = 1) {
    for (const ch of nodes || []) {
      if (ch.pageStart != null) sections.push({ ...ch, depth })
      walk(ch.children || [], depth + 1)
    }
  }
  walk(tocChapters)
  sections.sort((a, b) => (a.pageStart ?? 0) - (b.pageStart ?? 0))
  if (sections.length < 2) return null

  const chunks = []
  let idx = 0, pendingText = '', pendingTitle = '', pendingPage = 1, pendingDepth = 1

  const flush = (nextTitle) => {
    if (pendingText.length < MIN_CHUNK) return
    const header = `[${pendingTitle || nextTitle}]\n`
    const paras  = pendingText.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length >= MIN_CHUNK)
    let group = ''
    for (const para of paras) {
      if (group.length + para.length > MAX_CHUNK && group.length >= MIN_CHUNK) {
        chunks.push({ text: header + group.trim(), pageNum: pendingPage, chunkIndex: idx++, sectionTitle: pendingTitle, sectionDepth: pendingDepth })
        group = para
      } else group += (group ? '\n\n' : '') + para
    }
    if (group.trim().length >= MIN_CHUNK)
      chunks.push({ text: header + group.trim(), pageNum: pendingPage, chunkIndex: idx++, sectionTitle: pendingTitle, sectionDepth: pendingDepth })
    pendingText = ''; pendingTitle = ''; pendingPage = 1; pendingDepth = 1
  }

  for (const sec of sections) {
    const sectionPages = pagesData.filter(p => p.pageNum >= (sec.pageStart ?? 1) && p.pageNum <= (sec.pageEnd ?? 9999))
    if (!sectionPages.length) continue
    const cleaned = clean(sectionPages.map(p => p.text || '').join('\n'))

    if (cleaned.length < MIN_SECTION) {
      if (!pendingTitle) { pendingTitle = sec.title; pendingPage = sectionPages[0].pageNum; pendingDepth = sec.depth }
      pendingText += (pendingText ? '\n\n' : '') + cleaned
    } else {
      flush(sec.title)
      const header = `[${sec.title}]\n`
      const paras  = cleaned.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length >= MIN_CHUNK)
      let group = ''
      for (const para of paras) {
        if (group.length + para.length > MAX_CHUNK && group.length >= MIN_CHUNK) {
          chunks.push({ text: header + group.trim(), pageNum: sectionPages[0].pageNum, chunkIndex: idx++, sectionTitle: sec.title, sectionDepth: sec.depth })
          group = para
        } else group += (group ? '\n\n' : '') + para
      }
      if (group.trim().length >= MIN_CHUNK)
        chunks.push({ text: header + group.trim(), pageNum: sectionPages[0].pageNum, chunkIndex: idx++, sectionTitle: sec.title, sectionDepth: sec.depth })
    }
  }
  flush('')

  console.log(`[Chunk] TOC-section: ${chunks.length} chunks from ${sections.length} sections`)
  return chunks.length >= 8 ? chunks : null
}

export function chunkByParagraph(pagesData, tocChapters) {
  // Build page→chapter lookup for sectionTitle tagging
  const pageToSection = new Map()
  if (tocChapters?.length) {
    function walkPages(nodes) {
      for (const ch of nodes || []) {
        const ps = ch.pageStart ?? 1, pe = ch.pageEnd ?? 9999
        for (let p = ps; p <= Math.min(pe, ps + 50); p++) {
          if (!pageToSection.has(p)) pageToSection.set(p, ch.title)
        }
        walkPages(ch.children || [])
      }
    }
    walkPages(tocChapters)
  }

  const chunks = [], seen = new Set()
  let idx = 0
  for (const page of pagesData) {
    const text  = clean(page.text || '')
    const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length >= MIN_CHUNK)
    const sectionTitle = pageToSection.get(page.pageNum) || null
    for (const para of paras) {
      const key = para.slice(0, 60)
      if (seen.has(key)) continue
      seen.add(key)
      if (para.length <= MAX_CHUNK) {
        chunks.push({ text: para, pageNum: page.pageNum, chunkIndex: idx++, sectionTitle })
      } else {
        for (const seg of splitSentences(para, MAX_CHUNK))
          chunks.push({ text: seg, pageNum: page.pageNum, chunkIndex: idx++, sectionTitle })
      }
    }
  }

  // Cap to avoid overload — sample evenly if too many
  let result = chunks
  if (chunks.length > MAX_CHUNKS) {
    const step = chunks.length / MAX_CHUNKS
    result = Array.from({ length: MAX_CHUNKS }, (_, i) => chunks[Math.floor(i * step)])
    console.log(`[Chunk] Paragraph: ${chunks.length} chunks → sampled to ${result.length}`)
  } else {
    console.log(`[Chunk] Paragraph: ${chunks.length} chunks`)
  }
  return result
}

export function chunkBySize(pagesData) {
  const chunks = []; let idx = 0
  for (const page of pagesData) {
    const text = clean(page.text || '')
    if (!text) continue
    let start = 0
    while (start < text.length) {
      const end   = Math.min(start + MAX_CHUNK, text.length)
      const slice = text.slice(start, end).trim()
      if (slice.length >= MIN_CHUNK) chunks.push({ text: slice, pageNum: page.pageNum, chunkIndex: idx++ })
      if (end >= text.length) break
      start = end - 100
    }
  }
  console.log(`[Chunk] Size-based: ${chunks.length} chunks`)
  return chunks
}

export function hybridChunk(pagesData, tocChapters) {
  if (tocChapters?.length >= 2) {
    const toc = chunkByTOCSections(pagesData, tocChapters)
    if (toc && toc.length >= 8) return toc
  }
  const para = chunkByParagraph(pagesData, tocChapters)
  if (para.length >= 3) return para
  return chunkBySize(pagesData)
}
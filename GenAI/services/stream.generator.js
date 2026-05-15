// GenAI/services/stream.generator.js — v12-hybrid-3
// Fix: qwen3:8b <think> block filter in all streaming functions
// Fix: deeper detail prompt (3-5 #### + 2-3 ##### per ###)
// Fix: RAG content 200→350 chars/chunk, CAP_TOT 3500→5000
// Fix: num_predict 3500→6000 for longer output

import { detectLang }                       from '../utils/prompts.js'
import { extractTOCBest }                from '../utils/tocExtractor.js'

const OLLAMA_BASE = process.env.OLLAMA_URL       || 'http://localhost:11434'
const GEN_MODEL   = process.env.OLLAMA_GEN_MODEL || 'qwen3:8b'

const COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#14b8a6','#f97316',
  '#06b6d4','#84cc16','#a855f7','#fb923c',
]
let _seq = 0
const nid = (p = 'n') => `${p}-${Date.now()}-${++_seq}`

const mkNode = ({ id, parentId, label, description = '', pdfSource = null,
                  level, side, color, isRoot = false, x = 0, y = 0 }) => ({
  type: 'node',
  node: { id, parentId, label, description, level, side, color, isRoot,
          autoAlign: true, position: { x, y }, ...(pdfSource ? { pdfSource } : {}) },
})

const mkEdge = ({ parentId, childId, color, side }) => ({
  type: 'edge',
  edge: {
    id: `e-${parentId}-${childId}`, source: parentId, target: childId,
    sourceHandle: side === 'right' ? 'source-right' : 'source-left',
    targetHandle: side === 'right' ? 'target-left'  : 'target-right',
    color, width: 2, style: 'solid', isParentChild: true,
  },
})

function cleanHeadingLine(text) {
  if (!text) return ''
  const t = text.trim()
  if (t.length <= 90) return t
  const m = t.match(/^(.{8,90}?[a-zà-ỹ])\s+[A-ZÀ-Ỹ]/)
  return m ? m[1].trim() : t.slice(0, 90).trim()
}

// Normalize title for sectionMap lookup — strips leading numbers/romans, lowercase
function normForLookup(t) {
  return (t || '').toLowerCase()
    .replace(/^(#{1,6}\s*)+/, '')                        // strip ALL leading ### sequences
    .replace(/^(chương|chapter|phần|part)\s+\w+[\s:.]+/i, '')
    .replace(/^[ivxlIVXL]+[\.\s:]+/, '')
    .replace(/^[\d]+([\.\d]*)\s*/, '')
    .replace(/[:\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)                                        // 30→50 reduce collisions
}

// Page lookup from tocChapters
function buildPageLookup(chapters) {
  const map = new Map()
  const walk = (nodes) => { for (const ch of nodes||[]) { const k=(ch.title||'').toLowerCase().replace(/\s+/g,' ').trim(); if(k)map.set(k,{pageStart:ch.pageStart,pageEnd:ch.pageEnd}); walk(ch.children||[]) } }
  walk(chapters)
  return map
}

function getPdfSource(title, pageLookup) {
  const v = pageLookup.get(title.toLowerCase().replace(/\s+/g,' ').trim())
  return v ? { pageStart: v.pageStart, pageEnd: v.pageEnd } : null
}

function extractPageRef(desc) {
  const m = (desc||'').match(/[\[\(]p\.(\d+)(?:-(\d+))?[\]\)]/)
  if (!m) return null
  return { pageStart: parseInt(m[1]), pageEnd: m[2] ? parseInt(m[2]) : parseInt(m[1]) }
}

// Strip [Section name] bracket refs from text (keep [p.X])
function cleanChunkText(text) {
  return (text||'')
    .replace(/^\[[^\]]{5,60}\]\s*$/gm, '')          // whole-line bracket headers
    .replace(/\[(?![pP]\.)([^\]]{5,60})\]/g, '')    // inline [Section name]
    .replace(/\n{3,}/g, '\n\n').trim()
}

function cleanDescription(desc) {
  return (desc||'')
    .replace(/\[(?![pP]\.)([^\]]{5,60})\]/g, '')
    .replace(/Dựa vào\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ─── Phase 1: Pre-emit ## ### from TOC ───────────────────────────────────────
// Returns sectionMap: normTitle → { id, side, color, x, y }
// ─── Filter TOC before display ────────────────────────────────────────────────
// Removes use-case step descriptions and limits depth/breadth to prevent
// maps with 100+ nodes from overly detailed thesis TOCs.
function cleanNodeLabel(title) {
  return (title || '')
    .replace(/\.{2,}[\s\d]*$/, '')   // strip trailing dots + optional page number
    .replace(/\s{4,}\d+\s*$/, '')    // strip trailing spaces + page number
    .replace(/\s+$/, '')
    .trim()
}

// ─── Filter TOC for display ──────────────────────────────────────────────────
// Recursively filter use-case step entries, cap size, preserve full hierarchy.
// Returns filtered chapters with their full children trees intact.
function filterTOCForDisplay(tocChapters) {
  const MAX_CHAPTERS   = 8
  const MAX_NODES      = 80   // total nodes across whole tree

  function isStep(title) {
    const t = (title || '').trim().toLowerCase().replace(/[:\.\s]+$/, '')
    if (t.length < 8 && !/\d/.test(t)) return true
    if (/^(user |người dùng |hệ thống |frontend |backend |server |client )/.test(t)) return true
    if (/^(gọi api|trả về|redirect|hiển thị )/.test(t)) return true
    if (/^(click |chọn |nhập |press |submit |confirm )/.test(t)) return true
    if (/^(auto-layout|yjs |reactflow |realtime |websocket )/.test(t)) return true
    if (/^(update y\.|all clients|mỗi client|other users)/.test(t)) return true
    if (/^(remove khỏi|recursively|xóa tất|focus v)/.test(t)) return true
    if (/^(bước \d|step \d|ui re-|ui cập nhật|modal |toast |dialog )/.test(t)) return true
    if (/^(ai service parse|openai trả về|openai return)/.test(t)) return true
    return false
  }

  let totalNodes = 0
  function filterNode(node) {
    if (isStep(node.title)) return null
    if (++totalNodes > MAX_NODES) return null
    const filteredChildren = (node.children || [])
      .map(filterNode)
      .filter(Boolean)
    return { ...node, children: filteredChildren }
  }

  return tocChapters
    .slice(0, MAX_CHAPTERS)
    .map(filterNode)
    .filter(Boolean)
}

// ─── Build TOC Structure: pre-emit ALL levels ─────────────────────────────────
// Recursively emits EVERY node from the full TOC hierarchy.
// TOC L1→mindmap L2(##), L2→L3(###), L3→L4(####), L4→L5(#####)
// Returns sectionMap: normTitle → {id,side,color,x,y}
//         leafSet: Set of node IDs that are leaves (no children in TOC)
function buildTOCStructure(tocChapters, pageLookup, tracker) {
  const events = [], sectionMap = new Map(), leafSet = new Set()
  const ROOT_X = 600, ROOT_Y = 400

  function emitNode(node, parentId, parentInfo, tocLevel, siblingIdx, siblingCount) {
    const mindmapLevel = tocLevel + 1   // TOC L1→mindmap L2, L2→L3 ...
    const side  = parentInfo ? parentInfo.side  : (siblingIdx % 2 === 0 ? 'right' : 'left')
    const color = parentInfo ? parentInfo.color : COLORS[siblingIdx % COLORS.length]
    const dirX  = side === 'right' ? 1 : -1

    // X: step right at each TOC level
    const xStep = Math.max(140, 230 - tocLevel * 22)
    const x = (parentInfo ? parentInfo.x : ROOT_X) + dirX * xStep

    // Y: spread siblings vertically
    const totalH = siblingCount * Math.max(55, 90 - tocLevel * 10)
    const y      = (parentInfo ? parentInfo.y : ROOT_Y) - totalH/2 + siblingIdx * (totalH/Math.max(siblingCount,1))

    const id       = nid(`h${mindmapLevel}`)
    const label    = cleanNodeLabel(node.title)
    const pdfSrc   = getPdfSource(node.title, pageLookup)
    const info     = { id, side, color, x, y, level: mindmapLevel }
    const children = node.children || []
    const isLeaf   = children.length === 0

    events.push(mkNode({ id, parentId, label, description:'', pdfSource:pdfSrc,
                         level:mindmapLevel, side, color, isRoot:false, x, y }))
    events.push(mkEdge({ parentId, childId:id, color, side }))
    tracker.addNode(id, parentId, label, mindmapLevel)

    // Add to sectionMap (all nodes — detail model can attach to any leaf)
    const norm = normForLookup(label)
    if (norm) {
      sectionMap.set(norm, info)
      // Short prefix key for fuzzy match
      if (norm.length > 20) {
        const short = norm.slice(0, 20)
        if (!sectionMap.has(short)) sectionMap.set(short, info)
      }
    }

    if (isLeaf) leafSet.add(id)

    // Recurse
    for (let ci = 0; ci < children.length; ci++) {
      emitNode(children[ci], id, info, tocLevel + 1, ci, children.length)
    }
    return info
  }

  for (let i = 0; i < tocChapters.length; i++) {
    emitNode(tocChapters[i], 'root-node', null, 1, i, tocChapters.length)
  }

  return { events, sectionMap, leafSet }
}


// ─── Fast chapter extraction ──────────────────────────────────────────────────
function extractChaptersFast(pagesData) {
  const entries = [], seen = new Set()
  for (const page of pagesData) {
    const bodyFont = page.bodyFont || 11
    for (const line of (page.lines||[])) {
      const raw  = (line.text||'').trim()
      const text = cleanHeadingLine(raw)
      if (!text||text.length<3||text.length>110) continue
      if (text.split(/\s+/).length>12) continue
      if (/^\[\d+\]/.test(text)||/^[A-Z][a-z]+,\s+[A-Z]/.test(text)) continue
      const isBold = line.isBold||false, isBig=(line.avgFont||0)>bodyFont*1.12
      const dottedM=text.match(/^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s+[A-ZÀ-Ỹa-zà-ỹ‐]/)
      const numM=!dottedM&&(text.match(/^(\d{1,2})\s+[A-ZÀ-Ỹ]/)||text.match(/^(\d{1,2})\.\s+[A-ZÀ-Ỹ]/))
      const chapM=/^(chương|chapter|phần|part)\s+\d+/i.test(text)
      const romanM=/^([IVX]{1,5})\s*[\.\s]\s+[A-ZÀ-Ỹ]/.test(text)
      if (!isBold&&!isBig&&!dottedM&&!numM&&!chapM&&!romanM) continue
      const key=text.toLowerCase().replace(/\s+/g,'').slice(0,30)
      if (seen.has(key)) continue; seen.add(key)
      let level=2,type='arabic',dots=0
      if (chapM){level=1;type='chapter'}else if(romanM){level=1;type='roman'}
      else if(dottedM){dots=(dottedM[1].match(/\./g)||[]).length;level=dots+1;type='dotted'}
      else if(isBig&&isBold)level=1
      const title=text.replace(/^(\d+\.)+\s*/,'').replace(/^(chương|chapter|phần|part)\s+\d+[:\s.]*/i,'').replace(/^[IVX]{1,5}[\.\s]+/i,'').trim()
      if (title.length<2) continue
      entries.push({title,level,type,dots,pageNum:page.pageNum})
    }
  }
  if (entries.length<3) return null
  const hasRoman=entries.some(e=>e.type==='roman'), hasChapter=entries.some(e=>e.type==='chapter')
  for (const e of entries){
    if(hasChapter){if(e.type==='chapter'||e.type==='roman')e.level=1;else if(e.type==='arabic')e.level=2;else if(e.type==='dotted')e.level=e.dots+2}
    else if(hasRoman){if(e.type==='roman')e.level=1;else if(e.type==='arabic')e.level=2;else if(e.type==='dotted')e.level=e.dots+2}
  }
  const minL=Math.min(...entries.map(e=>e.level))
  const norm=entries.map(e=>({...e,level:e.level-minL+1}))
  const chapters=[],seen2=new Set();let cur=null
  for(const e of norm){const k=e.title.toLowerCase().slice(0,30);if(seen2.has(k))continue;seen2.add(k);if(e.level===1){if(cur)chapters.push(cur);cur={title:e.title,pageStart:e.pageNum,pageEnd:9999,children:[]}}else if(cur&&e.level<=3)cur.children.push({title:e.title,level:e.level,pageStart:e.pageNum,children:[]})}
  if(cur)chapters.push(cur)
  for(let i=0;i<chapters.length;i++)chapters[i].pageEnd=i+1<chapters.length?chapters[i+1].pageStart-1:9999
  return chapters.length>=2?chapters:null
}

// ─── BM25 + MMR ───────────────────────────────────────────────────────────────
function bm25(q,text){const qw=q.toLowerCase().split(/\s+/).filter(w=>w.length>2);if(!qw.length)return 0;const dt=(text||'').toLowerCase().split(/\s+/);const dl=dt.length||1,freq={};dt.forEach(w=>{freq[w]=(freq[w]||0)+1});let s=0;for(const w of qw){const f=freq[w]||0;if(!f)continue;s+=Math.log(1+1/(f+0.5))*(f*2.2)/(f+1.2*(0.25+0.75*dl/160))};return s/qw.length}

function mmrSelect(chunks,k=10){if(chunks.length<=k)return chunks;const result=[],rem=[...chunks];const fi=rem.reduce((bi,c,i)=>(c._s||0)>(rem[bi]?._s||0)?i:bi,0);result.push(...rem.splice(fi,1));while(result.length<k&&rem.length>0){let bI=0,bS=-Infinity;for(let i=0;i<rem.length;i++){const cw=new Set((rem[i].text||'').toLowerCase().split(/\s+/).filter(w=>w.length>3));const maxOv=result.reduce((mx,s)=>{const sw=new Set((s.text||'').toLowerCase().split(/\s+/).filter(w=>w.length>3));let ov=0;for(const w of cw)if(sw.has(w))ov++;return Math.max(mx,ov/Math.max(cw.size,sw.size,1))},0);const sc=(rem[i]._s||0)*0.6+(1-maxOv)*0.4;if(sc>bS){bS=sc;bI=i}};result.push(...rem.splice(bI,1))};return result}

function buildRAGContext(chapters, allChunks) {
  const CAP_CH=700,CAP_TOT=5000,blocks=[]
  if(!chapters?.length){
    const ranked=allChunks.map(c=>({...c,_s:(c.text||'').length}))
    return mmrSelect(ranked,14).map(c=>cleanChunkText(c.text).slice(0,350)+(c.pageNum?` (p.${c.pageNum})`:''))
      .join('\n').slice(0,CAP_TOT)
  }
  for(const ch of chapters){
    let pool=allChunks
    if(ch.pageStart>0&&ch.pageEnd!=null){const inRange=allChunks.filter(c=>c.pageNum!=null&&c.pageNum>=ch.pageStart&&c.pageNum<=ch.pageEnd);if(inRange.length>=1)pool=inRange}
    const bySection=allChunks.filter(c=>c.sectionTitle&&c.sectionTitle.toLowerCase().includes(ch.title.toLowerCase().slice(0,15)));if(bySection.length>=1)pool=[...new Map([...pool,...bySection].map(c=>[c.chunkIndex??c.text?.slice(0,20),c])).values()]
    const ranked=pool.map(c=>({...c,_s:bm25(ch.title,c.text||'')}))
    const maxScore=Math.max(...ranked.map(c=>c._s),0)
    const selected=maxScore>0?mmrSelect(ranked.sort((a,b)=>b._s-a._s),5):pool.slice(0,4)
    const excerpt=selected.map(c=>cleanChunkText(c.text).slice(0,350)).join(' ').replace(/\s+/g,' ').trim().slice(0,CAP_CH)
    const pageTag=ch.pageStart?` (p.${ch.pageStart}${ch.pageEnd&&ch.pageEnd<9999?'-'+ch.pageEnd:''})`:''
    if(excerpt.length>30)blocks.push(`[${ch.title}${pageTag}]: ${excerpt}`)
  }
  return blocks.join('\n').slice(0,CAP_TOT)
}

// ─── Phase 2 prompt: #### and ##### with max depth ───────────────────────────
function buildDetailPrompt({ ragContext, tocChapters, leafSet, sectionMap, lang }) {
  // Only generate details for TRUE LEAF nodes (no children in TOC).
  // Non-leaf nodes already have children pre-emitted — model must NOT add more to them.
  const leafTitles = []
  function collectLeafTitles(nodes) {
    for (const n of (nodes || [])) {
      if (!(n.children?.length)) leafTitles.push(cleanNodeLabel(n.title))
      else collectLeafTitles(n.children)
    }
  }
  collectLeafTitles(tocChapters)

  // Only include leaves that exist in sectionMap
  const validLeaves = sectionMap
    ? leafTitles.filter(t => {
        const norm = normForLookup(t)
        if (sectionMap.has(norm)) return true
        for (const k of sectionMap.keys()) {
          if (norm.length>4 && (k.startsWith(norm.slice(0,12)) || norm.startsWith(k.slice(0,12)))) return true
        }
        return false
      })
    : leafTitles

  const sectionList = validLeaves.map(s => `### ${s}`).join('\n')
  const isVi = lang === 'vi'

  if (isVi) return `/no_think
NỘI DUNG TÀI LIỆU (CHỈ dùng thông tin từ đây, không bịa thêm):
${ragContext}

Với mỗi ### bên dưới, thêm 2-4 #### từ NỘI DUNG TÀI LIỆU.

${sectionList}

QUY TẮC:
- Copy tên ### y hệt, không thêm | vào dòng ###
- Mỗi ### có 2-4 ####, mỗi #### quan trọng có 1-2 #####
- Không dùng ## hay thêm ### mới
- Nội dung sau | PHẢI từ NỘI DUNG TÀI LIỆU — TUYỆT ĐỐI không bịa số liệu, phần trăm, hay thông tin không có trong tài liệu
- Nếu không có thông tin chi tiết cho một mục, viết mô tả ngắn chung chung thay vì bịa ra

VÍ DỤ (với tài liệu về sơ đồ tư duy — chỉ dùng thông tin đã có):
### Nguồn gốc và phát triển
#### Người phát triển | Joseph D. Novak và nhóm nghiên cứu tại Đại học Cornell những năm 1970
#### Mục đích ban đầu | Thể hiện kiến thức khoa học mới nổi của học sinh
#### Cơ sở lý thuyết | Dựa trên lý thuyết nhận thức của David Ausubel về học tập có ý nghĩa
##### Ausubel | "Yếu tố quan trọng nhất ảnh hưởng đến việc học là những gì người học đã biết"
### Ứng dụng trong học tập
#### Phương pháp sử dụng | Học sinh từ 6 tuổi trả lời câu hỏi như "Nước là gì?" bằng sơ đồ
#### Tác động | Đồng hóa khái niệm mới vào cấu trúc nhận thức hiện có (học tập có ý nghĩa)
#### Phạm vi | Được dùng trong giáo dục, chính phủ và kinh doanh

BẮT ĐẦU:
### `

  return `/no_think
DOCUMENT CONTENT (use ONLY this — do NOT invent information):
${ragContext}

For each ### section below, add 2-4 #### details from DOCUMENT CONTENT.

${sectionList}

RULES:
- Copy ### names exactly, no | on ### lines
- Each ### gets 2-4 ####, each important #### gets 1-2 #####
- Do NOT use ## or add new ### sections
- Content after | MUST come from DOCUMENT CONTENT — NEVER invent statistics, percentages, or claims not in the document
- If no specific details exist for a section, write a brief general description instead of fabricating data

EXAMPLE (for a concept map article — only using content that exists):
### Origin and Development
#### Creator | Joseph D. Novak and research team at Cornell University in the 1970s
#### Original purpose | Represent emerging science knowledge of students
#### Theoretical basis | Based on David Ausubel's cognitive learning theory
##### Ausubel's principle | "The most important factor influencing learning is what the learner already knows"
### Educational Applications
#### Method | Students from age 6 answer focus questions like "What is water?" using concept maps
#### Impact | Assimilation of new concepts into existing cognitive structures (meaningful learning)
#### Scope | Used in education, government and business settings

BEGIN:
### `
}

function buildPromptOnlyPrompt({ topic, lang }) {
  const isVi = lang === 'vi'
  if (isVi) return `\
Tạo MINDMAP MARKDOWN CHI TIẾT về: "${topic}". CHỈ heading. KHÔNG văn xuôi.
CÚ PHÁP: ## Tên | mô tả kỹ thuật
## Nhánh | 2-3 câu kỹ thuật
### Chủ đề | định nghĩa + số liệu
#### Khái niệm | cơ chế + tham số
##### Chi tiết | công thức/giá trị
QUY TẮC: 5-7 ## | 4-5 ### mỗi ## | 3-4 #### mỗi ###
CẤM: "Tổng quan","Giới thiệu","Kết luận"
BẮT ĐẦU:
##`
  return `\
Create DETAILED MARKDOWN MINDMAP about: "${topic}". ONLY headings. NO prose.
SYNTAX: ## Name | technical description
## Branch | 2-3 technical sentences
### Topic | definition + numbers
#### Concept | mechanism + parameters
##### Detail | formula/value
RULES: 5-7 ## | 4-5 ### per ## | 3-4 #### per ###
FORBIDDEN: "Overview","Introduction","Conclusion"
BEGIN:
##`
}

// ─── Scientific Mindmap Evaluator ────────────────────────────────────────────
// Replaces the old heuristic tracker with 6-metric scientific evaluation.
// Mirrors mindmap_evaluator.py (research-level) — runs in-process, no embeddings.
// Metrics: Structural · Hierarchy · Coverage-proxy · Redundancy · Readability · Graph

function makeMapTracker() {
  const nodes = new Map()
  nodes.set('root-node', { label:'ROOT', level:0, parentId:null, children:[], description:'' })

  function addNode(id, parentId, fullLine, level) {
    const pi   = fullLine.indexOf(' | ')
    const name = (pi !== -1 ? fullLine.slice(0, pi) : fullLine).trim()
    const desc = (pi !== -1 ? fullLine.slice(pi+3) : '').trim()
    nodes.set(id, { label:name, description:desc, level, parentId, children:[] })
    if (nodes.has(parentId)) nodes.get(parentId).children.push(id)
  }

  function printTree(nodeId, indent=0) {
    const node = nodes.get(nodeId); if (!node) return
    const sym  = indent===0?'🗺 ':indent===1?'▸ ':indent===2?'  ◦ ':'    '.repeat(Math.max(0,indent-2))+'· '
    const desc = node.description ? ` — ${node.description.slice(0,85)}${node.description.length>85?'...':''}` : ''
    console.log(`${'  '.repeat(indent)}${sym}${node.label}${desc}`)
    for (const cid of node.children) printTree(cid, indent+1)
  }

  // ── M1: Structural ───────────────────────────────────────────────────────
  function _structural(all) {
    const total = all.length - 1; if (!total) return { score:0, total:0 }
    const maxDepth    = Math.max(...all.map(n => n.level))
    const childCounts = all.map(n => n.children.length).filter(c => c > 0)
    const avgCh = childCounts.length ? childCounts.reduce((s,c)=>s+c,0)/childCounts.length : 0
    const stdCh = childCounts.length
      ? Math.sqrt(childCounts.reduce((s,c)=>s+(c-avgCh)**2,0)/childCounts.length) : 0
    const leafCount = all.filter(n=>n.children.length===0&&n.level>0).length
    const leafRatio = leafCount / Math.max(total,1)
    const depthScore   = Math.max(0, 1-Math.abs(maxDepth-4)/4)
    const balanceScore = Math.max(0, 1-stdCh/Math.max(avgCh,1))
    const leafScore    = leafRatio>=0.35&&leafRatio<=0.72 ? 1
      : Math.max(0, 1-Math.min(Math.abs(leafRatio-0.35),Math.abs(leafRatio-0.72))/0.3)
    const nodeScore    = total>=8&&total<=150 ? 1 : total<8 ? total/8 : Math.max(0,1-(total-150)/100)
    const score = 0.25*depthScore+0.30*balanceScore+0.20*leafScore+0.25*nodeScore
    return { score, total, maxDepth, avgCh:+avgCh.toFixed(2), stdCh:+stdCh.toFixed(2),
             leafCount, leafRatio:+leafRatio.toFixed(3), depthScore, balanceScore }
  }

  // ── M2: Hierarchy (keyword-overlap proxy) ────────────────────────────────
  function _hierarchy(all) {
    const stop = new Set(['và','của','các','trong','với','là','có','được','cho',
      'the','a','an','of','in','on','at','to','for','is','are','was','with'])
    const kw = t => new Set(t.toLowerCase().split(/\s+/).filter(w=>w.length>3&&!stop.has(w)))
    const idMap = new Map(all.map(n=>[n.id,n]))
    let good=0, total=0; const bad=[]
    for (const n of all) {
      if (!n.parentId||!idMap.has(n.parentId)) continue
      const par = idMap.get(n.parentId); if (par.level===0) continue
      total++
      const pk = kw(`${par.label} ${par.description}`)
      const ck = kw(`${n.label} ${n.description}`)
      const overlap = [...ck].filter(w=>pk.has(w)).length
      const textMatch = n.label.toLowerCase().split(/\s+/).filter(w=>w.length>3)
        .some(w=>`${par.label} ${par.description}`.toLowerCase().includes(w))
      if (overlap>0||textMatch) good++
      else bad.push(`"${par.label.slice(0,20)}"→"${n.label.slice(0,20)}"`)
    }
    const score = total>0 ? good/total : 0.8
    return { score, total, good, bad:bad.slice(0,5) }
  }

  // ── M3: Coverage proxy (TTR + description density) ──────────────────────
  function _coverage(all) {
    const content = all.filter(n=>n.level>0)
    if (!content.length) return { score:0 }
    const stop = new Set(['và','của','the','a','an','of','in','on','to','for','is','are','with'])
    const allText = content.map(n=>`${n.label} ${n.description}`).join(' ').toLowerCase()
    const tokens = allText.split(/\s+/).filter(w=>w.length>3&&!stop.has(w))
    const unique = new Set(tokens)
    const ttr = unique.size/Math.max(tokens.length,1)
    const ttrScore = ttr>=0.28&&ttr<=0.62 ? 1 : Math.max(0,1-Math.abs(ttr-0.45)/0.45)
    const withDesc = content.filter(n=>n.description&&n.description.length>10).length
    const descDensity = withDesc/content.length
    const score = 0.50*ttrScore+0.50*descDensity
    return { score, uniqueKeywords:unique.size, totalTokens:tokens.length,
             ttr:+ttr.toFixed(3), descDensity:+descDensity.toFixed(3) }
  }

  // ── M4: Redundancy (Jaccard near-duplicate) ──────────────────────────────
  function _redundancy(all) {
    const labels = all.filter(n=>n.level>0)
      .map(n=>n.label.toLowerCase().replace(/^\d+[\.\)]\s*/,'').trim())
    let dups=0; const examples=[]; const seen=new Map()
    for (const lbl of labels) {
      const toks = new Set(lbl.split(/\s+/).filter(w=>w.length>2))
      let isDup = seen.has(lbl)
      if (!isDup) for (const [prev] of seen) {
        const pt = new Set(prev.split(/\s+/).filter(w=>w.length>2))
        const inter=[...toks].filter(w=>pt.has(w)).length
        const union=new Set([...toks,...pt]).size
        if (union>0&&inter/union>0.80){isDup=true;examples.push(`"${lbl}"≈"${prev}"`);break}
      }
      if (isDup) dups++; else seen.set(lbl,1)
    }
    const rate = dups/Math.max(labels.length,1)
    return { score:Math.max(0,1-rate*5), dups, rate:+rate.toFixed(4), examples:examples.slice(0,5) }
  }

  // ── M5: Readability ──────────────────────────────────────────────────────
  function _readability(all) {
    const content = all.filter(n=>n.level>0); if (!content.length) return { score:0 }
    const wc = content.map(n=>n.label.split(/\s+/).length)
    const avg = wc.reduce((s,c)=>s+c,0)/wc.length
    const labelScore  = Math.max(0,1-Math.abs(avg-4)/4)
    const truncScore  = 1-content.filter(n=>n.label.endsWith('...')||n.label.length<4).length/content.length
    const withDesc    = content.filter(n=>n.description&&n.description.length>10).length
    const descScore   = withDesc/content.length
    const artScore    = 1-content.filter(n=>/\[|\(p\.\d+\)/.test(n.label)).length/content.length
    const score = 0.30*labelScore+0.25*truncScore+0.25*descScore+0.20*artScore
    return { score, avgLabelWords:+avg.toFixed(2), withDesc, descCoverage:+(withDesc/content.length).toFixed(3) }
  }

  // ── M6: Graph integrity ──────────────────────────────────────────────────
  function _graph(all) {
    const idSet = new Set(all.map(n=>n.id))
    const orphans = all.filter(n=>n.parentId&&!idSet.has(n.parentId)).length
    const orphanScore = 1-orphans/Math.max(all.length,1)
    const levels = [...new Set(all.map(n=>n.level))].sort((a,b)=>a-b)
    let gapPenalty=0; for(let i=1;i<levels.length;i++) if(levels[i]-levels[i-1]>2) gapPenalty+=0.1
    const parentCounts=[]; const pc=new Map()
    for (const n of all) if(n.parentId) pc.set(n.parentId,(pc.get(n.parentId)||0)+1)
    pc.forEach(v=>parentCounts.push(v))
    const avgB = parentCounts.length ? parentCounts.reduce((s,c)=>s+c,0)/parentCounts.length : 0
    const branchScore = Math.max(0,1-Math.abs(avgB-3.5)/3.5)
    const byLevel={}; for(const n of all){if(!n.level)continue;byLevel[n.level]=(byLevel[n.level]||0)+1}
    const score = 0.35*orphanScore+0.30*Math.max(0,1-gapPenalty)+0.35*branchScore
    return { score, orphans, avgBranching:+avgB.toFixed(2), byLevel }
  }

  // ── Combined evaluate ─────────────────────────────────────────────────────
  function evaluate() {
    const all = [...nodes.values()]
    if (all.length<=1) return { total:0, finalScore:0 }
    const s  = _structural(all)
    const h  = _hierarchy(all)
    const cp = _coverage(all)
    const r  = _redundancy(all)
    const rd = _readability(all)
    const g  = _graph(all)
    const finalScore = Math.round(
      s.score*0.20*100 + h.score*0.20*100 + cp.score*0.25*100 +
      r.score*0.10*100 + rd.score*0.15*100 + g.score*0.10*100)
    return { total:all.length-1, finalScore, s, h, cp, r, rd, g }
  }

  return { addNode, printTree, evaluate }
}

function printMapAndEvaluate(tracker, title) {
  console.log('\n'+'═'.repeat(70))
  console.log(`🗺  MINDMAP: "${title}"`)
  console.log('═'.repeat(70))
  tracker.printTree('root-node')
  console.log('═'.repeat(70))

  const ev = tracker.evaluate()
  if (!ev.total) { console.log('  (empty)\n'+'═'.repeat(70)); return }
  const { finalScore:score, s, h, cp, r, rd, g } = ev
  const bar  = '█'.repeat(Math.round(score/5))+'░'.repeat(20-Math.round(score/5))
  const mbar = v => '█'.repeat(Math.round(v*10))+'░'.repeat(10-Math.round(v*10))
  const fmt  = v => v.toFixed(3)
  const rating = score>=80?'⭐⭐⭐⭐⭐ Excellent'
    :score>=65?'⭐⭐⭐⭐   Good':score>=50?'⭐⭐⭐     Fair'
    :score>=35?'⭐⭐       Poor':'⭐         Very poor'

  console.log(`\n📊 SCIENTIFIC QUALITY EVALUATION`)
  console.log(`   Total nodes    : ${ev.total}  │  Max depth: ${s.maxDepth}  │  Leaves: ${s.leafCount} (${(s.leafRatio*100).toFixed(0)}%)`)
  console.log(`   Avg children   : ${s.avgCh}  │  Std: ${s.stdCh}  │  Unique keywords: ${cp.uniqueKeywords}`)
  console.log(`   Desc coverage  : ${rd.withDesc}/${ev.total} (${(rd.descCoverage*100).toFixed(1)}%)  │  TTR: ${cp.ttr}  │  Orphans: ${g.orphans}`)
  console.log(`   By level       : ${Object.entries(g.byLevel||{}).map(([l,c])=>`L${l}:${c}`).join(' | ')}`)
  console.log(`   ┌─ Metrics ──────────────────────────────────────────────────┐`)
  console.log(`   │ Structural   ${fmt(s.score)}  [${mbar(s.score)}]  ×0.20 depth·balance·size  │`)
  console.log(`   │ Hierarchy    ${fmt(h.score)}  [${mbar(h.score)}]  ×0.20 parent-child coherence │`)
  console.log(`   │ Coverage↑    ${fmt(cp.score)}  [${mbar(cp.score)}]  ×0.25 TTR + desc density   │`)
  console.log(`   │ Redundancy   ${fmt(r.score)}  [${mbar(r.score)}]  ×0.10 near-dup Jaccard      │`)
  console.log(`   │ Readability  ${fmt(rd.score)}  [${mbar(rd.score)}]  ×0.15 label·desc·artifacts │`)
  console.log(`   │ Graph        ${fmt(g.score)}  [${mbar(g.score)}]  ×0.10 tree integrity        │`)
  console.log(`   └────────────────────────────────────────────────────────────┘`)
  console.log(`   FINAL SCORE : ${score}/100  [${bar}]  ${rating}`)

  if (ev.total<10)          console.log(`   ⚠️  Few nodes (${ev.total})`)
  if (s.maxDepth<3)         console.log(`   ⚠️  Shallow map (depth ${s.maxDepth})`)
  if (r.dups>3)             console.log(`   ⚠️  ${r.dups} near-duplicate nodes`)
  if (h.bad?.length)        console.log(`   ⚠️  Bad hierarchy: ${h.bad.slice(0,2).join(', ')}`)
  if (g.orphans>0)          console.log(`   ⚠️  ${g.orphans} orphan nodes`)
  if (rd.descCoverage<0.40) console.log(`   ⚠️  Low description coverage (${(rd.descCoverage*100).toFixed(0)}%)`)
  console.log('═'.repeat(70)+'\n')
}

// ─── Phase 2 parser: ### markers + #### ##### nodes ──────────────────────────
function makeDetailState() {
  return {
    currentSectionId:   null,
    currentSectionInfo: null,
    lastDetailId:       null,
    lastDetailInfo:     null,
    childCounts:        new Map(),
    emitted:            new Set(),
  }
}

function lookupSection(text, sectionMap) {
  const norm = normForLookup(text)
  if (sectionMap.has(norm)) return sectionMap.get(norm)
  for (const [key, info] of sectionMap) {
    if (norm.length > 4 && (key.startsWith(norm.slice(0,12)) || norm.startsWith(key.slice(0,12)))) return info
  }
  return null
}

function* parseDetailLine(rawLine, sectionMap, ds, tracker) {
  const m = rawLine.match(/^(#{2,6})\s+(.+)/); if (!m) return
  const level = m[1].length, text = m[2].trim()

  // Level 2 or 3 → treat as section marker (look up in sectionMap)
  if (level <= 3) {
    const info = lookupSection(text, sectionMap)
    if (info) {
      ds.currentSectionId   = info.id
      ds.currentSectionInfo = info
      ds.lastDetailId       = null
      ds.lastDetailInfo     = null
      if (!ds.childCounts.has(info.id)) ds.childCounts.set(info.id, 0)
      console.log(`[Detail] ### "${text.slice(0,40)}" → ${info.id}`)
    } else {
      // No match: keep previous section (don't reset to null)
      console.log(`[Detail] ### "${text.slice(0,40)}" → NO MATCH (keeping prev: ${ds.currentSectionId})`)
    }
    return
  }

  // Level 4+ → detail node
  // Fallback: if no currentSection yet, use the first entry in sectionMap
  if (!ds.currentSectionId && sectionMap.size > 0) {
    const [, firstInfo] = [...sectionMap.entries()][0]
    ds.currentSectionId   = firstInfo.id
    ds.currentSectionInfo = firstInfo
    ds.childCounts.set(firstInfo.id, 0)
    console.log(`[Detail] #### fallback to first section: ${firstInfo.id}`)
  }

  if (!ds.currentSectionId) return

  // Determine parent
  let parentId = ds.currentSectionId, parentInfo = ds.currentSectionInfo
  if (level >= 5 && ds.lastDetailId) { parentId = ds.lastDetailId; parentInfo = ds.lastDetailInfo }
  if (!parentInfo) return

  // Detail level = parent's mindmap level + 1 (regardless of what model outputs)
  // This ensures L4 parent → L5 detail, L3 parent → L4 detail
  const detailLevel = (parentInfo.level ?? 3) + 1

  const pipeIdx = text.indexOf(' | ')
  const labelRaw = cleanHeadingLine((pipeIdx !== -1 ? text.slice(0, pipeIdx) : text).trim())
  const label = labelRaw.replace(/^\d+[\.\)]\s*/,'').replace(/^[-*•]\s*/,'').trim().slice(0,100)
  if (!label || label.length < 2) return

  const key = label.toLowerCase().replace(/\s+/g,'').slice(0,28)
  if (ds.emitted.has(key)) return; ds.emitted.add(key)

  const rawDesc = pipeIdx !== -1 ? text.slice(pipeIdx+3).trim() : ''
  const description = cleanDescription(rawDesc)
  const pdfSource   = extractPageRef(description)

  const childIdx = ds.childCounts.get(parentId) || 0
  ds.childCounts.set(parentId, childIdx + 1)

  const { side, color, x:px, y:py } = parentInfo
  const xGap = Math.max(130, 210 - level * 10)
  const x = px + (side === 'right' ? 1 : -1) * xGap
  const y = py - 75 + childIdx * 82
  const id = nid(`h${detailLevel}`)

  tracker.addNode(id, parentId, text, detailLevel)
  if (detailLevel === 4) { ds.lastDetailId = id; ds.lastDetailInfo = { side, color, x, y, level: detailLevel } }

  yield mkNode({ id, parentId, label, description, pdfSource, level:detailLevel, side, color, isRoot:false, x, y })
  yield mkEdge({ parentId, childId:id, color, side })
}

async function* emitDetailStream(prompt, sectionMap, tracker) {
  const ctl = new AbortController()
  const timer = setTimeout(() => { console.warn('[Stream] Timeout'); ctl.abort() }, 200_000)
  const ds = makeDetailState()
  let lineBuf = '### ', olBuf = '', nodeCount = 0, inThink = false
  const dec = new TextDecoder()
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:'POST', signal:ctl.signal,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ model:GEN_MODEL, prompt, stream:true, options:{ temperature:0.2, num_ctx:8192, num_predict:6000, num_gpu:99, num_thread:4, stop:['\n\n\n'] } }),
    })
    if (!res.ok) { clearTimeout(timer); yield { type:'error', message:`Ollama HTTP ${res.status}` }; return }
    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      olBuf += dec.decode(value, { stream:true })
      let nl
      while ((nl = olBuf.indexOf('\n')) !== -1) {
        const jl = olBuf.slice(0, nl); olBuf = olBuf.slice(nl+1); if (!jl.trim()) continue
        try {
          const obj = JSON.parse(jl); if (!obj.response) continue
          lineBuf += obj.response
          // ── Filter qwen3 <think> blocks ───────────────────────────────────
          lineBuf = lineBuf.replace(/<think>[\s\S]*?<\/think>/g, '')
          const thinkStart = lineBuf.indexOf('<think>')
          if (thinkStart !== -1) { inThink = true; lineBuf = lineBuf.slice(0, thinkStart) }
          const thinkEnd = lineBuf.indexOf('</think>')
          if (inThink && thinkEnd !== -1) { inThink = false; lineBuf = lineBuf.slice(thinkEnd + 8) }
          if (inThink) { lineBuf = ''; continue }
          // ─────────────────────────────────────────────────────────────────
          let lf
          while ((lf = lineBuf.indexOf('\n')) !== -1) {
            const line = lineBuf.slice(0, lf).trim(); lineBuf = lineBuf.slice(lf+1); if (!line) continue
            const before = ds.emitted.size
            yield* parseDetailLine(line, sectionMap, ds, tracker)
            if (ds.emitted.size > before) { nodeCount++; if (nodeCount%10===0) yield { type:'status', message:`↓ ${nodeCount} nodes...` } }
          }
          if (obj.done) break
        } catch(_) {}
      }
    }
    if (lineBuf.trim()) yield* parseDetailLine(lineBuf.trim(), sectionMap, ds, tracker)
  } catch (err) { if (err.name !== 'AbortError') yield { type:'error', message:err.message } }
  finally { clearTimeout(timer) }
}

// ─── Prompt-only parser (unchanged v12) ──────────────────────────────────────
function makeParserState(rootColor) {
  return { nodeStack:[{id:'root-node',level:0,side:null,color:rootColor,x:600,y:400}], childCounts:new Map(), l1Count:0, emitted:new Set() }
}

function* parseLine(rawLine, state, tracker) {
  const m = rawLine.match(/^(#{1,6})\s+(.+)/); if (!m) return
  const headingLevel = m[1].length, rest = m[2].trim()
  const pipeIdx = rest.indexOf(' | ')
  const labelRaw = cleanHeadingLine((pipeIdx!==-1?rest.slice(0,pipeIdx):rest).trim())
  const label = labelRaw.replace(/^\d+[\.\)]\s*/,'').replace(/^[-*•]\s*/,'').trim().slice(0,100)
  if (!label||label.length<2) return
  const key = label.toLowerCase().replace(/\s+/g,'').slice(0,28)
  if (state.emitted.has(key)) return; state.emitted.add(key)
  const description = (pipeIdx!==-1?rest.slice(pipeIdx+3):'').trim()
  const pdfSource = extractPageRef(description)
  while (state.nodeStack.length>1&&state.nodeStack[state.nodeStack.length-1].level>=headingLevel) state.nodeStack.pop()
  const parent = state.nodeStack[state.nodeStack.length-1]
  const side = parent.level===0?(state.l1Count%2===0?'right':'left'):parent.side
  const color = parent.level===0?COLORS[state.l1Count%COLORS.length]:parent.color
  if (parent.level===0) state.l1Count++
  const childIdx = state.childCounts.get(parent.id)||0; state.childCounts.set(parent.id,childIdx+1)
  const xGap = Math.max(145,235-parent.level*13)
  const x = parent.x+(side==='right'?1:-1)*xGap, y = parent.y-90+childIdx*88
  const id = nid(`l${headingLevel}`)
  tracker.addNode(id,parent.id,rest,headingLevel)
  yield mkNode({id,parentId:parent.id,label,description,pdfSource,level:headingLevel,side,color,isRoot:false,x,y})
  yield mkEdge({parentId:parent.id,childId:id,color,side})
  state.nodeStack.push({id,level:headingLevel,side,color,x,y})
}

async function* emitMarkdownStream(prompt, rootColor, tracker) {
  const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),200_000)
  const state=makeParserState(rootColor); let lineBuf='##',olBuf='',nodeCount=0,inThink=false; const dec=new TextDecoder()
  try {
    const res=await fetch(`${OLLAMA_BASE}/api/generate`,{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model:GEN_MODEL,prompt,stream:true,options:{temperature:0.2,num_ctx:8192,num_predict:6000,num_gpu:99,num_thread:4,stop:['\n\n\n']}})})
    if(!res.ok){clearTimeout(timer);yield{type:'error',message:`Ollama HTTP ${res.status}`};return}
    const reader=res.body.getReader()
    while(true){
      const{done,value}=await reader.read();if(done)break
      olBuf+=dec.decode(value,{stream:true})
      let nl
      while((nl=olBuf.indexOf('\n'))!==-1){
        const jl=olBuf.slice(0,nl);olBuf=olBuf.slice(nl+1);if(!jl.trim())continue
        try{
          const obj=JSON.parse(jl);if(!obj.response)continue
          lineBuf+=obj.response
          // Filter qwen3 <think> blocks
          lineBuf=lineBuf.replace(/<think>[\s\S]*?<\/think>/g,'')
          const ts=lineBuf.indexOf('<think>')
          if(ts!==-1){inThink=true;lineBuf=lineBuf.slice(0,ts)}
          const te=lineBuf.indexOf('</think>')
          if(inThink&&te!==-1){inThink=false;lineBuf=lineBuf.slice(te+8)}
          if(inThink){lineBuf='';continue}
          let lf
          while((lf=lineBuf.indexOf('\n'))!==-1){
            const line=lineBuf.slice(0,lf).trim();lineBuf=lineBuf.slice(lf+1);if(!line)continue
            const before=state.emitted.size;yield* parseLine(line,state,tracker)
            if(state.emitted.size>before){nodeCount++;if(nodeCount%10===0)yield{type:'status',message:`↓ ${nodeCount} nodes...`}}
          }
          if(obj.done)break
        }catch(_){}
      }
    }
    if(lineBuf.trim())yield* parseLine(lineBuf.trim(),state,tracker)
  }catch(err){if(err.name!=='AbortError')yield{type:'error',message:err.message}}
  finally{clearTimeout(timer)}
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export async function* streamMindmapGeneration({ title, pagesData, savedChunks, mindmapId, userPrompt, mode, tocChapters }) {
  _seq = 0
  const ROOT_X = 600, ROOT_Y = 400
  const allText = pagesData ? pagesData.map(p=>p.text||'').join('\n') : (userPrompt||title)
  const lang    = detectLang(allText)
  const isPDF   = !!(pagesData && savedChunks?.length)
  const RCLR    = isPDF ? '#3b82f6' : '#8b5cf6'
  const tracker = makeMapTracker()

  console.log(`[Stream] v12-hybrid START "${title}" isPDF=${isPDF} chunks=${savedChunks?.length??0}`)
  yield mkNode({ id:'root-node', parentId:null, label:title, description:'', level:0, side:null, color:RCLR, isRoot:true, x:ROOT_X, y:ROOT_Y })

  if (isPDF) {
    yield { type:'status', message:`PDF ↓ ${pagesData.length} pages · ${savedChunks.length} chunks` }

    let chapters = tocChapters || null

    if (!chapters?.length) {
      // Path 1: TOC page (from controller pre-extraction via extractTOCBest)
      // Path 2: AI full-text (handled inside extractTOCBest)
      yield { type:'status', message:`↓ Analyzing structure (${pagesData.length} pages)...` }
      try {
        const best = await extractTOCBest(pagesData, { lang })
        if (best?.chapters?.length >= 2) {
          chapters = best.chapters
          console.log(`[Stream] TOC via "${best.method}": ${chapters.length} chapters`)
          yield { type:'status', message:`↓ ${chapters.length} chapters (${best.method})` }
        }
      } catch(err) { console.warn('[Stream] extractTOCBest:', err.message) }
    }

    const ragContext = buildRAGContext(chapters, savedChunks)

    // ── Short/unstructured document detection ─────────────────────────────────
    // Short doc with no structural TOC found → single-call avoids hallucination
    const isShortDoc = pagesData.length <= 8
    const hasRealStructure = chapters && chapters.length >= 2 &&
      chapters.some(c => (c.children||[]).length > 0)

    if (isShortDoc && !hasRealStructure) {
      // Short unstructured doc: single-call with all content as context
      console.log(`[Stream] Short doc (${pagesData.length}pg) + no heading structure → single-call`)
      yield { type:'status', message:'↓ Generating from content...' }
      const singlePrompt = lang === 'vi'
        ? `TÀI LIỆU: "${title}"\n\nNỘI DUNG (CHỈ dùng thông tin này, không bịa thêm):\n${ragContext}\n\nViết mindmap markdown chi tiết về tài liệu. CHỈ heading. KHÔNG bịa số liệu.\n## `
        : `DOCUMENT: "${title}"\n\nCONTENT (use ONLY this, do NOT fabricate information):\n${ragContext}\n\nWrite detailed markdown mindmap. ONLY headings. Do NOT invent statistics.\n## `
      yield* emitMarkdownStream(singlePrompt, RCLR, tracker)
      printMapAndEvaluate(tracker, title)
      yield { type:'done', totalNodes:_seq+1 }
      return
    }

    if (!chapters?.length) {
      // No structure fallback
      yield { type:'status', message:'↓ No structure detected...' }
      const prompt = lang==='vi'
        ? `TÀI LIỆU: "${title}"\nNỘI DUNG:\n${ragContext}\n\nViết mindmap markdown chi tiết.\n##`
        : `DOCUMENT: "${title}"\nCONTENT:\n${ragContext}\n\nWrite detailed markdown mindmap.\n##`
      yield* emitMarkdownStream(prompt, RCLR, tracker)
      printMapAndEvaluate(tracker, title)
      yield { type:'done', totalNodes:_seq+1 }
      return
    }

    const pageLookup = buildPageLookup(chapters)

    // ── Filter TOC: remove use-case steps, preserve full hierarchy ─────────
    const displayChapters = filterTOCForDisplay(chapters)
    const countNodes = (nodes) => nodes.reduce((s,c) => s + 1 + countNodes(c.children||[]), 0)
    console.log(`[Stream] TOC filtered: ${chapters.length}→${displayChapters.length} chapters, ${countNodes(displayChapters)} total nodes`)

    // Phase 1: Pre-emit ALL TOC nodes at correct depths (## ### #### #####)
    yield { type:'status', message:`↓ Structure: ${displayChapters.length} chapters` }
    const { events:tocEvents, sectionMap, leafSet } = buildTOCStructure(displayChapters, pageLookup, tracker)
    for (const event of tocEvents) yield event
    console.log(`[Stream] Pre-emitted ${tocEvents.filter(e=>e.type==='node').length} TOC nodes | ${sectionMap.size} sectionMap entries | ${leafSet.size} leaf nodes`)
    console.log('[Stream] sectionMap keys:', [...sectionMap.keys()].slice(0,20).join(' | '))

    // Phase 2: Only generate details for LEAF nodes (nodes with no children in TOC)
    yield { type:'status', message:'↓ Generating leaf details...' }
    const prompt = buildDetailPrompt({ ragContext, tocChapters: displayChapters, leafSet, sectionMap, lang })
    console.log(`[Stream] RAG: ${ragContext.length} chars | prompt: ${prompt.length} chars`)
    yield* emitDetailStream(prompt, sectionMap, tracker)

    printMapAndEvaluate(tracker, title)
    yield { type:'done', totalNodes:_seq+1 }
    return
  }

  // Prompt-only
  const topic  = userPrompt?.trim() || title
  const prompt = buildPromptOnlyPrompt({ topic, lang })
  yield { type:'status', message:`Generating: "${topic.slice(0,50)}"...` }
  yield* emitMarkdownStream(prompt, RCLR, tracker)
  printMapAndEvaluate(tracker, title)
  yield { type:'done', totalNodes:_seq+1 }
}
// GenAI/utils/jsonSafe.js
// Parse JSON từ output LLM (Ollama) với nhiều fallback strategy.
// Không dùng Gemini — chỉ parse thuần JS.

// ─────────────────────────────────────────────────────────────────────────────
// PARSE LAYER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tìm JSON hợp lệ trong raw string bằng nhiều phương pháp.
 * Không throw — trả về null nếu tất cả fail.
 */
export function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null

  // Strategy 1: Parse thẳng
  const trimmed = raw.trim()
  try { return JSON.parse(trimmed) } catch (_) {}

  // Strategy 2: Strip markdown fences ```json ... ```
  const stripped = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
  try { return JSON.parse(stripped) } catch (_) {}

  // Strategy 3: Tìm khối {...} hoặc [...] đầu tiên bằng depth tracking
  const extracted = extractFirstJSONBlock(stripped)
  if (extracted !== null) return extracted

  // Strategy 4: Sửa JSON bị truncate (token limit cắt ngang)
  const repaired = repairTruncatedJSON(stripped)
  if (repaired !== null) return repaired

  return null
}

/**
 * Trích xuất khối JSON đầu tiên bằng cách track độ sâu ngoặc.
 * Xử lý được JSON lồng sâu, tốt hơn regex nhiều.
 */
function extractFirstJSONBlock(text) {
  const starts = []
  const brace   = text.indexOf('{')
  const bracket = text.indexOf('[')

  if (brace   !== -1) starts.push({ idx: brace,   open: '{', close: '}' })
  if (bracket !== -1) starts.push({ idx: bracket, open: '[', close: ']' })
  if (starts.length === 0) return null

  const { idx, open, close } = starts.sort((a, b) => a.idx - b.idx)[0]

  let depth    = 0
  let inString = false
  let escape   = false

  for (let i = idx; i < text.length; i++) {
    const ch = text[i]
    if (escape)      { escape = false; continue }
    if (ch === '\\') { escape = true;  continue }
    if (ch === '"')  { inString = !inString; continue }
    if (inString)    continue
    if (ch === open)  depth++
    if (ch === close) depth--
    if (depth === 0) {
      try { return JSON.parse(text.slice(idx, i + 1)) } catch (_) { return null }
    }
  }
  return null
}

/**
 * Cố gắng sửa JSON bị cắt giữa chừng (truncated by token limit).
 * Đóng tất cả ngoặc đang mở theo thứ tự ngược lại.
 */
function repairTruncatedJSON(text) {
  const brace   = text.indexOf('{')
  const bracket = text.indexOf('[')
  if (brace === -1 && bracket === -1) return null

  const startIdx = (brace !== -1 && bracket !== -1)
    ? Math.min(brace, bracket)
    : Math.max(brace, bracket)

  // Xóa trailing comma trước khi đóng ngoặc
  let truncated = text.slice(startIdx).replace(/,\s*$/, '')

  const stack  = []
  let inString = false
  let escape   = false
  const pairs  = { '{': '}', '[': ']' }
  const closes = new Set(['}', ']'])

  for (const ch of truncated) {
    if (escape)      { escape = false; continue }
    if (ch === '\\') { escape = true;  continue }
    if (ch === '"')  { inString = !inString; continue }
    if (inString)    continue
    if (pairs[ch])   stack.push(pairs[ch])
    if (closes.has(ch)) stack.pop()
  }

  try { return JSON.parse(truncated + stack.reverse().join('')) } catch (_) { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD COMPAT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * parseJSON — giữ lại để backward compat với code cũ.
 * Throw nếu không parse được (khác extractJSON trả null).
 */
export function parseJSON(raw) {
  const result = extractJSON(raw)
  if (result !== null) return result
  throw new Error('AI returned invalid JSON: ' + (raw?.slice(0, 200) ?? '(empty)'))
}
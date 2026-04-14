// Frontend/src/services/aiService.js
// Complete service — replaces any previous version.
// All AI calls go through backend /api/mindmaps/:id/... so auth token is included.

import { api } from '../lib/api'

export const aiService = {
  // ── Generate mindmap from PDF ─────────────────────────────────────────
  // Used by PDFUploadModal
  async generateFromPdf(mindmapId, file, onProgress) {
    const formData = new FormData()
    formData.append('pdf', file)

    const { data } = await api.post(
      `/mindmaps/${mindmapId}/generate-from-pdf`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (onProgress && evt.total) {
            onProgress(Math.round((evt.loaded * 100) / evt.total))
          }
        },
        timeout: 600_000,
      }
    )
    return data
    // Returns: { ok, mindmap: { root: {...} }, chunks: [...], meta }
  },

  // ── Generate mindmap from text prompt ─────────────────────────────────
  // Used by AIAssistantModal
  async generateFromPrompt(mindmapId, prompt) {
    const { data } = await api.post(
      `/mindmaps/${mindmapId}/generate-from-prompt`,
      { prompt },
      { timeout: 90_000 }
    )
    return data
    // Returns: { ok, mindmap: { root: {...} }, groundingSources: [...] }
  },

  // ── Suggest child nodes for selected node ─────────────────────────────
  // Used by FloatingToolbar
  // NOTE: signature kept as (nodeId, context) for FloatingToolbar compat.
  //       mindmapId must be in context OR we call backend without it.
  //       To avoid breaking FloatingToolbar, we accept optional mindmapId.
  async suggestNodes(nodeIdOrMindmapId, context, mindmapIdArg) {
    // Support both call patterns:
    //   suggestNodes(nodeId, context)              — old (no mindmapId)
    //   suggestNodes(mindmapId, nodeId, context)   — new (preferred)
    let mindmapId, finalContext

    if (mindmapIdArg !== undefined) {
      // New style: (mindmapId, nodeId, context)
      mindmapId    = nodeIdOrMindmapId
      finalContext = mindmapIdArg
    } else {
      // Old style: (nodeId, context) — mindmapId comes from context
      mindmapId    = context?.mindmapId
      finalContext = context
    }

    if (mindmapId) {
      // Preferred: go through authenticated backend
      const { data } = await api.post(
        `/mindmaps/${mindmapId}/ai-suggest`,
        { context: finalContext },
        { timeout: 30_000 }
      )
      return data
      // Returns: { ok: true, suggestions: [{text: '...'}] }
    }

    // Fallback: call GenAI directly (no auth — use sparingly)
    const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:4000'
    const res = await fetch(`${AI_URL}/ai/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: finalContext }),
    })
    if (!res.ok) throw new Error('AI suggest failed')
    return res.json()
  },
}
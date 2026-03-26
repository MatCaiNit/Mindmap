// GenAI/controllers/ai.controller.js
// Changes:
//   + generateFromPromptController (new)
//   ~ generateFromPdfController (use improved service)
//   ~ suggestController (use improved service)
//   ~ deleteChunksController (use service helper)

import {
  generateFromPdf,
  generateFromPrompt,
  suggestNodes,
  deleteChunks,
} from '../services/ai.service.js'

// ── POST /ai/generate-from-pdf ────────────────────────────────────────────
export async function generateFromPdfController(req, res) {
  try {
    const { mindmapId, filename } = req.body

    if (!req.file) return res.status(400).json({ error: 'Missing PDF file' })
    if (!mindmapId) return res.status(400).json({ error: 'Missing mindmapId' })

    const result = await generateFromPdf(req.file.buffer, filename || req.file.originalname, mindmapId)
    res.json(result)
  } catch (err) {
    console.error('[AI] generateFromPdf error:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── POST /ai/generate-from-prompt ─────────────────────────────────────────
// NEW: generate mindmap from a text prompt (no PDF needed)
export async function generateFromPromptController(req, res) {
  try {
    const { prompt } = req.body
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Missing prompt' })

    const result = await generateFromPrompt(prompt.trim())
    res.json(result)
  } catch (err) {
    console.error('[AI] generateFromPrompt error:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── POST /ai/generate-mindmap ─────────────────────────────────────────────
// Legacy alias kept for backward compatibility
export async function generateMindmapController(req, res) {
  try {
    const { text, prompt } = req.body
    const input = (text || prompt || '').trim()
    if (!input) return res.status(400).json({ error: 'Missing text/prompt' })

    const result = await generateFromPrompt(input)
    res.json(result)
  } catch (err) {
    console.error('[AI] generateMindmap error:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── POST /ai/suggest ──────────────────────────────────────────────────────
export async function suggestController(req, res) {
  try {
    const { context } = req.body
    if (!context) return res.status(400).json({ error: 'Missing context' })

    const suggestions = await suggestNodes(context)
    res.json({ ok: true, suggestions })
  } catch (err) {
    console.error('[AI] suggest error:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── DELETE /ai/chunks/:mindmapId ──────────────────────────────────────────
export async function deleteChunksController(req, res) {
  try {
    const { mindmapId } = req.params
    const count = await deleteChunks(mindmapId)
    res.json({ ok: true, deleted: count })
  } catch (err) {
    console.error('[AI] deleteChunks error:', err)
    res.status(500).json({ error: err.message })
  }
}
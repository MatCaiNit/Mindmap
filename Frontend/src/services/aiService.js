// Frontend/src/services/aiService.js
// Supports: PDF only | Prompt only | Combined (PDF + Prompt) | Expand node

import { api } from '../lib/api'

export const aiService = {

  // ── Generate from PDF (with optional user prompt = combined mode) ──────────
  async generateFromPdf(mindmapId, file, onProgress, userPrompt = '') {
    const formData = new FormData()
    formData.append('pdf', file)
    formData.append('mindmapId', mindmapId)
    if (userPrompt?.trim()) {
      formData.append('userPrompt', userPrompt.trim())
    }

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
  },

  // ── Generate from text prompt ─────────────────────────────────────────────
  async generateFromPrompt(mindmapId, prompt) {
    const { data } = await api.post(
      `/mindmaps/${mindmapId}/generate-from-prompt`,
      { prompt },
      { timeout: 180_000 }
    )
    return data
  },

  // ── Progressive: expand a single node on demand ───────────────────────────
  async expandNode(mindmapId, { nodeText, parentChain, lang }) {
    const { data } = await api.post(
      `/mindmaps/${mindmapId}/ai-expand-node`,
      { nodeText, parentChain, lang },
      { timeout: 60_000 }
    )
    return data
  },

  // ── Suggest child nodes (toolbar) ─────────────────────────────────────────
  async suggestNodes(nodeIdOrCtx, context, mindmapIdArg) {
    let mindmapId, finalContext

    if (mindmapIdArg !== undefined) {
      mindmapId = nodeIdOrCtx
      finalContext = mindmapIdArg
    } else {
      mindmapId = context?.mindmapId
      finalContext = context
    }

    if (mindmapId) {
      const { data } = await api.post(
        `/mindmaps/${mindmapId}/ai-suggest`,
        { context: finalContext },
        { timeout: 30_000 }
      )
      return data
    }

    // Fallback direct call
    const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:4000'
    const res = await fetch(`${AI_URL}/ai/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: finalContext }),
    })
    if (!res.ok) throw new Error('AI suggest failed')
    return res.json()
  },

  /**
   * Gọi API Progressive Generate và lắng nghe Stream
   */
  async generateProgressive(mindmapId, file, prompt, onMessage, onError) {
    const formData = new FormData();
    formData.append('file', file);
    if (prompt) formData.append('prompt', prompt);

    try {
        // Dùng native fetch để lấy stream thay vì axios
        const response = await fetch(`${import.meta.env.VITE_API_URL}/mindmaps/${mindmapId}/ai-generate-stream`, {
            method: 'POST',
            body: formData,
            headers: {
                // Thêm auth token nếu cần:
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                onMessage({ type: 'COMPLETED', data: {} });
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const parsedData = JSON.parse(line.substring(6));
                        onMessage(parsedData); // Gửi data cho Component xử lý
                    } catch (e) {
                        console.error('Lỗi parse SSE:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Fetch stream error:', error);
        onError(error);
    }
  }
}
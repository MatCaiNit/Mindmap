import * as aiService from '../services/ai.service.js';
import { validateMindmap } from '../utils/validate.js';

export async function generateMindmap(req, res) {
  const { text } = req.body;
  if (!text) return res.status(400).json({ ok: false, error: 'Missing text' });

  try {
    const mindmap = await aiService.generateMindmapFromText(text);

    // validate trước khi trả
    const valid = validateMindmap(mindmap);
    if (!valid) return res.status(500).json({ ok: false, error: 'Invalid mindmap format' });

    res.json({ ok: true, mindmap });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

export async function suggestNode(req, res) {
  const { context } = req.body;
  if (!context) return res.status(400).json({ ok: false, error: 'Missing context' });

  try {
    const suggestion = await aiService.suggestNodeFromContext(context);
    res.json({ ok: true, suggestion });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

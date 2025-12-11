// Backend/services/ai.client.js
import axios from 'axios';
const AI_URL = process.env.AI_GATEWAY_URL || 'http://localhost:4000';

export async function aiGenerate(text) {
  const r = await axios.post(`${AI_URL}/ai/generate-mindmap`, { text }).catch(e => ({ data: { ok: false, error: e.message } }));
  return r.data;
}

export async function aiSuggest(context) {
  const r = await axios.post(`${AI_URL}/ai/suggest`, { context }).catch(e => ({ data: { ok: false, error: e.message } }));
  return r.data;
}

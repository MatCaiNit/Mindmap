import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Generate mindmap from text
export async function generateMindmapFromText(text) {
  const prompt = `
  Bạn là AI tạo sơ đồ tư duy (mindmap) từ văn bản sau. 
  Trả về JSON có dạng: { id, text, children: [...] }.
  Văn bản: "${text}"
  `;
  
  const resp = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });

  // Giả sử GPT trả về JSON trong resp.choices[0].message.content
  let mindmap;
  try {
    mindmap = JSON.parse(resp.choices[0].message.content);
  } catch (err) {
    throw new Error('AI trả về JSON không hợp lệ');
  }

  return mindmap;
}

// Suggest node based on context
export async function suggestNodeFromContext(context) {
  const prompt = `
  Bạn là AI gợi ý node mới cho sơ đồ tư duy.
  Dựa trên context: "${context}"
  Trả về JSON: { id, text, children: [] }
  `;

  const resp = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });

  let suggestion;
  try {
    suggestion = JSON.parse(resp.choices[0].message.content);
  } catch (err) {
    throw new Error('AI trả về JSON không hợp lệ');
  }

  return suggestion;
}

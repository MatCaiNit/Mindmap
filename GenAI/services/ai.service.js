import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import dotenv from 'dotenv'
dotenv.config()

const PROVIDER = process.env.AI_PROVIDER || 'gemini'

// Khởi tạo model theo provider
let geminiModel = null
let groqClient  = null

if (PROVIDER === 'gemini') {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  geminiModel = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
  })
} else {
  groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY })
}

async function generateText(prompt, systemPrompt = '') {
  if (PROVIDER === 'groq') {
    const completion = await groqClient.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096,
    })
    return completion.choices[0].message.content
  }

  const result = await geminiModel.generateContent(
    systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt
  )
  return result.response.text()
}

const MINDMAP_SYSTEM_PROMPT = `Bạn là AI chuyên tạo mindmap.
Trả lời ĐÚNG định dạng JSON, KHÔNG có text khác:
{
  "root": "Chủ đề chính",
  "children": [
    { "text": "Nhánh 1", "children": [{ "text": "Lá 1.1" }] }
  ]
}
Tạo 4-6 nhánh chính, mỗi nhánh 2-4 lá.`

export async function generateMindmapFromText(text) {
  const raw = await generateText(`Tạo mindmap từ:\n\n${text}`, MINDMAP_SYSTEM_PROMPT)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI không trả về JSON hợp lệ')
  return JSON.parse(match[0])
}

export async function generateMindmapFromContext(chunks) {
  const context = chunks
    .map((c, i) => `[Đoạn ${i+1}]:\n${c.text}`)
    .join('\n\n')
  const raw = await generateText(
    `Tạo mindmap tổng hợp từ nội dung PDF:\n\n${context}`,
    MINDMAP_SYSTEM_PROMPT
  )
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI không trả về JSON hợp lệ')
  return JSON.parse(match[0])
}

export async function suggestNodes(context) {
  const { currentNode, parentNodes = [], siblings = [] } = context
  const prompt = `Mindmap context:
Node hiện tại: "${currentNode}"
${parentNodes.length ? `Đường dẫn: ${parentNodes.join(' → ')}` : ''}
${siblings.length ? `Cùng cấp: ${siblings.join(', ')}` : ''}

Đề xuất 4 ý tưởng con cho "${currentNode}".
JSON: { "suggestions": [{"text": "..."}] }`

  const raw   = await generateText(prompt)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Parse error')
  return JSON.parse(match[0])
}
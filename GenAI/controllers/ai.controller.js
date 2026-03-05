// GenAI/controllers/ai.controller.js - FIXED
import mongoose from 'mongoose';
import * as aiService from '../services/ai.service.js';
import PdfChunk from '../models/PDFChunk.js';
import { extractChunksFromPdf } from '../services/pdfExtractor.js';
import { embedChunks } from '../services/embedder.js';
import { retrieveTopChunks } from '../services/retriever.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  generationConfig: { responseMimeType: "application/json" }
});

export async function generateMindmap(req, res) {
  const { text } = req.body;
  
  console.log('\n========================================');
  console.log('🤖 AI GENERATE MINDMAP REQUEST');
  console.log('========================================');
  console.log('Topic:', text);
  
  if (!text) {
    console.log('❌ Missing text');
    return res.status(400).json({ ok: false, error: 'Missing text' });
  }

  try {
    const mindmap = await aiService.generateMindmapFromText(text);

    console.log('✅ Mindmap generated successfully');
    console.log('   Root:', mindmap.text);
    console.log('   Branches:', mindmap.children?.length || 0);
    console.log('========================================\n');

    res.json({ ok: true, mindmap });

  } catch (err) {
    console.error('❌ Generation failed:', err.message);
    console.log('========================================\n');
    
    res.status(500).json({ 
      ok: false, 
      error: err.message || 'AI generation failed'
    });
  }
}

export async function suggestNode(req, res) {
  const { context } = req.body;
  
  console.log('\n========================================');
  console.log('💡 AI SUGGEST NODES REQUEST');
  console.log('========================================');
  console.log('Current node:', context?.currentNode);
  
  if (!context || !context.currentNode) {
    console.log('❌ Missing context');
    return res.status(400).json({ ok: false, error: 'Missing context' });
  }

  try {
    const suggestions = await aiService.suggestNodeFromContext(context);

    console.log('✅ Suggestions generated:', suggestions.length);
    console.log('========================================\n');

    res.json({ ok: true, suggestions });

  } catch (err) {
    console.error('❌ Suggestion failed:', err.message);
    console.log('========================================\n');
    
    res.status(500).json({ 
      ok: false, 
      error: err.message || 'AI suggestion failed'
    });
  }
}

/**
 * POST /ai/generate-from-pdf
 * Nhận PDF buffer từ Backend, extract → embed → lưu → generate mindmap
 */
export async function generateFromPdf(req, res) {
  try {
    const { mindmapId, filename = 'document.pdf' } = req.body;

    if (!mindmapId || !req.file) {
      return res.status(400).json({ ok: false, error: 'Missing mindmapId or PDF file' });
    }

    console.log(`\n Processing PDF: ${filename}`);

    // 1. Xóa chunks cũ
    await PdfChunk.deleteMany({ mindmapId });

    // 2. Extract & Embed
    const chunks = await extractChunksFromPdf(req.file.buffer, filename);
    const embeddedChunks = await embedChunks(chunks);

    // 3. Lưu Database
    await PdfChunk.insertMany(
      embeddedChunks.map(c => ({ ...c, mindmapId }))
    );
    console.log(` Saved ${embeddedChunks.length} chunks to DB`);

    // 4. Tìm top chunks liên quan nhất để làm ngữ cảnh
    const topChunks = await retrieveTopChunks(
      mindmapId,
      'tình hình chiến sự',
      15
    );

    // 5. Tạo Mindmap từ ngữ cảnh đã tìm được
    const contextText = topChunks.map(c => `[Trang ${c.page}] ${c.text}`).join('\n\n');
    const mindmap = await generateMindmapFromContext(contextText);

    res.json({
      ok: true,
      mindmap,
      meta: {
        totalChunks: embeddedChunks.length,
        pagesUsed: [...new Set(topChunks.map(c => c.page))].sort((a, b) => a - b)
      }
    });
  } catch (err) {
    console.error(' generateFromPdf error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * DELETE /ai/chunks/:mindmapId
 * Xóa tất cả chunks của một mindmap (khi mindmap bị xóa)
 */
export async function deleteChunks(req, res) {
  try {
    const { mindmapId } = req.params

    if (!mindmapId) {
      return res.status(400).json({ ok: false, error: 'Missing mindmapId' })
    }

    const result = await PdfChunk.deleteMany({ mindmapId })
    console.log(`  Deleted ${result.deletedCount} chunks for mindmap: ${mindmapId}`)

    res.json({ ok: true, deletedCount: result.deletedCount })
  } catch (err) {
    console.error(' deleteChunks error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
}

/**
 * GET /ai/chunks/:mindmapId/node-source
 * Tìm source chunk cho một node text cụ thể (để highlight PDF)
 */
export async function getNodeSource(req, res) {
  try {
    const { mindmapId } = req.params
    const { nodeText } = req.query

    if (!nodeText) {
      return res.status(400).json({ ok: false, error: 'Missing nodeText' })
    }

    const chunks = await retrieveTopChunks(mindmapId, nodeText, 3)

    res.json({
      ok: true,
      sources: chunks.map(c => ({
        text: c.text,
        page: c.page,
        bbox: c.bbox,
        filename: c.filename,
        score: c.score
      }))
    })
  } catch (err) {
    console.error(' getNodeSource error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
}

// ── HELPER ──────────────────────────────────────────────────────────────────

async function generateMindmapFromContext(context) {
  const prompt = `Bạn là một chuyên gia tóm tắt tài liệu dưới dạng mindmap.
Dựa trên nội dung trích dẫn từ PDF dưới đây, hãy tạo một sơ đồ tư duy logic.

NỘI DUNG TRÍCH DẪN:
${context}

YÊU CẦU:
1. Trả về DUY NHẤT định dạng JSON.
2. Cấu trúc: { "text": "Tiêu đề chính", "children": [ { "text": "Ý chính 1", "children": [...] } ] }
3. Root node là chủ đề tổng quát của tài liệu.
4. Tối đa 3 cấp độ sâu, mỗi cấp 3-5 nhánh.
5. Sử dụng Tiếng Việt súc tích (dưới 10 từ mỗi node).`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const responseText = result.response.text();
    
    // Loại bỏ markdown nếu Gemini lỡ tay thêm vào
    const cleanJson = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error(" Gemini Mindmap Error:", error);
    throw new Error("Không thể tạo Mindmap từ nội dung PDF.");
  }
}
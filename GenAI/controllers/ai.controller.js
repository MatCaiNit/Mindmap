// GenAI/controllers/ai.controller.js - FIXED
import * as aiService from '../services/ai.service.js';

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
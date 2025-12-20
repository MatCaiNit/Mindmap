// GenAI/services/ai.service.js - FIXED JSON OUTPUT
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Generate mindmap from text
export async function generateMindmapFromText(text) {
  const prompt = `You are a mindmap generator. Given a topic, create a hierarchical mindmap structure.

CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON, no markdown, no code blocks, no explanations
2. Structure must be: { "text": "root topic", "children": [...] }
3. Each child: { "text": "child topic", "children": [...] }
4. Maximum 3 levels deep
5. 3-5 main branches, each with 2-4 sub-branches

Topic: "${text}"

Return ONLY the JSON object:`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a mindmap generator. You ONLY output valid JSON. Never use markdown code blocks. Never add explanations." 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    let content = resp.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    console.log('🤖 AI Raw Response:', content);

    const mindmap = JSON.parse(content);
    
    // Validate structure
    if (!mindmap.text || !Array.isArray(mindmap.children)) {
      throw new Error('Invalid mindmap structure from AI');
    }

    // Add IDs if missing
    addIdsToMindmap(mindmap);
    
    console.log('✅ AI Mindmap validated:', {
      root: mindmap.text,
      branches: mindmap.children?.length || 0
    });

    return mindmap;

  } catch (err) {
    console.error('❌ AI Generation failed:', err.message);
    throw new Error('AI generation failed: ' + err.message);
  }
}

// Suggest nodes based on context
export async function suggestNodeFromContext(context) {
  const { currentNode, parentNodes, siblings } = context;
  
  const prompt = `Generate 3-5 related child ideas for a mindmap node.

CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON, no markdown, no code blocks
2. Structure: { "suggestions": [{"text": "idea1"}, {"text": "idea2"}, ...] }
3. Each suggestion is ONE short phrase (3-7 words)
4. Ideas must be relevant and diverse

Current node: "${currentNode}"
Parent context: ${parentNodes?.join(' > ') || 'root'}
Existing siblings: ${siblings?.join(', ') || 'none'}

Return ONLY the JSON object:`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a mindmap suggestion assistant. You ONLY output valid JSON. Never use markdown code blocks." 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      response_format: { type: "json_object" }
    });

    let content = resp.choices[0].message.content.trim();
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    console.log('🤖 AI Suggestions:', content);

    const result = JSON.parse(content);
    
    if (!result.suggestions || !Array.isArray(result.suggestions)) {
      throw new Error('Invalid suggestion format from AI');
    }

    console.log('✅ AI Suggestions validated:', result.suggestions.length);

    return result.suggestions;

  } catch (err) {
    console.error('❌ AI Suggestion failed:', err.message);
    throw new Error('AI suggestion failed: ' + err.message);
  }
}

// Helper: Add IDs recursively
function addIdsToMindmap(node) {
  if (!node.id) {
    node.id = uuidv4();
  }
  
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => addIdsToMindmap(child));
  }
}
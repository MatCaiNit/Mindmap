import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
  }
});

// Generate mindmap from text
export async function generateMindmapFromText(text) {
  const prompt = `You are a mindmap generator. Given a topic, create a hierarchical mindmap structure.
  Topic: "${text}"
  
  REQUIREMENTS:
  - Return ONLY valid JSON
  - Structure: { "text": "root topic", "children": [{ "text": "child", "children": [] }] }
  - Max 3 levels deep, 3-5 main branches.`;

  try {
    // Gemini không có tách biệt "system" và "user" message trong hàm generateContent đơn giản
    // Ta có thể gộp vào prompt hoặc dùng systemInstruction khi khởi tạo model
    const result = await model.generateContent(prompt);
    const content = result.response.text();
    
    console.log(' Gemini Raw Response:', content);

    const mindmap = JSON.parse(content);
    
    if (!mindmap.text || !Array.isArray(mindmap.children)) {
      throw new Error('Invalid mindmap structure from AI');
    }

    addIdsToMindmap(mindmap);
    return mindmap;

  } catch (err) {
    console.error(' Gemini Generation failed:', err.message);
    throw new Error('AI generation failed: ' + err.message);
  }
}

// Suggest nodes based on context
export async function suggestNodeFromContext(context) {
  const { currentNode, parentNodes, siblings } = context;
  
  const prompt = `Generate 3-5 related child ideas for a mindmap node.
  Current node: "${currentNode}"
  Parent context: ${parentNodes?.join(' > ') || 'root'}
  Existing siblings: ${siblings?.join(', ') || 'none'}

  Return ONLY JSON: { "suggestions": [{"text": "idea1"}] }`;

  try {
    const result = await model.generateContent(prompt);
    const content = result.response.text();
    
    const data = JSON.parse(content);
    return data.suggestions || [];

  } catch (err) {
    console.error(' Gemini Suggestion failed:', err.message);
    throw new Error('AI suggestion failed: ' + err.message);
  }
}

function addIdsToMindmap(node) {
  if (!node.id) node.id = uuidv4();
  if (node.children) {
    node.children.forEach(child => addIdsToMindmap(child));
  }
}
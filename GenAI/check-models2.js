// check-generative-models.js
import dotenv from 'dotenv';
dotenv.config(); 

async function checkModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    const genModels = data.models.filter(m => 
      m.supportedGenerationMethods && 
      m.supportedGenerationMethods.includes("generateContent")
    );

    console.log("\nCÁC MODEL CHAT/GENERATE BẠN ĐƯỢC PHÉP DÙNG:");
    genModels.forEach(m => {
      console.log(`Tên chính xác: "${m.name.replace('models/', '')}"`);
    });
  } catch (error) {
    console.error("Lỗi:", error.message);
  }
}
checkModels();
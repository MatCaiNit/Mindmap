// D:\Mindmap\GenAI\check-models.js
import dotenv from 'dotenv';
dotenv.config(); // Đảm bảo trỏ đúng tới file .env của bạn

async function checkModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("Không tìm thấy GEMINI_API_KEY trong file .env!");
    return;
  }

  console.log("Đang hỏi Google xem API Key này được dùng model nào...");

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    if (data.error) {
      console.error("Google báo lỗi:", data.error.message);
      return;
    }

    // Lọc ra những model hỗ trợ tính năng "embedContent"
    const embedModels = data.models.filter(m => 
      m.supportedGenerationMethods && 
      m.supportedGenerationMethods.includes("embedContent")
    );

    console.log("\nCÁC MODEL EMBEDDING BẠN ĐƯỢC PHÉP DÙNG:");
    if (embedModels.length === 0) {
      console.log("KHÔNG CÓ! API Key của bạn không được cấp quyền dùng Embedding.");
    } else {
      embedModels.forEach(m => {
        console.log(`Tên model: "${m.name.replace('models/', '')}"`);
      });
    }

  } catch (error) {
    console.error("Lỗi mạng:", error.message);
  }
}

checkModels();
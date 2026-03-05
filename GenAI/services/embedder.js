import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Dùng model embedding mới và xịn nhất của Google (768 chiều)
const EMBED_MODEL = "gemini-embedding-001"; 
const BATCH_SIZE = 20;

export async function embedChunks(chunks) {
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const results = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    
    console.log(`Embedding batch ${i / BATCH_SIZE + 1} (${batch.length} chunks)...`);

    try {
      // CHIẾN THUẬT MỚI: Dùng Promise.all gọi embedContent cho từng text.
      // Cách này lách qua được sự lằng nhằng của hàm batchEmbedContents.
      const promises = batch.map(chunk => model.embedContent(chunk.text));
      
      const responses = await Promise.all(promises);

      responses.forEach((res, idx) => {
        results.push({
          ...batch[idx],
          embedding: res.embedding.values,
        });
      });

      // Tránh rate limit của gói Free (1500 request/phút)
      if (i + BATCH_SIZE < chunks.length) {
        await sleep(1000); 
      }
    } catch (error) {
      console.error("Embedding Error:", error.message);
      throw error;
    }
  }

  console.log(`Embedded ${results.length} chunks successfully`);
  return results;
}

export async function embedQuery(text) {
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
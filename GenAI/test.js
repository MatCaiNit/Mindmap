import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
// Cấu hình dotenv để đọc file .env ở thư mục gốc (nếu file .env nằm ở ngoài cùng)
dotenv.config({ path: '../.env' }); 

// Lưu ý: Kiểm tra lại các đường dẫn import này xem có đúng với cấu trúc thư mục của bạn không nhé
import { extractChunksFromPdf } from './services/pdfExtractor.js'; 
import { embedChunks, embedQuery } from './services/embedder.js';
import PdfChunk from './models/PDFChunk.js'; 
import { retrieveTopChunks } from './services/retriever.js';

async function runTest() {
  const mindmapId = "test-pipeline-123";
  const testPdfPath = "./test.pdf"; // Trỏ tới file PDF test của bạn

  console.log("🔌 Đang khởi động tiến trình test...");

  // 1. Cấu hình URI kết nối
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mindmap_test";
  
  // In ra URI để kiểm tra (đã che password nếu có)
  console.log("🔗 URI đang sử dụng:", uri.replace(/:([^:@]{3,})@/, ':***@')); 

  // 2. Thử kết nối Database độc lập
  try {
    console.log("⏳ Đang thử kết nối MongoDB (chờ tối đa 5 giây)...");
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ Đã kết nối MongoDB thành công!\n");
  } catch (dbError) {
    console.error("❌ LỖI KẾT NỐI DB:", dbError.message);
    console.log("👉 GỢI Ý SỬA LỖI:");
    console.log("  - Nếu dùng Local: Bật MongoDB Compass / khởi động service MongoDB.");
    console.log("  - Nếu dùng Atlas (Cloud): Kiểm tra lại Network Access (IP Whitelist) trên trang chủ MongoDB.");
    return; // 🛑 Dừng toàn bộ script ở đây, không chạy xuống dưới nữa
  }

  // 3. Chạy Pipeline (Chỉ chạy khi DB đã kết nối)
  try {
    await PdfChunk.deleteMany({ mindmapId });
    console.log("✅ Đã dọn dẹp dữ liệu test cũ.");

    console.log("\n--- BƯỚC 1: ĐỌC VÀ CHIA CHUNK PDF ---");
    const pdfBuffer = fs.readFileSync(testPdfPath);
    const chunks = await extractChunksFromPdf(pdfBuffer, "test.pdf");
    console.log(`✅ Trích xuất được ${chunks.length} chunks.`);

    if (chunks.length === 0) throw new Error("Không có chunk nào được tạo ra.");

    console.log("\n--- BƯỚC 2: TẠO EMBEDDING VỚI GEMINI ---");
    const embeddedChunks = await embedChunks(chunks);
    console.log(`✅ Tạo embedding thành công cho ${embeddedChunks.length} chunks.`);

    console.log("\n--- BƯỚC 3: LƯU VÀO DATABASE ---");
    const dbChunks = embeddedChunks.map(c => ({
      mindmapId,
      text: c.text,
      page: c.page,
      chunkIndex: c.chunkIndex,
      filename: c.filename,
      bbox: c.bbox,
      embedding: c.embedding
    }));
    await PdfChunk.insertMany(dbChunks);
    console.log(`✅ Đã lưu ${dbChunks.length} chunks vào MongoDB.`);

    console.log("\n--- BƯỚC 4: TEST TÌM KIẾM ---");
    const question = "Tình hình chiến sự"; 
    const topResults = await retrieveTopChunks(mindmapId, question, 3);
    
    console.log("\n🏆 KẾT QUẢ TÌM KIẾM (Top 3):");
    topResults.forEach((res, i) => {
      console.log(`[Hạng ${i + 1}] - Điểm: ${res.score.toFixed(4)} | Trang: ${res.page} | Text: ${res.text.substring(0, 100)}...`);
    });

  } catch (error) {
    console.error("\nTest Pipeline thất bại:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Đã ngắt kết nối DB.");
  }
}

runTest();
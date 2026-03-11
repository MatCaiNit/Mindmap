# ingest_pdf.py — CLI tool: đọc PDF → chunk → embed → lưu MongoDB
import os, sys, time
from pathlib import Path
from dotenv import load_dotenv
import pymongo

# IMPORT SDK MỚI
from google import genai
from google.genai import types

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────────────
MONGO_URI      = os.getenv("MONGO_URI", "mongodb://localhost:27017/mindmap")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
CHUNK_SIZE     = 400
OVERLAP        = 80
BATCH_SIZE     = 5

# ── Setup Google Embedding (SDK MỚI) ─────────────────────────────────────────
# Khởi tạo client thay vì dùng genai.configure
client = genai.Client(api_key=GEMINI_API_KEY)
EMBEDDING_MODEL = "gemini-embedding-001" # Sử dụng model mới nhất

def embed_batch(texts: list[str]) -> list[list[float]]:
    embeddings = []
    for text in texts:
        # Gọi API nhúng trực tiếp cho từng text chunk
        response = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT"
            )
        )
        embeddings.append(response.embeddings[0].values)
    return embeddings

def embed_single(text: str) -> list[float]:
    response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_DOCUMENT"
        )
    )
    return response.embeddings[0].values

# ── PDF Extract ──────────────────────────────────────────────────────────────
def extract_text(pdf_path: str) -> tuple[str, int]:
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
            return "\n\n".join(pages), len(pages)
    except Exception:
        import pypdf
        reader = pypdf.PdfReader(pdf_path)
        text   = "\n\n".join(p.extract_text() or "" for p in reader.pages)
        return text, len(reader.pages)

# ── Chunking ─────────────────────────────────────────────────────────────────
def chunk_text(text: str) -> list[str]:
    paragraphs = [p.strip() for p in text.replace("\r\n", "\n").split("\n\n") if len(p.strip()) > 20]
    chunks, current, size = [], "", 0
    for para in paragraphs:
        words = para.split()
        if size + len(words) > CHUNK_SIZE and current:
            chunks.append(current.strip())
            overlap_words = current.split()[-OVERLAP:]
            current = " ".join(overlap_words) + "\n\n" + para
            size = OVERLAP + len(words)
        else:
            current += ("\n\n" if current else "") + para
            size += len(words)
    if current.strip(): chunks.append(current.strip())
    return chunks

# ── Main ingest ───────────────────────────────────────────────────────────────
def ingest(pdf_path: str, mindmap_id: str):
    print(f"\n📄 PDF     : {pdf_path}")
    print(f"🗂  Mindmap : {mindmap_id}")
    print("─" * 50)

    print("📖 Extracting text...")
    text, pages = extract_text(pdf_path)
    print(f"   ✅ {len(text):,} chars | {pages} pages")

    chunks = chunk_text(text)
    print(f"   ✅ {len(chunks)} chunks")

    db_client = pymongo.MongoClient(MONGO_URI)
    col       = db_client["mindmap"]["pdfchunks"]
    col.delete_many({"mindmapId": mindmap_id})

    print(f"\n🔢 Embedding {len(chunks)} chunks...")
    docs = []
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        try:
            embeddings = embed_batch(batch)
            for j, (text_chunk, emb) in enumerate(zip(batch, embeddings)):
                docs.append({
                    "mindmapId": mindmap_id,
                    "text": text_chunk,
                    "embedding": emb, # Vector float[] trả về
                    "chunkIndex": i + j,
                    "metadata": {"filename": Path(pdf_path).name}
                })
            print(f"   [{min(i + BATCH_SIZE, len(chunks))}/{len(chunks)}] embedded", end="\r")
            time.sleep(1) # Rate limit
        except Exception as e:
            print(f"\n❌ Lỗi: {e}")
            break

    if docs:
        col.insert_many(docs)
        print(f"\n   ✅ Đã lưu {len(docs)} chunks vào MongoDB")
    
    db_client.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Sử dụng: python ingest_pdf.py <file.pdf> <id>")
        sys.exit(1)
    
    p_path = sys.argv[1]
    m_id = sys.argv[2] if len(sys.argv) > 2 else "test"
    
    if Path(p_path).exists():
        ingest(p_path, m_id)
    else:
        print("❌ File không tồn tại")
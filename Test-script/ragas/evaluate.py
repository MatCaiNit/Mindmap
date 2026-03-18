import json
import os
import sys
from tabulate import tabulate
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_recall
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from datasets import Dataset
from pypdf import PdfReader

# --- CẤU HÌNH ---
os.environ["GOOGLE_API_KEY"] = "AIzaSyAf30DzQVfohjTRiiBz0k_j5K3zcPtCYRQ"  # <--- THAY KEY CỦA BẠN
PDF_FILE = "baocao.pdf"
XMIND_FILE = "xmind_chunks.json"
RAG_FILE = "our_mindmap.json"

# --- LOGIC XỬ LÝ ---
def get_pdf_content(path):
    try:
        reader = PdfReader(path)
        return " ".join([page.extract_text() for page in reader.pages])
    except Exception as e:
        print(f"❌ Lỗi đọc PDF: {e}")
        sys.exit(1)

def flatten_xmind(path):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return ". ".join([s.replace(">", "->") for s in data])

def flatten_rag(path):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    def walk(node):
        txt = node.get("text", "")
        for c in node.get("children", []):
            txt += ". " + walk(c)
        return txt
    return walk(data.get("root", data))

def main():
    print("\n🔍 Đang đọc dữ liệu từ các file...")
    context = get_pdf_content(PDF_FILE)
    xmind_txt = flatten_xmind(XMIND_FILE)
    rag_txt = flatten_rag(RAG_FILE)

    data = {
        "question": ["Phân tích nội dung sơ đồ tư duy"] * 2,
        "answer": [xmind_txt, rag_txt],
        "contexts": [[context], [context]],
        "ground_truth": [context, context]
    }

    print("🤖 Đang gọi Gemini chấm điểm RAGAS (Vui lòng đợi 1-2 phút)...")
    
    llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash-lite-001")
    embeds = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    
    dataset = Dataset.from_dict(data)
    result = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy, context_recall],
        llm=llm,
        embeddings=embeds
    )

    # --- IN KẾT QUẢ RA CLI ---
    df = result.to_pandas()
    # Thêm cột tên để phân biệt
    df.insert(0, "Target", ["XMind (Benchmark)", "RAG (System)"])
    
    print("\n" + "="*70)
    print("📊 BẢNG SO SÁNH CHẤT LƯỢNG (RAGAS METRICS)")
    print("="*70)
    
    # Sử dụng tabulate để in bảng đẹp
    headers = ["Đối tượng", "Faithfulness", "Relevancy", "Recall"]
    table_data = df[["Target", "faithfulness", "answer_relevancy", "context_recall"]].values
    
    print(tabulate(table_data, headers=headers, tablefmt="fancy_grid", floatfmt=".4f"))

    # --- KẾT LUẬN NHANH ---
    rag_score = df.iloc[1]
    xmind_score = df.iloc[0]
    
    print("\n📝 NHẬN XÉT NHANH:")
    if rag_score['faithfulness'] > xmind_score['faithfulness']:
        print(f"✅ RAG có độ trung thực cao hơn XMind ({rag_score['faithfulness']:.2f} vs {xmind_score['faithfulness']:.2f})")
    if xmind_score['context_recall'] > rag_score['context_recall']:
        print(f"⚠️  XMind vẫn chi tiết hơn RAG (Recall: {xmind_score['context_recall']:.2f} vs {rag_score['context_recall']:.2f})")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()
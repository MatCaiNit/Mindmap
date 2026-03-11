"""
compare_xmind_vs_rag.py — So sánh RAGAS: Xmind JSON vs MongoDB RAG

Usage:
    python compare_xmind_vs_rag.py <mindmap_id> <xmind_file.json>
"""
import os, sys, json, time, argparse
import numpy as np
from pathlib import Path

import pymongo
from dotenv import load_dotenv
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import Faithfulness, AnswerRelevancy, ContextRecall, ContextPrecision
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

load_dotenv()
console = Console()

# ── Setup Models ─────────────────────────────────────────────────────────────
llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    google_api_key=os.getenv("GEMINI_API_KEY"),
    temperature=0,
)
embeddings_model = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001", 
    google_api_key=os.getenv("GEMINI_API_KEY"),
)

db = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/mindmap"))["mindmap"]
METRICS = [Faithfulness(), AnswerRelevancy(), ContextRecall(), ContextPrecision()]

# ── Vector Search Helper ─────────────────────────────────────────────────────
def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

def get_top_k_contexts(question: str, docs: list, top_k: int = 5) -> list[str]:
    """Tìm Top K chunks có độ tương đồng ngữ nghĩa cao nhất với câu hỏi"""
    q_emb = embeddings_model.embed_query(question)
    
    scored_docs = []
    for doc in docs:
        score = cosine_similarity(q_emb, doc["embedding"])
        scored_docs.append((score, doc["text"]))
        
    # Sắp xếp giảm dần theo điểm số
    scored_docs.sort(key=lambda x: x[0], reverse=True)
    return [text for score, text in scored_docs[:top_k]]

# ── Prepare Data Sources ─────────────────────────────────────────────────────
def prepare_mongodb_docs(mindmap_id: str):
    """Lấy toàn bộ chunks và vector từ MongoDB"""
    chunks = list(db["pdfchunks"].find({"mindmapId": mindmap_id}))
    return chunks

def prepare_xmind_docs(xmind_json_path: str):
    """Đọc file JSON Xmind và tạo vector embedding on-the-fly"""
    texts = json.loads(Path(xmind_json_path).read_text(encoding="utf-8"))
    console.print(f"🔄 Đang embedding {len(texts)} nhánh từ Xmind...")
    
    # Embedding toàn bộ mảng Xmind
    embs = embeddings_model.embed_documents(texts)
    docs = [{"text": text, "embedding": emb} for text, emb in zip(texts, embs)]
    return docs

# ── Generation & Evaluation ──────────────────────────────────────────────────
def evaluate_pipeline(docs: list, qa_pairs: list, label: str) -> dict:
    console.print(f"\n[bold cyan]🔍 Evaluating: {label}[/bold cyan]")
    
    if not docs:
        console.print(f"[red]❌ Không có dữ liệu để đánh giá![/red]")
        return {}

    questions, answers, contexts_list, ground_truths = [], [], [], []
    
    for i, qa in enumerate(qa_pairs):
        question = qa["question"]
        console.print(f"   [{i+1}/{len(qa_pairs)}] {question[:55]}...", end="\r")
        
        # 1. Retrieve
        contexts = get_top_k_contexts(question, docs, top_k=5)
        context_text = "\n\n".join(f"[Ngữ cảnh {j+1}]: {c}" for j, c in enumerate(contexts))
        
        # 2. Generate Answer
        prompt = f"Dựa vào thông tin sau:\n\n{context_text}\n\nHãy trả lời ngắn gọn, chính xác: {question}"
        response = llm.invoke(prompt)
        
        # Lưu trữ cho Ragas
        questions.append(question)
        answers.append(response.content)
        contexts_list.append(contexts)
        ground_truths.append(qa["ground_truth"])
        time.sleep(1) # Tránh rate limit của Langchain

    console.print(f"   ✅ Đã tạo xong {len(qa_pairs)} câu trả lời{' ' * 20}")

    dataset = Dataset.from_dict({
        "question": questions, "answer": answers,
        "contexts": contexts_list, "ground_truth": ground_truths,
    })

    result = evaluate(dataset=dataset, metrics=METRICS, llm=llm, embeddings=embeddings_model, raise_exceptions=False)
    
    scores = {k.name: float(result.get(k.name, 0) or 0) for k in METRICS}
    scores["overall"] = sum(scores.values()) / len(METRICS)
    scores["label"] = label
    return scores

def display_comparison(scores_a: dict, scores_b: dict):
    # Dùng lại bảng hiển thị từ code cũ của bạn
    table = Table(title="📊 Kết Quả So Sánh RAGAS: Xmind vs MongoDB RAG", show_header=True, header_style="bold")
    table.add_column("Metric", style="cyan", min_width=20)
    table.add_column(scores_a["label"], style="white", min_width=15, justify="center")
    table.add_column(scores_b["label"], style="white", min_width=15, justify="center")
    table.add_column("Winner", style="white", min_width=15, justify="center")

    metric_keys = list(scores_a.keys())
    metric_keys.remove("label")

    for k in metric_keys:
        a, b = scores_a.get(k, 0), scores_b.get(k, 0)
        
        if a > b + 0.01:
            winner = f"[green]✅ {scores_a['label']}[/green]"
        elif b > a + 0.01:
            winner = f"[green]✅ {scores_b['label']}[/green]"
        else:
            winner = "[dim]🤝 Draw[/dim]"

        table.add_row(k.capitalize(), f"{a:.3f}", f"{b:.3f}", winner)

    console.print("\n", table)

# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="So sánh RAGAS score giữa MongoDB RAG và Xmind JSON")
    parser.add_argument("mindmap_id", help="Mindmap ID trong MongoDB")
    parser.add_argument("xmind_file", help="Đường dẫn tới file JSON từ Xmind")
    args = parser.parse_args()

    # 1. Load Ground Truths
    if not Path("testset.json").exists():
        console.print("[red]❌ File testset.json không tồn tại. Vui lòng tạo tập câu hỏi trước.[/red]")
        sys.exit(1)
    qa_pairs = json.loads(Path("testset.json").read_text(encoding="utf-8"))

    # 2. Chuẩn bị dữ liệu
    console.print(Panel(f"Chuẩn bị nguồn dữ liệu cho {len(qa_pairs)} câu hỏi", style="blue"))
    rag_docs = prepare_mongodb_docs(args.mindmap_id)
    xmind_docs = prepare_xmind_docs(args.xmind_file)

    # 3. Chạy đánh giá
    scores_rag = evaluate_pipeline(rag_docs, qa_pairs, label="MongoDB RAG")
    scores_xmind = evaluate_pipeline(xmind_docs, qa_pairs, label="Xmind Mindmap")

    # 4. In kết quả
    display_comparison(scores_rag, scores_xmind)
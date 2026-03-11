"""
compare_mindmaps.py — So sánh RAGAS score của 2 mindmaps cùng 1 PDF

Usage:
    python compare_mindmaps.py <mindmap_id_1> <mindmap_id_2>
    python compare_mindmaps.py <mindmap_id_1> <mindmap_id_2> --label1 "Mindmap A" --label2 "Mindmap B"
"""
import os, sys, json, time, argparse
from pathlib import Path
from datetime import datetime

import pymongo
from dotenv import load_dotenv
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (
    Faithfulness,
    AnswerRelevancy,
    ContextRecall,
    ContextPrecision,
)
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

load_dotenv()
console = Console()

# ── Setup ────────────────────────────────────────────────────────────────────
llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    google_api_key=os.getenv("GEMINI_API_KEY"),
    temperature=0,
)
embeddings_model = GoogleGenerativeAIEmbeddings(
    model="models/text-embedding-004",
    google_api_key=os.getenv("GEMINI_API_KEY"),
)
db = pymongo.MongoClient(
    os.getenv("MONGO_URI", "mongodb://localhost:27017/mindmap")
)["mindmap"]

METRICS = [Faithfulness(), AnswerRelevancy(), ContextRecall(), ContextPrecision()]
METRIC_KEYS = ["faithfulness", "answer_relevancy", "context_recall", "context_precision"]
THRESHOLDS = {"faithfulness": 0.8, "answer_relevancy": 0.7, "context_recall": 0.7, "context_precision": 0.6}


def get_chunks(mindmap_id: str, top_k: int = 5) -> list[str]:
    chunks = list(
        db["pdfchunks"]
        .find({"mindmapId": mindmap_id})
        .sort("chunkIndex", 1)
        .limit(top_k)
    )
    return [c["text"] for c in chunks]


def generate_answer(question: str, mindmap_id: str) -> tuple[str, list[str]]:
    contexts = get_chunks(mindmap_id, top_k=5)
    if not contexts:
        return "Không tìm thấy thông tin.", []
    context_text = "\n\n".join(f"[Đoạn {i+1}]: {c}" for i, c in enumerate(contexts))
    response = llm.invoke(
        f"Dựa vào:\n\n{context_text}\n\nTrả lời ngắn gọn, chính xác: {question}"
    )
    return response.content, contexts


def evaluate_mindmap(mindmap_id: str, qa_pairs: list, label: str) -> dict:
    console.print(f"\n[bold cyan]🔍 Evaluating: {label} ({mindmap_id})[/bold cyan]")

    chunk_count = db["pdfchunks"].count_documents({"mindmapId": mindmap_id})
    if chunk_count == 0:
        console.print(f"[red]❌ Không có chunks! Chạy ingest_pdf.py trước.[/red]")
        return {}

    console.print(f"   📚 {chunk_count} chunks trong DB")

    questions, answers, contexts_list, ground_truths = [], [], [], []
    for i, qa in enumerate(qa_pairs):
        console.print(f"   [{i+1}/{len(qa_pairs)}] {qa['question'][:55]}...", end="\r")
        answer, contexts = generate_answer(qa["question"], mindmap_id)
        questions.append(qa["question"])
        answers.append(answer)
        contexts_list.append(contexts)
        ground_truths.append(qa["ground_truth"])
        time.sleep(0.8)  # rate limit

    console.print(f"   ✅ Generated {len(qa_pairs)} answers{' ' * 20}")

    dataset = Dataset.from_dict({
        "question": questions, "answer": answers,
        "contexts": contexts_list, "ground_truth": ground_truths,
    })

    result = evaluate(
        dataset=dataset,
        metrics=METRICS,
        llm=llm,
        embeddings=embeddings_model,
        raise_exceptions=False,
    )

    scores = {k: float(result.get(k, 0) or 0) for k in METRIC_KEYS}
    scores["overall"] = sum(scores.values()) / len(METRIC_KEYS)
    scores["label"] = label
    scores["mindmap_id"] = mindmap_id
    scores["chunk_count"] = chunk_count
    return scores


def display_comparison(scores_a: dict, scores_b: dict):
    """Bảng so sánh 2 mindmaps"""
    label_a = scores_a["label"]
    label_b = scores_b["label"]

    # ── Bảng so sánh chi tiết ────────────────────────────────────────────
    table = Table(title="📊 So Sánh RAGAS Score", show_header=True, header_style="bold")
    table.add_column("Metric",         style="cyan",  min_width=20)
    table.add_column(label_a,          style="white", min_width=12, justify="center")
    table.add_column(label_b,          style="white", min_width=12, justify="center")
    table.add_column("Winner",         style="white", min_width=12, justify="center")
    table.add_column("Ý nghĩa",        style="dim",   min_width=30)

    meanings = {
        "faithfulness":      "AI có bịa thông tin không?",
        "answer_relevancy":  "Câu trả lời đúng chủ đề?",
        "context_recall":    "Chunks có đủ thông tin?",
        "context_precision": "Chunks retrieve chính xác?",
        "overall":           "Trung bình tổng hợp",
    }

    for k in METRIC_KEYS + ["overall"]:
        a = scores_a.get(k, 0)
        b = scores_b.get(k, 0)
        threshold = THRESHOLDS.get(k, 0.7)

        def fmt(v):
            color = "green" if v >= threshold + 0.1 else "yellow" if v >= threshold else "red"
            return f"[{color}]{v:.3f}[/{color}]"

        if a > b + 0.01:
            winner = f"[green]✅ {label_a}[/green]"
        elif b > a + 0.01:
            winner = f"[green]✅ {label_b}[/green]"
        else:
            winner = "[dim]🤝 Draw[/dim]"

        table.add_row(k, fmt(a), fmt(b), winner, meanings.get(k, ""))

    console.print("\n", table)

    # ── Summary panel ────────────────────────────────────────────────────
    a_overall = scores_a.get("overall", 0)
    b_overall = scores_b.get("overall", 0)
    diff = abs(a_overall - b_overall)

    if diff < 0.01:
        verdict = "🤝 Hai mindmap có chất lượng tương đương"
        color = "yellow"
    elif a_overall > b_overall:
        verdict = f"🏆 {label_a} tốt hơn (+{diff:.3f})"
        color = "green"
    else:
        verdict = f"🏆 {label_b} tốt hơn (+{diff:.3f})"
        color = "green"

    console.print(Panel(
        f"[{color}][bold]{verdict}[/bold][/{color}]\n\n"
        f"  {label_a}: {a_overall:.3f} ({scores_a['chunk_count']} chunks)\n"
        f"  {label_b}: {b_overall:.3f} ({scores_b['chunk_count']} chunks)",
        title="🎯 Kết Quả So Sánh"
    ))

    # ── Gợi ý cải thiện ──────────────────────────────────────────────────
    worst = min(METRIC_KEYS, key=lambda k: min(scores_a.get(k, 1), scores_b.get(k, 1)))
    suggestions = {
        "faithfulness":      "Tăng topK chunks, thêm instruction 'chỉ dùng thông tin trong context'",
        "answer_relevancy":  "Sửa system prompt, hướng AI trả lời đúng câu hỏi hơn",
        "context_recall":    "Giảm chunkSize (400→250), tăng overlap (80→120)",
        "context_precision": "Tăng chất lượng embedding, lọc chunk irrelevant trước khi retrieve",
    }
    console.print(f"\n[bold]💡 Điểm cần cải thiện nhất ({worst}):[/bold]")
    console.print(f"   → {suggestions.get(worst, 'Xem xét lại toàn bộ pipeline')}")


def save_comparison(scores_a: dict, scores_b: dict):
    Path("results").mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report = {
        "timestamp": ts,
        "comparison": [scores_a, scores_b],
        "winner": scores_a["label"] if scores_a["overall"] >= scores_b["overall"] else scores_b["label"],
    }
    path = Path(f"results/compare_{ts}.json")
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    console.print(f"\n[green]💾 Saved: {path}[/green]")


# ── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="So sánh RAGAS score 2 mindmaps")
    parser.add_argument("id1",    help="Mindmap ID 1")
    parser.add_argument("id2",    help="Mindmap ID 2")
    parser.add_argument("--label1", default="Mindmap A", help="Tên hiển thị mindmap 1")
    parser.add_argument("--label2", default="Mindmap B", help="Tên hiển thị mindmap 2")
    args = parser.parse_args()

    if not Path("testset.json").exists():
        console.print("[red]❌ testset.json không tồn tại. Chạy prepare_testset.py trước.[/red]")
        sys.exit(1)

    qa_pairs = json.loads(Path("testset.json").read_text(encoding="utf-8"))
    console.print(Panel(
        f"[bold]So sánh 2 mindmaps với {len(qa_pairs)} câu hỏi[/bold]\n"
        f"  {args.label1}: {args.id1}\n"
        f"  {args.label2}: {args.id2}",
        title="🆚 RAGAS Comparison"
    ))

    scores_a = evaluate_mindmap(args.id1, qa_pairs, args.label1)
    scores_b = evaluate_mindmap(args.id2, qa_pairs, args.label2)

    if scores_a and scores_b:
        display_comparison(scores_a, scores_b)
        save_comparison(scores_a, scores_b)
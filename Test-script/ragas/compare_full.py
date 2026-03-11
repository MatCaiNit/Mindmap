"""
compare_full.py — So sánh App RAG vs XMind/MindMeister

Usage:
    python compare_full.py --rag-id <mindmap_id> --xmind-chunks xmind_chunks.json
"""
import os, sys, json, time, argparse
from pathlib import Path
from datetime import datetime

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

METRIC_KEYS = ["faithfulness", "answer_relevancy", "context_recall", "context_precision"]
THRESHOLDS  = {"faithfulness": 0.8, "answer_relevancy": 0.7,
               "context_recall": 0.7, "context_precision": 0.6}


def get_rag_chunks(mindmap_id: str, top_k: int = 5) -> list:
    docs = list(db["pdfchunks"].find({"mindmapId": mindmap_id}).sort("chunkIndex", 1).limit(top_k))
    return [d["text"] for d in docs]


def generate_answer(question: str, contexts: list) -> str:
    if not contexts:
        return "Không tìm thấy thông tin."
    ctx  = "\n\n".join(f"[{i+1}]: {c}" for i, c in enumerate(contexts))
    resp = llm.invoke(f"Dựa vào:\n\n{ctx}\n\nTrả lời ngắn gọn, chính xác: {question}")
    return resp.content


def run_ragas(questions, answers, contexts_list, ground_truths, label):
    console.print(f"\n[cyan]Running RAGAS metrics for: {label}...[/cyan]")
    dataset = Dataset.from_dict({
        "question": questions, "answer": answers,
        "contexts": contexts_list, "ground_truth": ground_truths,
    })
    result = evaluate(
        dataset=dataset,
        metrics=[Faithfulness(), AnswerRelevancy(), ContextRecall(), ContextPrecision()],
        llm=llm, embeddings=embeddings_model, raise_exceptions=False,
    )
    scores = {k: float(result.get(k, 0) or 0) for k in METRIC_KEYS}
    scores["overall"] = sum(scores.values()) / len(METRIC_KEYS)
    return scores


def evaluate_source(label, get_context_fn, qa_pairs):
    console.print(f"\n[bold yellow]═══ Evaluating: {label} ═══[/bold yellow]")
    questions, answers, contexts_list, ground_truths = [], [], [], []
    for i, qa in enumerate(qa_pairs):
        console.print(f"  [{i+1}/{len(qa_pairs)}] {qa['question'][:55]}...", end="\r")
        contexts = get_context_fn(qa["question"])
        answer   = generate_answer(qa["question"], contexts)
        questions.append(qa["question"])
        answers.append(answer)
        contexts_list.append(contexts)
        ground_truths.append(qa["ground_truth"])
        time.sleep(0.8)
    console.print(f"  ✅ Done {len(qa_pairs)} questions{' '*30}")
    return run_ragas(questions, answers, contexts_list, ground_truths, label)


def display_comparison(scores_rag, scores_xmind, label_rag, label_xmind):
    table = Table(title="📊 RAG App vs XMind/MindMeister", header_style="bold")
    table.add_column("Metric",       style="cyan",  min_width=22)
    table.add_column(label_rag,      style="white", min_width=14, justify="center")
    table.add_column(label_xmind,    style="white", min_width=14, justify="center")
    table.add_column("Winner",       style="white", min_width=16, justify="center")
    table.add_column("Ý nghĩa",      style="dim",   min_width=28)

    meanings = {
        "faithfulness":      "AI có bịa thông tin không?",
        "answer_relevancy":  "Trả lời đúng chủ đề?",
        "context_recall":    "Context đủ thông tin?",
        "context_precision": "Context ít nhiễu?",
        "overall":           "Trung bình tổng hợp",
    }

    for k in METRIC_KEYS + ["overall"]:
        a = scores_rag.get(k, 0)
        b = scores_xmind.get(k, 0)
        t = THRESHOLDS.get(k, 0.7)

        def fmt(v):
            c = "green" if v >= t + 0.1 else "yellow" if v >= t else "red"
            return f"[{c}]{v:.3f}[/{c}]"

        diff   = abs(a - b)
        winner = (f"[green]✅ {label_rag}[/green]"   if a > b + 0.01 else
                  f"[green]✅ {label_xmind}[/green]" if b > a + 0.01 else
                  "[dim]🤝 Draw[/dim]")

        table.add_row(k, fmt(a), fmt(b), winner, meanings.get(k, ""))

    console.print("\n", table)

    a_ov = scores_rag["overall"]
    b_ov = scores_xmind["overall"]
    diff = abs(a_ov - b_ov)

    if diff < 0.02:
        verdict = "🤝 Hai nguồn có chất lượng tương đương"
        color   = "yellow"
    elif a_ov > b_ov:
        verdict = f"🏆 {label_rag} (RAG app) tốt hơn +{diff:.3f}"
        color   = "green"
    else:
        verdict = f"🏆 {label_xmind} tốt hơn +{diff:.3f}"
        color   = "yellow"

    console.print(Panel(
        f"[{color}][bold]{verdict}[/bold][/{color}]\n\n"
        f"  {label_rag}   : {a_ov:.3f}\n"
        f"  {label_xmind} : {b_ov:.3f}\n\n"
        f"  [dim]context_recall thấp → thiếu nội dung PDF\n"
        f"  context_precision thấp → nhiều noise trong context[/dim]",
        title="🎯 Kết Quả"
    ))

    # Phân tích thêm
    if scores_xmind["context_recall"] < scores_rag["context_recall"]:
        console.print("\n[dim]💡 XMind context_recall thấp hơn → mindmap đó bỏ sót nhiều thông tin trong PDF[/dim]")
    if scores_xmind["context_precision"] < scores_rag["context_precision"]:
        console.print("[dim]💡 XMind context_precision thấp hơn → các branch/node ít liên quan đến câu hỏi[/dim]")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rag-id",        required=True,  help="Mindmap ID trong MongoDB")
    parser.add_argument("--xmind-chunks",  required=True,  help="Path tới xmind_chunks.json")
    parser.add_argument("--label-rag",     default="RAG App",    help="Tên app của bạn")
    parser.add_argument("--label-xmind",   default="XMind",      help="Tên app kia")
    parser.add_argument("--testset",       default="testset.json")
    args = parser.parse_args()

    # Load testset
    if not Path(args.testset).exists():
        console.print(f"[red]❌ {args.testset} không tồn tại. Chạy prepare_testset.py trước.[/red]")
        sys.exit(1)
    qa_pairs = json.loads(Path(args.testset).read_text(encoding="utf-8"))

    # Load XMind chunks
    if not Path(args.xmind_chunks).exists():
        console.print(f"[red]❌ {args.xmind_chunks} không tồn tại. Chạy parse_mindmap_image.py trước.[/red]")
        sys.exit(1)
    xmind_chunks = json.loads(Path(args.xmind_chunks).read_text(encoding="utf-8"))
    console.print(f"📦 XMind chunks: {len(xmind_chunks)}")

    # Check RAG chunks
    rag_count = db["pdfchunks"].count_documents({"mindmapId": args.rag_id})
    if rag_count == 0:
        console.print(f"[red]❌ Không có RAG chunks cho mindmap {args.rag_id}. Chạy ingest_pdf.py trước.[/red]")
        sys.exit(1)
    console.print(f"📦 RAG chunks: {rag_count}")

    console.print(Panel(
        f"[bold]So sánh: {args.label_rag} vs {args.label_xmind}[/bold]\n"
        f"  Testset: {len(qa_pairs)} câu hỏi\n"
        f"  RAG chunks: {rag_count}  |  XMind chunks: {len(xmind_chunks)}",
        title="🆚 Comparison Start"
    ))

    # Evaluate RAG app
    scores_rag = evaluate_source(
        label=args.label_rag,
        get_context_fn=lambda q: get_rag_chunks(args.rag_id, top_k=5),
        qa_pairs=qa_pairs,
    )

    # Evaluate XMind (dùng tất cả chunks từ mindmap)
    scores_xmind = evaluate_source(
        label=args.label_xmind,
        get_context_fn=lambda q: xmind_chunks[:5],  # lấy 5 branches đầu làm context
        qa_pairs=qa_pairs,
    )

    display_comparison(scores_rag, scores_xmind, args.label_rag, args.label_xmind)

    # Save report
    Path("results").mkdir(exist_ok=True)
    ts     = datetime.now().strftime("%Y%m%d_%H%M%S")
    report = {
        "timestamp": ts,
        args.label_rag:   scores_rag,
        args.label_xmind: scores_xmind,
    }
    out = Path(f"results/compare_{ts}.json")
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    console.print(f"\n[green]💾 Report: {out}[/green]")
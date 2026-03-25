"""
compare_mindmaps.py
===================
So sánh định lượng Mindmap vs XMind AI từ PDF.

Cài đặt:
    pip install sentence-transformers pymupdf numpy pandas google-genai rich openpyxl

Chạy:
    python compare_mindmaps.py --pdf baocao.pdf --my our_mindmap.json --xmind xmind_chunks.json --gemini-key AIza...

Không có Gemini / bị rate limit:
    python compare_mindmaps.py ... --local-gt
"""

import os, sys, json, re, argparse, time
from pathlib import Path

# ── Rich ──────────────────────────────────────────────────────────────────────
try:
    from rich.console import Console
    from rich.table import Table
except ImportError:
    print("pip install rich"); sys.exit(1)

console = Console()

# ── Deps ──────────────────────────────────────────────────────────────────────
try:
    import numpy as np
except ImportError:
    console.print("[red]pip install numpy[/red]"); sys.exit(1)

try:
    import pandas as pd
except ImportError:
    console.print("[red]pip install pandas openpyxl[/red]"); sys.exit(1)

try:
    import fitz
except ImportError:
    console.print("[red]pip install pymupdf[/red]"); sys.exit(1)

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    console.print("[red]pip install google-genai[/red]"); sys.exit(1)

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    console.print("[red]pip install sentence-transformers[/red]"); sys.exit(1)


# ════════════════════════════════════════════════════════════════════════════════
# 1. PDF
# ════════════════════════════════════════════════════════════════════════════════

def extract_pdf_text(path: str) -> tuple[str, int]:
    doc   = fitz.open(path)
    pages = [p.get_text("text").strip() for p in doc if p.get_text("text").strip()]
    doc.close()
    full  = "\n\n".join(pages)
    console.print(f"  [cyan]PDF:[/cyan] {len(pages)} trang, {len(full):,} ký tự")
    return full, len(pages)


# ════════════════════════════════════════════════════════════════════════════════
# 2. Ground Truth
# ════════════════════════════════════════════════════════════════════════════════

GT_PROMPT = """\
Đọc nội dung sau và trích xuất Atomic Facts (sự thật nguyên tử).
Mỗi fact: một thông tin đơn lẻ, cụ thể (tên, số liệu, khái niệm, kết quả).

Trả về JSON DUY NHẤT (không markdown, không backtick):
{{"facts": ["fact 1", "fact 2", ...]}}

Nội dung:
{text}
"""

def _dedup(lst: list[str]) -> list[str]:
    seen, out = set(), []
    for x in lst:
        k = x.strip().lower()
        if k and k not in seen:
            seen.add(k); out.append(x.strip())
    return out

def generate_ground_truth_gemini(text: str, api_key: str, max_chars=28000) -> list[str]:
    client = genai.Client(api_key=api_key)
    console.print("  [yellow]Gọi Gemini…[/yellow]")
    for attempt in range(3):
        try:
            resp = client.models.generate_content(
                model="gemma-3-4b-it",
                contents=GT_PROMPT.format(text=text[:max_chars]),
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                    max_output_tokens=8192,
                ),
            )
            raw   = re.sub(r"```json|```", "", resp.text.strip()).strip()
            facts = _dedup(json.loads(raw).get("facts", []))
            console.print(f"  [green]✓ Gemini GT: {len(facts)} facts[/green]")
            return facts
        except Exception as e:
            msg = str(e)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                wait = 60 * (attempt + 1)
                console.print(f"  [red]Rate limit — chờ {wait}s…[/red]")
                time.sleep(wait)
            else:
                console.print(f"  [red]Gemini lỗi: {e}[/red]")
                break
    console.print("  [yellow]Fallback → local extraction[/yellow]")
    return generate_ground_truth_local(text)

def generate_ground_truth_local(text: str) -> list[str]:
    sentences = re.split(r'(?<=[.!?])\s+|\n{2,}', text)
    facts = [s.strip() for s in sentences
             if 25 <= len(s.strip()) <= 220
             and re.search(r'[a-zA-ZÀ-ỹ]{4,}', s)]
    facts = _dedup(facts)
    console.print(f"  [green]✓ Local GT: {len(facts)} facts[/green]")
    return facts


# ════════════════════════════════════════════════════════════════════════════════
# 3. Loaders
# ════════════════════════════════════════════════════════════════════════════════

def load_my_mindmap(path: str) -> list[str]:
    data  = json.loads(Path(path).read_text(encoding="utf-8"))
    nodes = []

    if "flatNodes" in data:
        for n in data["flatNodes"]:
            t = (n.get("text") or "").strip()
            if len(t) > 3: nodes.append(t)
        console.print(f"  [cyan]My (flatNodes):[/cyan] {len(nodes)}")
        return nodes

    def walk(node, path=""):
        label = (node.get("text") or node.get("label") or "").strip()
        cur   = f"{path} > {label}".lstrip(" > ") if path else label
        if len(label) > 3: nodes.append(cur)
        for c in node.get("children", []): walk(c, cur)

    walk(data.get("root", data))
    console.print(f"  [cyan]My (tree):[/cyan] {len(nodes)}")
    return nodes

def load_xmind(path: str) -> list[str]:
    raw = Path(path).read_text(encoding="utf-8").strip()
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            out = []
            for item in data:
                item = str(item).strip()
                if ": " in item:
                    head, tail = item.split(": ", 1)
                    parts = [p.strip() for p in tail.split(",") if p.strip()]
                    out += [f"{head} > {p}" for p in parts] if len(parts) > 1 else [item]
                else:
                    out.append(item)
            console.print(f"  [cyan]XMind (JSON):[/cyan] {len(out)}")
            return out
    except json.JSONDecodeError:
        pass
    lines = [l.strip() for l in raw.splitlines() if l.strip()]
    console.print(f"  [cyan]XMind (text):[/cyan] {len(lines)}")
    return lines


# ════════════════════════════════════════════════════════════════════════════════
# 4. Embeddings
# ════════════════════════════════════════════════════════════════════════════════

def embed(model, texts):
    return np.array(
        model.encode(texts, batch_size=64, show_progress_bar=False,
                     normalize_embeddings=True),
        dtype=np.float32
    )

def sim(A, B):
    return A @ B.T   # cosine (vectors normalized)


# ════════════════════════════════════════════════════════════════════════════════
# 5. Metrics
# ════════════════════════════════════════════════════════════════════════════════

def compute(gt_t, my_t, xm_t, gt_v, my_v, xm_v, thr):
    # Recall
    best_my = sim(gt_v, my_v).max(axis=1)
    best_xm = sim(gt_v, xm_v).max(axis=1)
    rec_my  = float((best_my >= thr).mean())
    rec_xm  = float((best_xm >= thr).mean())

    # Precision
    pmy = sim(my_v, gt_v).max(axis=1)
    pxm = sim(xm_v, gt_v).max(axis=1)
    pr_my = float((pmy >= thr).mean())
    pr_xm = float((pxm >= thr).mean())

    f1_my = 2*pr_my*rec_my / (pr_my+rec_my+1e-10)
    f1_xm = 2*pr_xm*rec_xm / (pr_xm+rec_xm+1e-10)

    cov_my = {i for i,s in enumerate(best_my) if s >= thr}
    cov_xm = {i for i,s in enumerate(best_xm) if s >= thr}

    return dict(
        recall_my=rec_my, recall_xm=rec_xm,
        prec_my=pr_my,    prec_xm=pr_xm,
        f1_my=f1_my,      f1_xm=f1_xm,
        dens_my=float(best_my.mean()), dens_xm=float(best_xm.mean()),
        n_my=len(my_t), n_xm=len(xm_t), n_gt=len(gt_t),
        only_my  =[gt_t[i] for i in cov_my - cov_xm],
        only_xm  =[gt_t[i] for i in cov_xm - cov_my],
        both     =[gt_t[i] for i in cov_my & cov_xm],
        hall_my  =[(my_t[i], float(s)) for i,s in enumerate(pmy) if s < thr],
        hall_xm  =[(xm_t[i], float(s)) for i,s in enumerate(pxm) if s < thr],
        missed   =[gt_t[i] for i in range(len(gt_t))
                   if i not in cov_my and i not in cov_xm],
    )


# ════════════════════════════════════════════════════════════════════════════════
# 6. Report
# ════════════════════════════════════════════════════════════════════════════════

def bar(v, w=20):
    return f"{'█'*int(v*w)}{'░'*(w-int(v*w))} {v*100:5.1f}%"

def win(a, b):
    if abs(a-b) < 0.01: return "[yellow]Tie[/yellow]"
    return "[green]Bạn ▲[/green]" if a > b else "[red]XMind ▲[/red]"

def print_report(m, pages):
    console.print()
    console.rule("[bold cyan]📊 MINDMAP COMPARISON REPORT[/bold cyan]")

    t = Table(show_header=True, header_style="bold white on blue", box=None, pad_edge=True)
    for col, w in [("Tiêu chí",26),("Của bạn",26),("XMind AI",26),("Thắng",12)]:
        t.add_column(col, justify="center" if col!="Tiêu chí" else "left", width=w)
    for label, mv, xv in [
        ("Recall  (Độ bao phủ)",     m["recall_my"], m["recall_xm"]),
        ("Precision (Độ chính xác)", m["prec_my"],   m["prec_xm"]),
        ("F1 Score",                 m["f1_my"],     m["f1_xm"]),
        ("Info Density",             m["dens_my"],   m["dens_xm"]),
    ]:
        t.add_row(label, bar(mv), bar(xv), win(mv, xv))
    console.print(t)

    console.print()
    s = Table(show_header=False, box=None, pad_edge=True)
    s.add_column(width=30); s.add_column(width=12); s.add_column(width=12)
    s.add_row("[bold]Nodes[/bold]",       f"[cyan]{m['n_my']}[/cyan]", f"[cyan]{m['n_xm']}[/cyan]")
    s.add_row("[bold]GT facts[/bold]",    f"[yellow]{m['n_gt']}[/yellow]", "—")
    s.add_row("[bold]Trang PDF[/bold]",   f"[yellow]{pages}[/yellow]", "—")
    s.add_row("[bold]Nodes/trang[/bold]", f"{m['n_my']/max(pages,1):.1f}", f"{m['n_xm']/max(pages,1):.1f}")
    console.print(s)

    console.print(); console.rule("[bold]🔍 Unique Content[/bold]")
    console.print(f"\n[green]✅ Chỉ Bạn có ({len(m['only_my'])}):[/green]")
    for f in m["only_my"][:8]: console.print(f"  • {f}")
    if len(m["only_my"]) > 8: console.print(f"  … {len(m['only_my'])-8} nữa")

    console.print(f"\n[yellow]⚡ Chỉ XMind có ({len(m['only_xm'])}):[/yellow]")
    for f in m["only_xm"][:8]: console.print(f"  • {f}")
    if len(m["only_xm"]) > 8: console.print(f"  … {len(m['only_xm'])-8} nữa")

    console.print(f"\n[cyan]🤝 Cả hai: {len(m['both'])} facts[/cyan]")

    console.print(); console.rule("[bold]🚨 Hallucination[/bold]")
    console.print(f"\n[red]Bạn: {len(m['hall_my'])} nodes nghi ngờ[/red]")
    for txt, sc in sorted(m["hall_my"], key=lambda x: x[1])[:5]:
        console.print(f"  [{sc:.2f}] {txt[:90]}")
    console.print(f"\n[red]XMind: {len(m['hall_xm'])} nodes nghi ngờ[/red]")
    for txt, sc in sorted(m["hall_xm"], key=lambda x: x[1])[:5]:
        console.print(f"  [{sc:.2f}] {txt[:90]}")

    if m["missed"]:
        console.print(f"\n[magenta]❌ Bỏ sót bởi cả hai ({len(m['missed'])}):[/magenta]")
        for f in m["missed"][:5]: console.print(f"  • {f}")

    console.print(); console.rule("[bold]🏆 VERDICT[/bold]")
    avg_my = (m["recall_my"] + m["prec_my"] + m["f1_my"]) / 3
    avg_xm = (m["recall_xm"] + m["prec_xm"] + m["f1_xm"]) / 3
    if avg_my > avg_xm + 0.03:
        v = "[bold green]🎉 Mindmap BẠN tốt hơn XMind AI![/bold green]"
    elif avg_xm > avg_my + 0.03:
        v = "[bold red]📉 XMind AI tốt hơn Mindmap của bạn[/bold red]"
    else:
        v = "[bold yellow]🤝 Hai mindmap tương đương[/bold yellow]"
    console.print(f"\n  Bạn: {avg_my:.3f}  |  XMind: {avg_xm:.3f}")
    console.print(f"\n  {v}\n")


def save_outputs(m, csv_path):
    rows = [
        {"metric":"recall",    "my":m["recall_my"], "xmind":m["recall_xm"]},
        {"metric":"precision", "my":m["prec_my"],   "xmind":m["prec_xm"]},
        {"metric":"f1",        "my":m["f1_my"],     "xmind":m["f1_xm"]},
        {"metric":"density",   "my":m["dens_my"],   "xmind":m["dens_xm"]},
        {"metric":"node_count","my":m["n_my"],       "xmind":m["n_xm"]},
    ]
    pd.DataFrame(rows).to_csv(csv_path, index=False)
    console.print(f"  [green]💾 {csv_path}[/green]")

    xlsx = csv_path.replace(".csv", ".xlsx")
    with pd.ExcelWriter(xlsx, engine="openpyxl") as wr:
        pd.DataFrame(rows).to_excel(wr, sheet_name="Summary", index=False)
        pd.DataFrame({
            "only_my":    pd.Series(m["only_my"]),
            "only_xmind": pd.Series(m["only_xm"]),
            "both":       pd.Series(m["both"]),
        }).to_excel(wr, sheet_name="UniqueContent", index=False)
        pd.DataFrame({
            "halluc_my_node":    pd.Series([x[0] for x in m["hall_my"]]),
            "halluc_my_score":   pd.Series([x[1] for x in m["hall_my"]]),
            "halluc_xmind_node": pd.Series([x[0] for x in m["hall_xm"]]),
            "halluc_xmind_score":pd.Series([x[1] for x in m["hall_xm"]]),
        }).to_excel(wr, sheet_name="Hallucination", index=False)
    console.print(f"  [green]💾 {xlsx}[/green]")

    md = "\n".join([
        "# Mindmap Comparison Report\n",
        "| Metric | My | XMind |",
        "|--------|----|-------|",
        f"| Recall | {m['recall_my']:.3f} | {m['recall_xm']:.3f} |",
        f"| Precision | {m['prec_my']:.3f} | {m['prec_xm']:.3f} |",
        f"| F1 | {m['f1_my']:.3f} | {m['f1_xm']:.3f} |",
        f"| Density | {m['dens_my']:.3f} | {m['dens_xm']:.3f} |",
        f"\n- Chỉ Bạn: {len(m['only_my'])}  |  Chỉ XMind: {len(m['only_xm'])}  |  Cả hai: {len(m['both'])}",
    ])
    md_path = csv_path.replace(".csv", ".md")
    Path(md_path).write_text(md, encoding="utf-8")
    console.print(f"  [green]💾 {md_path}[/green]")


# ════════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf",        required=True)
    ap.add_argument("--my",         required=True)
    ap.add_argument("--xmind",      required=True)
    ap.add_argument("--gemini-key", default=os.getenv("GEMINI_API_KEY"))
    ap.add_argument("--threshold",  type=float, default=0.72)
    ap.add_argument("--gt-cache",   default="gt_cache.json")
    ap.add_argument("--output",     default="comparison_report.csv")
    ap.add_argument("--model",      default="all-MiniLM-L6-v2")
    ap.add_argument("--local-gt",   action="store_true",
                    help="Bỏ Gemini, dùng local extraction (không cần API)")
    args = ap.parse_args()

    console.rule("[bold cyan]MINDMAP COMPARISON PIPELINE[/bold cyan]")

    console.print("\n[bold]1. Đọc PDF[/bold]")
    pdf_text, pages = extract_pdf_text(args.pdf)

    console.print("\n[bold]2. Ground Truth[/bold]")
    cache = Path(args.gt_cache)
    if cache.exists():
        console.print(f"  [yellow]Dùng cache: {cache}[/yellow]")
        gt = json.loads(cache.read_text(encoding="utf-8"))
        console.print(f"  → {len(gt)} facts")
    elif args.local_gt or not args.gemini_key:
        gt = generate_ground_truth_local(pdf_text)
        cache.write_text(json.dumps(gt, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        gt = generate_ground_truth_gemini(pdf_text, args.gemini_key)
        cache.write_text(json.dumps(gt, ensure_ascii=False, indent=2), encoding="utf-8")
        console.print(f"  [green]Cache: {cache}[/green]")

    console.print("\n[bold]3. Load Mindmaps[/bold]")
    my_nodes = load_my_mindmap(args.my)
    xm_nodes = load_xmind(args.xmind)

    console.print(f"\n[bold]4. Embeddings ({args.model})[/bold]")
    st = SentenceTransformer(args.model)
    console.print("  GT…");    gt_v = embed(st, gt)
    console.print("  My…");    my_v = embed(st, my_nodes)
    console.print("  XMind…"); xm_v = embed(st, xm_nodes)
    console.print(f"  [green]GT:{gt_v.shape} My:{my_v.shape} XMind:{xm_v.shape}[/green]")

    console.print(f"\n[bold]5. Metrics (threshold={args.threshold})[/bold]")
    metrics = compute(gt, my_nodes, xm_nodes, gt_v, my_v, xm_v, args.threshold)

    console.print("\n[bold]6. Report[/bold]")
    print_report(metrics, pages)
    save_outputs(metrics, args.output)


if __name__ == "__main__":
    main()
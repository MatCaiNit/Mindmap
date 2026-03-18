"""
compare.py  –  So sánh RAG mindmap vs XMind
============================================
SETUP:
    pip install google-genai numpy

USAGE:
    python compare.py --xmind xmind_chunks.json --rag our_mindmap.json --key AIza...
"""

import os, json, sys, argparse, time
import numpy as np
from google import genai
from google.genai import types


# ═══════════════════════════════════════════════════════════════════════════
# LOADERS
# ═══════════════════════════════════════════════════════════════════════════

def load_xmind(path: str) -> list[str]:
    """
    Normalize XMind: tách node dài thành nhiều items nhỏ.
    "Path > Node: detail1, detail2" → ["Path > Node > detail1", "Path > Node > detail2"]
    """
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    expanded = []
    for item in data:
        item = item.strip()
        if not item:
            continue
        if ": " in item:
            path_part, detail_part = item.split(": ", 1)
            details = [d.strip() for d in detail_part.split(",") if d.strip()]
            if len(details) > 1:
                for d in details:
                    expanded.append(f"{path_part} > {d}")
            else:
                expanded.append(item)
        else:
            expanded.append(item)
    return expanded


def flatten_rag(node: dict, path: str = "") -> list[str]:
    label    = node.get("text", "").strip()
    current  = f"{path} > {label}" if path else label
    children = node.get("children", [])
    if not children:
        return [current]
    result = []
    for child in children:
        result.extend(flatten_rag(child, current))
    return result


def load_rag(path: str) -> list[str]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    root = data.get("root", data)
    return flatten_rag(root)


# ═══════════════════════════════════════════════════════════════════════════
# EMBEDDINGS  –  google-genai mới + retry khi 429
# ═══════════════════════════════════════════════════════════════════════════

def embed_batch(client, texts: list[str]) -> np.ndarray:
    """
    Embed từng text một, tự retry khi gặp 429.
    Free tier limit: 100 req/min → sleep 0.7s giữa mỗi request.
    """
    vectors = []
    total   = len(texts)

    for i, text in enumerate(texts):
        retries = 0
        while True:
            try:
                res = client.models.embed_content(
                    model   = "gemini-embedding-001",   # model mới nhất, stable
                    contents= text,
                    config  = types.EmbedContentConfig(
                        task_type="RETRIEVAL_DOCUMENT"
                    ),
                )
                vectors.append(res.embeddings[0].values)
                break
            except Exception as e:
                msg = str(e)
                if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                    wait = 60  # wait 60s rồi retry
                    print(f"\n  ⏳ Rate limit, chờ {wait}s... ({i+1}/{total})")
                    time.sleep(wait)
                    retries += 1
                    if retries > 3:
                        raise
                else:
                    raise

        # Throttle để tránh hit rate limit (100 req/min = 0.6s/req)
        time.sleep(0.65)

        # Progress
        if (i + 1) % 10 == 0 or (i + 1) == total:
            print(f"  ✓ {i+1}/{total}", end="\r")

    print()
    return np.array(vectors, dtype=np.float32)


# ═══════════════════════════════════════════════════════════════════════════
# METRICS
# ═══════════════════════════════════════════════════════════════════════════

def cosine_sim_matrix(A: np.ndarray, B: np.ndarray) -> np.ndarray:
    A = A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-10)
    B = B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-10)
    return A @ B.T


def compute_all(xmind_topics, rag_topics, xmind_vecs, rag_vecs, threshold):
    sim = cosine_sim_matrix(xmind_vecs, rag_vecs)  # (xmind, rag)

    best_rag_for_xmind = sim.max(axis=1)  # mỗi XMind → RAG gần nhất
    best_xmind_for_rag = sim.max(axis=0)  # mỗi RAG   → XMind gần nhất

    recall    = float((best_rag_for_xmind >= threshold).mean())
    precision = float((best_xmind_for_rag >= threshold).mean())
    f1        = 2 * precision * recall / (precision + recall + 1e-10)

    # Topics bị miss (XMind có nhưng RAG không cover)
    missing = [
        (t, round(float(s), 3))
        for t, s in zip(xmind_topics, best_rag_for_xmind)
        if s < threshold
    ]
    # Topics RAG tự thêm (không có trong XMind)
    extra = [
        (t, round(float(s), 3))
        for t, s in zip(rag_topics, best_xmind_for_rag)
        if s < threshold
    ]

    # Structural stats
    avg_dep_x = sum(t.count(">") + 1 for t in xmind_topics) / len(xmind_topics)
    avg_dep_r = sum(t.count(">") + 1 for t in rag_topics)   / len(rag_topics)
    avg_len_x = sum(len(t.split(">")[-1].strip()) for t in xmind_topics) / len(xmind_topics)
    avg_len_r = sum(len(t.split(">")[-1].strip()) for t in rag_topics)   / len(rag_topics)

    return {
        "metrics": {
            "recall":        round(recall, 4),
            "precision":     round(precision, 4),
            "f1":            round(f1, 4),
            "avg_sim_xmind": round(float(best_rag_for_xmind.mean()), 4),
            "avg_sim_rag":   round(float(best_xmind_for_rag.mean()), 4),
        },
        "stats": {
            "xmind_topics": len(xmind_topics),
            "rag_topics":   len(rag_topics),
            "xmind_depth":  round(avg_dep_x, 2),
            "rag_depth":    round(avg_dep_r, 2),
            "xmind_label":  round(avg_len_x, 1),
            "rag_label":    round(avg_len_r, 1),
        },
        "missing": sorted(missing, key=lambda x: x[1]),
        "extra":   sorted(extra,   key=lambda x: x[1]),
    }


# ═══════════════════════════════════════════════════════════════════════════
# REPORT
# ═══════════════════════════════════════════════════════════════════════════

G="\033[32m"; R="\033[31m"; Y="\033[33m"; B="\033[1m"; E="\033[0m"

def bar(v, w=26):
    n = int(v * w)
    return f"[{'█'*n}{'░'*(w-n)}] {v*100:.1f}%"

def col(v):
    return G if v >= 0.7 else (Y if v >= 0.5 else R)

def winner(a, b, higher_better=True):
    if higher_better:
        return f"{G}RAG ▶{E}" if a < b else f"{Y}XMind ◀{E}"
    return f"{G}RAG ▶{E}" if a > b else f"{Y}XMind ◀{E}"

def render(result, threshold):
    m = result["metrics"]
    s = result["stats"]
    missing = result["missing"]
    extra   = result["extra"]

    lines = [
        "", "="*68,
        f"{B}  MINDMAP QUALITY COMPARISON  (threshold={threshold}){E}",
        "="*68, "",
        f"  {'':26} {'XMind':>9}  {'RAG':>9}  {'Chi tiết hơn':>12}",
        "  " + "─"*56,
        f"  {'Số topics (normalized)':<26} {s['xmind_topics']:>9}  {s['rag_topics']:>9}  {winner(s['xmind_topics'], s['rag_topics'])}",
        f"  {'Độ sâu TB (levels)':<26} {s['xmind_depth']:>9.2f}  {s['rag_depth']:>9.2f}  {winner(s['xmind_depth'], s['rag_depth'])}",
        f"  {'Độ dài label TB (chars)':<26} {s['xmind_label']:>9.1f}  {s['rag_label']:>9.1f}  {winner(s['xmind_label'], s['rag_label'])}",
        "",
        "─"*68,
        f"{B}  NỘI DUNG ĐỦ KHÔNG?    Recall{E}",
        f"  {col(m['recall'])}{bar(m['recall'])}{E}  (avg sim={m['avg_sim_xmind']:.3f})",
        f"  RAG cover {m['recall']*100:.1f}% nội dung XMind",
        "",
        f"{B}  NỘI DUNG ĐÚNG KHÔNG?  Precision{E}",
        f"  {col(m['precision'])}{bar(m['precision'])}{E}  (avg sim={m['avg_sim_rag']:.3f})",
        f"  {m['precision']*100:.1f}% nội dung RAG khớp XMind  |  {(1-m['precision'])*100:.1f}% RAG tự thêm",
        "",
        f"{B}  TỔNG HỢP              F1{E}",
        f"  {col(m['f1'])}{bar(m['f1'])}{E}",
        "",
    ]

    if missing:
        lines += [
            "─"*68,
            f"{R}{B}  ❌ RAG BỎ SÓT {len(missing)}/{s['xmind_topics']} topics:{E}",
            "─"*68,
        ]
        for t, sim in missing[:8]:
            leaf = t.split(">")[-1].strip()
            lines.append(f"  [{sim:.2f}] {leaf}")
        if len(missing) > 8:
            lines.append(f"  ... và {len(missing)-8} topics nữa")
        lines.append("")

    if extra:
        lines += [
            "─"*68,
            f"{Y}{B}  ➕ RAG TỰ THÊM {len(extra)}/{s['rag_topics']} topics (không có trong XMind):{E}",
            "─"*68,
        ]
        for t, sim in extra[:8]:
            leaf = t.split(">")[-1].strip()
            lines.append(f"  [{sim:.2f}] {leaf}")
        if len(extra) > 8:
            lines.append(f"  ... và {len(extra)-8} topics nữa")
        lines.append("")

    f1 = m["f1"]
    lines += ["─"*68, f"{B}  KẾT LUẬN:{E}"]
    detail = "RAG" if s["rag_topics"] > s["xmind_topics"] else "XMind"
    lines.append(f"  📊 {detail} chi tiết hơn ({s['rag_topics']} vs {s['xmind_topics']} topics)")

    if f1 >= 0.75:
        lines.append(f"  {G}✅  RAG TỐT – cover đủ và đúng (F1={f1:.2f}){E}")
    elif f1 >= 0.55:
        lines.append(f"  {Y}⚠️   RAG KHÁ – bỏ sót {len(missing)} ý (F1={f1:.2f}){E}")
    else:
        lines.append(f"  {R}❌  RAG YẾU – miss nhiều nội dung (F1={f1:.2f}){E}")

    lines += ["", "="*68, ""]
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xmind",     required=True)
    ap.add_argument("--rag",       required=True)
    ap.add_argument("--key",       default=os.getenv("GEMINI_API_KEY"))
    ap.add_argument("--threshold", type=float, default=0.82)
    ap.add_argument("--output",    default="compare_report.json")
    args = ap.parse_args()

    if not args.key:
        sys.exit("❌  Cần GEMINI_API_KEY")

    client = genai.Client(api_key=args.key)

    print("\n📂  Loading & normalizing…")
    xmind_topics = load_xmind(args.xmind)
    rag_topics   = load_rag(args.rag)
    total = len(xmind_topics) + len(rag_topics)
    print(f"   XMind : {len(xmind_topics)} topics (sau normalize)")
    print(f"   RAG   : {len(rag_topics)} topics")
    print(f"   Tổng  : {total} embeddings cần tạo")
    print(f"   ⏱️  Ước tính: ~{total * 0.65 / 60:.1f} phút (free tier throttle)")

    print("\n🔢  Embedding XMind topics…")
    xmind_vecs = embed_batch(client, xmind_topics)

    print("🔢  Embedding RAG topics…")
    rag_vecs = embed_batch(client, rag_topics)

    print("\n📊  Computing metrics…")
    result = compute_all(xmind_topics, rag_topics, xmind_vecs, rag_vecs, args.threshold)

    print(render(result, args.threshold))

    report = {
        "threshold": args.threshold,
        **result,
        "missing": [{"topic": t, "sim": s} for t, s in result["missing"]],
        "extra":   [{"topic": t, "sim": s} for t, s in result["extra"]],
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"  💾  Saved → {args.output}\n")


if __name__ == "__main__":
    main()
from __future__ import annotations
import json, re, math, sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
import numpy as np

def extract_text_from_file(path: str) -> str:
    """Extract plain text from PDF or TXT. Splits into sentences later."""
    p = Path(path)
    if p.suffix.lower() == ".pdf":
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(path)
            return "\n".join(page.get_text() for page in doc)
        except ImportError:
            raise ImportError("Install PyMuPDF: pip install PyMuPDF")
    elif p.suffix.lower() in (".txt", ".md"):
        return p.read_text(encoding="utf-8")
    else:
        raise ValueError(f"Unsupported file type: {p.suffix}")


def chunk_document(text: str, chunk_size: int = 150, overlap: int = 30) -> list[str]:
    """
    Split document text into overlapping word-chunks.
    Used ONLY during evaluation — no pre-stored chunks required.
    
    chunk_size: words per chunk
    overlap:    words shared between adjacent chunks
    """
    words = text.split()
    chunks, start = [], 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]))
        start += chunk_size - overlap
    return [c.strip() for c in chunks if len(c.split()) >= 10]


# ──────────────────────────────────────────────────────────────────────────────
# 2. MINDMAP PARSING
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class MindmapNode:
    id: str
    label: str
    description: str = ""
    level: int = 0
    parent_id: Optional[str] = None
    children: list["MindmapNode"] = field(default_factory=list)

    @property
    def text(self) -> str:
        """Full text content of this node for embedding."""
        return f"{self.label}. {self.description}".strip(". ")


def parse_mindmap(json_path: str) -> list[MindmapNode]:
    """
    Parse the exported mindmap JSON.
    Supports both flat (flatNodes) and tree (root) formats.
    Returns a flat list of MindmapNode objects.
    """
    data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    nodes: list[MindmapNode] = []

    def walk(node_dict, parent_id=None, level=0):
        n = MindmapNode(
            id          = node_dict.get("id", str(len(nodes))),
            label       = node_dict.get("text", node_dict.get("label", "")),
            description = node_dict.get("description", ""),
            level       = level,
            parent_id   = parent_id,
        )
        nodes.append(n)
        for child in node_dict.get("children", []):
            walk(child, n.id, level + 1)

    # Handle both export formats
    if "root" in data:
        walk(data["root"])
    elif "flatNodes" in data:
        for fn in data["flatNodes"]:
            nodes.append(MindmapNode(
                id    = fn.get("id", str(len(nodes))),
                label = fn.get("text", ""),
                level = fn.get("level", 0),
            ))
    else:
        raise ValueError("Unknown mindmap JSON format")

    return nodes


# ──────────────────────────────────────────────────────────────────────────────
# 3. EMBEDDING ENGINE
# ──────────────────────────────────────────────────────────────────────────────

class EmbeddingEngine:
    """
    Sentence-transformer based embedder.
    Model: paraphrase-multilingual-MiniLM-L12-v2  (supports Vietnamese + English)
    Dim: 384. Fast on CPU.
    """
    MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

    def __init__(self):
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer(self.MODEL_NAME)

    def embed(self, texts: list[str]) -> np.ndarray:
        """Returns (N, 384) float32 array."""
        return self.model.encode(texts, normalize_embeddings=True,
                                 show_progress_bar=False)

    @staticmethod
    def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
        """Cosine similarity for normalized vectors (dot product)."""
        return float(np.dot(a, b))


# ──────────────────────────────────────────────────────────────────────────────
# 4. METRIC FAMILIES
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class MetricResult:
    name: str
    score: float          # 0.0 – 1.0
    raw: dict             # diagnostic details
    weight: float = 1.0   # contribution to final score


# ── 4.1 Structural Metrics ────────────────────────────────────────────────────

def structural_metrics(nodes: list[MindmapNode]) -> MetricResult:
    """
    Measures tree health independent of semantics.
    
    Metrics:
      - depth_score:       max depth ∈ [2,6] is ideal
      - breadth_balance:   std dev of children counts (lower = balanced)
      - leaf_ratio:        leaf / total ∈ [0.4, 0.7] is ideal
      - node_count_score:  penalize < 8 or > 200 nodes
    """
    if not nodes:
        return MetricResult("structural", 0.0, {})

    total = len(nodes)
    max_depth = max(n.level for n in nodes) if nodes else 0

    # Children count per parent
    children_count: dict[str, int] = {}
    for n in nodes:
        if n.parent_id:
            children_count[n.parent_id] = children_count.get(n.parent_id, 0) + 1

    counts = list(children_count.values()) or [0]
    avg_children = np.mean(counts)
    std_children = np.std(counts)

    leaf_count = sum(1 for n in nodes if n.level > 0 and
                     not any(m.parent_id == n.id for m in nodes))
    leaf_ratio = leaf_count / max(total, 1)

    # Subscores (0–1)
    depth_ideal = 4
    depth_score = 1.0 - min(abs(max_depth - depth_ideal) / depth_ideal, 1.0)

    balance_score = max(0.0, 1.0 - std_children / max(avg_children, 1))

    leaf_ideal_lo, leaf_ideal_hi = 0.4, 0.7
    if leaf_ideal_lo <= leaf_ratio <= leaf_ideal_hi:
        leaf_score = 1.0
    else:
        dist = min(abs(leaf_ratio - leaf_ideal_lo), abs(leaf_ratio - leaf_ideal_hi))
        leaf_score = max(0.0, 1.0 - dist / 0.3)

    node_ideal_lo, node_ideal_hi = 8, 150
    if node_ideal_lo <= total <= node_ideal_hi:
        node_score = 1.0
    elif total < node_ideal_lo:
        node_score = total / node_ideal_lo
    else:
        node_score = max(0.0, 1.0 - (total - node_ideal_hi) / 100)

    score = 0.25*depth_score + 0.30*balance_score + 0.20*leaf_score + 0.25*node_score

    return MetricResult("structural", round(score, 4), {
        "total_nodes": total,
        "max_depth": max_depth,
        "avg_children": round(avg_children, 2),
        "std_children": round(std_children, 2),
        "leaf_ratio": round(leaf_ratio, 3),
        "depth_score": round(depth_score, 3),
        "balance_score": round(balance_score, 3),
        "leaf_score": round(leaf_score, 3),
        "node_score": round(node_score, 3),
    }, weight=0.15)


# ── 4.2 Hierarchy Metrics ─────────────────────────────────────────────────────

def hierarchy_metrics(nodes: list[MindmapNode], engine: EmbeddingEngine) -> MetricResult:
    """
    Semantic coherence between parent and child nodes.
    A child should be semantically contained within / related to its parent.
    
    Formula:
        hierarchy_score = mean cosine_sim(embed(parent), embed(child))
        for all parent-child pairs
    
    Low score → bad hierarchy (e.g., child is unrelated to parent topic)
    """
    pairs = []
    id_to_node = {n.id: n for n in nodes}

    for n in nodes:
        if n.parent_id and n.parent_id in id_to_node:
            parent = id_to_node[n.parent_id]
            pairs.append((parent.text, n.text))

    if not pairs:
        return MetricResult("hierarchy", 0.5, {"pairs": 0}, weight=0.15)

    parent_texts = [p[0] for p in pairs]
    child_texts  = [p[1] for p in pairs]

    parent_embs = engine.embed(parent_texts)
    child_embs  = engine.embed(child_texts)

    sims = [engine.cosine_sim(parent_embs[i], child_embs[i])
            for i in range(len(pairs))]

    score = float(np.mean(sims))
    low_pairs = [(pairs[i][0][:40], pairs[i][1][:40])
                 for i, s in enumerate(sims) if s < 0.3]

    return MetricResult("hierarchy", round(score, 4), {
        "pairs_evaluated": len(pairs),
        "mean_sim": round(score, 4),
        "min_sim": round(min(sims), 4),
        "bad_hierarchy_pairs": low_pairs[:5],
    }, weight=0.15)


# ── 4.3 Coverage / Faithfulness Metrics ──────────────────────────────────────

def coverage_metrics(nodes: list[MindmapNode],
                     doc_chunks: list[str],
                     engine: EmbeddingEngine,
                     threshold: float = 0.45) -> MetricResult:
    """
    Document → Map Coverage:
        What fraction of important document concepts appear in the mindmap?
    
    Map → Document Faithfulness:
        What fraction of mindmap nodes are grounded in the document?
    
    Method (embedding-based):
        1. Embed all document chunks.
        2. Embed all node texts.
        3. Coverage:     for each chunk, find max sim to any node.
                         coverage = mean(max_sims) above threshold.
        4. Faithfulness: for each node, find max sim to any chunk.
                         faithfulness = fraction of nodes above threshold.
    
    Threshold 0.45: empirically reasonable for MiniLM multilingual.
    """
    node_texts  = [n.text for n in nodes if n.text.strip()]
    if not node_texts or not doc_chunks:
        return MetricResult("coverage", 0.0, {}, weight=0.25)

    node_embs  = engine.embed(node_texts)
    chunk_embs = engine.embed(doc_chunks)

    # Coverage: document → map
    chunk_max_sims = []
    for ce in chunk_embs:
        sims = [engine.cosine_sim(ce, ne) for ne in node_embs]
        chunk_max_sims.append(max(sims))
    coverage_score = float(np.mean([s for s in chunk_max_sims if s >= threshold]))
    covered_chunks = sum(1 for s in chunk_max_sims if s >= threshold)

    # Faithfulness: map → document
    node_max_sims = []
    hallucinated  = []
    for i, ne in enumerate(node_embs):
        sims = [engine.cosine_sim(ne, ce) for ce in chunk_embs]
        best = max(sims)
        node_max_sims.append(best)
        if best < threshold:
            hallucinated.append(node_texts[i][:60])

    faithfulness_score = sum(1 for s in node_max_sims if s >= threshold) / len(node_max_sims)

    combined = 0.5 * coverage_score + 0.5 * faithfulness_score

    return MetricResult("coverage", round(combined, 4), {
        "coverage_score": round(coverage_score, 4),
        "faithfulness_score": round(faithfulness_score, 4),
        "covered_chunks": covered_chunks,
        "total_chunks": len(doc_chunks),
        "chunk_coverage_rate": round(covered_chunks / len(doc_chunks), 3),
        "hallucinated_nodes": hallucinated[:8],
        "hallucination_count": len(hallucinated),
        "threshold": threshold,
    }, weight=0.25)


# ── 4.4 Semantic Coherence ────────────────────────────────────────────────────

def semantic_metrics(nodes: list[MindmapNode], engine: EmbeddingEngine) -> MetricResult:
    """
    Intra-map semantic coherence:
    - Topic focus: are sibling nodes semantically cohesive?
    - Global spread: are level-1 branches sufficiently distinct?
    
    Sibling cohesion: for each parent, embed children → mean pairwise sim.
        Good: 0.4–0.7 (related but not duplicate)
    
    Branch diversity: embed L1 nodes → mean pairwise sim should be LOW.
        Ideal < 0.5 (each branch covers different topic)
    """
    id_to_children: dict[str, list[MindmapNode]] = {}
    for n in nodes:
        if n.parent_id:
            id_to_children.setdefault(n.parent_id, []).append(n)

    # Sibling cohesion
    cohesion_scores = []
    for pid, children in id_to_children.items():
        if len(children) < 2:
            continue
        embs = engine.embed([c.text for c in children])
        sims = []
        for i in range(len(embs)):
            for j in range(i+1, len(embs)):
                sims.append(engine.cosine_sim(embs[i], embs[j]))
        if sims:
            cohesion_scores.append(np.mean(sims))

    cohesion = float(np.mean(cohesion_scores)) if cohesion_scores else 0.5

    # Branch diversity (L1 nodes)
    l1_nodes = [n for n in nodes if n.level == 1]
    if len(l1_nodes) >= 2:
        l1_embs = engine.embed([n.text for n in l1_nodes])
        div_sims = []
        for i in range(len(l1_embs)):
            for j in range(i+1, len(l1_embs)):
                div_sims.append(engine.cosine_sim(l1_embs[i], l1_embs[j]))
        diversity = 1.0 - float(np.mean(div_sims))  # lower sim = higher diversity
    else:
        diversity = 0.5

    # Ideal cohesion: 0.4–0.65 (siblings related but not identical)
    cohesion_ideal = 1.0 - abs(cohesion - 0.525) / 0.525
    cohesion_ideal = max(0.0, min(1.0, cohesion_ideal))

    score = 0.5 * cohesion_ideal + 0.5 * diversity

    return MetricResult("semantic", round(score, 4), {
        "sibling_cohesion": round(cohesion, 4),
        "branch_diversity": round(diversity, 4),
        "l1_branches_evaluated": len(l1_nodes),
    }, weight=0.15)


# ── 4.5 Redundancy Metrics ────────────────────────────────────────────────────

def redundancy_metrics(nodes: list[MindmapNode], engine: EmbeddingEngine,
                       dup_threshold: float = 0.90) -> MetricResult:
    """
    Detect duplicate or near-duplicate nodes.
    
    Formula:
        For all pairs (i,j): if cosine_sim(embed_i, embed_j) > dup_threshold
        → mark as duplicate.
        
    Redundancy rate = duplicate_pairs / total_pairs
    Score = 1 - redundancy_rate
    
    Threshold 0.90: very similar labels/descriptions = likely duplicate.
    """
    texts = [n.text for n in nodes if n.text.strip()]
    if len(texts) < 2:
        return MetricResult("redundancy", 1.0, {"duplicate_pairs": 0}, weight=0.10)

    embs = engine.embed(texts)
    dup_pairs = []

    for i in range(len(embs)):
        for j in range(i+1, len(embs)):
            sim = engine.cosine_sim(embs[i], embs[j])
            if sim >= dup_threshold:
                dup_pairs.append({
                    "node_a": texts[i][:50],
                    "node_b": texts[j][:50],
                    "similarity": round(sim, 4),
                })

    total_pairs = len(texts) * (len(texts)-1) / 2
    redundancy_rate = len(dup_pairs) / max(total_pairs, 1)
    score = max(0.0, 1.0 - redundancy_rate * 10)  # penalize heavily

    return MetricResult("redundancy", round(score, 4), {
        "duplicate_pairs": len(dup_pairs),
        "total_pairs": int(total_pairs),
        "redundancy_rate": round(redundancy_rate, 4),
        "examples": dup_pairs[:5],
        "threshold": dup_threshold,
    }, weight=0.10)


# ── 4.6 Readability Metrics ───────────────────────────────────────────────────

def readability_metrics(nodes: list[MindmapNode]) -> MetricResult:
    """
    Label quality without embeddings — fast heuristics.
    
    Sub-metrics:
      - avg_label_words: ideal 2–6 words
      - truncation_rate: fraction of labels ending with "..." or very short
      - description_coverage: fraction of nodes with non-empty description
      - special_char_penalty: labels with brackets, colons, etc.
    """
    if not nodes:
        return MetricResult("readability", 0.0, {}, weight=0.10)

    labels      = [n.label for n in nodes if n.label]
    word_counts = [len(l.split()) for l in labels]

    avg_words = np.mean(word_counts) if word_counts else 0
    # Ideal: 2–6 words per label
    label_score = 1.0 - min(abs(avg_words - 4) / 4, 1.0)

    truncated = sum(1 for l in labels if l.endswith("...") or len(l) < 4)
    truncation_score = 1.0 - truncated / max(len(labels), 1)

    described = sum(1 for n in nodes if n.description and len(n.description) > 10)
    desc_coverage = described / max(len(nodes), 1)

    # Penalize bracket-heavy labels (TOC artifacts)
    bracket_count = sum(1 for l in labels if re.search(r"\[|\]|\(p\.\d+\)", l))
    bracket_penalty = bracket_count / max(len(labels), 1)
    bracket_score = 1.0 - bracket_penalty

    score = (0.30*label_score + 0.25*truncation_score +
             0.25*desc_coverage + 0.20*bracket_score)

    return MetricResult("readability", round(score, 4), {
        "avg_label_words": round(avg_words, 2),
        "truncated_labels": truncated,
        "nodes_with_description": described,
        "description_coverage": round(desc_coverage, 3),
        "bracket_labels": bracket_count,
        "label_score": round(label_score, 3),
        "truncation_score": round(truncation_score, 3),
        "bracket_score": round(bracket_score, 3),
    }, weight=0.10)


# ── 4.7 Graph Metrics ─────────────────────────────────────────────────────────

def graph_metrics(nodes: list[MindmapNode]) -> MetricResult:
    """
    Graph-structural properties using NetworkX.
    
    Metrics:
      - is_tree: valid tree (no cycles, single root)
      - avg_branching_factor: mean children per non-leaf
      - depth_variance: std of node depths (low = balanced)
      - orphan_nodes: nodes with missing parent
    """
    try:
        import networkx as nx
    except ImportError:
        return MetricResult("graph", 0.5, {"error": "networkx not installed"}, weight=0.10)

    G = nx.DiGraph()
    id_to_node = {n.id: n for n in nodes}

    for n in nodes:
        G.add_node(n.id)
    for n in nodes:
        if n.parent_id and n.parent_id in id_to_node:
            G.add_edge(n.parent_id, n.id)

    orphans = [n.id for n in nodes if n.parent_id and n.parent_id not in id_to_node]
    is_tree = nx.is_tree(G.to_undirected()) if len(nodes) > 0 else False

    depths = [n.level for n in nodes]
    depth_var = float(np.std(depths)) if depths else 0

    # Branching factor
    out_degrees = [G.out_degree(n) for n in G.nodes() if G.out_degree(n) > 0]
    avg_branching = float(np.mean(out_degrees)) if out_degrees else 0

    # Ideal branching: 2–5
    branch_score = 1.0 - min(abs(avg_branching - 3.5) / 3.5, 1.0)
    tree_score = 1.0 if is_tree else 0.5
    orphan_score = 1.0 - len(orphans) / max(len(nodes), 1)
    depth_score = max(0.0, 1.0 - depth_var / 5)

    score = 0.30*tree_score + 0.30*branch_score + 0.20*orphan_score + 0.20*depth_score

    return MetricResult("graph", round(score, 4), {
        "is_tree": is_tree,
        "orphan_nodes": len(orphans),
        "avg_branching_factor": round(avg_branching, 2),
        "depth_variance": round(depth_var, 3),
        "total_edges": G.number_of_edges(),
    }, weight=0.10)


# ──────────────────────────────────────────────────────────────────────────────
# 5. FINAL SCORING + REPORT
# ──────────────────────────────────────────────────────────────────────────────

THRESHOLDS = {
    # Score range → rating
    (0.80, 1.00): ("Excellent", "⭐⭐⭐⭐⭐"),
    (0.65, 0.80): ("Good",      "⭐⭐⭐⭐"),
    (0.50, 0.65): ("Fair",      "⭐⭐⭐"),
    (0.35, 0.50): ("Poor",      "⭐⭐"),
    (0.00, 0.35): ("Very Poor", "⭐"),
}

def get_rating(score: float) -> tuple[str, str]:
    for (lo, hi), (label, stars) in THRESHOLDS.items():
        if lo <= score <= hi:
            return label, stars
    return "Unknown", ""


def compute_final_score(results: list[MetricResult]) -> float:
    """
    Weighted average of all metric scores.
    Weights sum to 1.0:
        coverage     0.25  (most important — faithfulness to source)
        hierarchy    0.15
        structural   0.15
        semantic     0.15
        redundancy   0.10
        readability  0.10
        graph        0.10
    """
    total_weight = sum(r.weight for r in results)
    return sum(r.score * r.weight for r in results) / max(total_weight, 1e-9)


def print_report(results: list[MetricResult], final: float,
                 doc_path: str, map_path: str):
    """Pretty-print evaluation report to stdout."""
    label, stars = get_rating(final)
    bar = "█" * round(final * 20) + "░" * (20 - round(final * 20))

    print("\n" + "═"*65)
    print(f"  MINDMAP QUALITY EVALUATION REPORT")
    print(f"  Document : {Path(doc_path).name}")
    print(f"  Mindmap  : {Path(map_path).name}")
    print("═"*65)
    print(f"  FINAL SCORE : {final:.4f}  [{bar}]")
    print(f"  RATING      : {stars}  {label}")
    print("─"*65)

    for r in results:
        bar_m = "█" * round(r.score * 10) + "░" * (10 - round(r.score * 10))
        print(f"  {r.name:<14} {r.score:.4f}  [{bar_m}]  (w={r.weight:.2f})")
        for k, v in r.raw.items():
            if isinstance(v, list) and len(v) > 3:
                v = v[:3] + ["..."]
            print(f"    {k}: {v}")

    print("─"*65)
    # Warnings
    coverage_r = next((r for r in results if r.name == "coverage"), None)
    if coverage_r and coverage_r.raw.get("hallucination_count", 0) > 5:
        print(f"  ⚠️  HIGH HALLUCINATION: {coverage_r.raw['hallucination_count']} nodes not grounded in doc")
    redund_r = next((r for r in results if r.name == "redundancy"), None)
    if redund_r and redund_r.raw.get("duplicate_pairs", 0) > 3:
        print(f"  ⚠️  DUPLICATES: {redund_r.raw['duplicate_pairs']} near-duplicate node pairs")
    struct_r = next((r for r in results if r.name == "structural"), None)
    if struct_r and struct_r.raw.get("total_nodes", 0) < 10:
        print(f"  ⚠️  TOO FEW NODES: {struct_r.raw['total_nodes']} (minimum recommended: 10)")
    print("═"*65 + "\n")


def export_json_report(results: list[MetricResult], final: float,
                       doc_path: str, map_path: str, out_path: str):
    """Save full evaluation report as JSON."""
    label, stars = get_rating(final)
    report = {
        "document":    Path(doc_path).name,
        "mindmap":     Path(map_path).name,
        "final_score": round(final, 4),
        "rating":      label,
        "stars":       stars,
        "metrics":     [{"name": r.name, "score": r.score,
                         "weight": r.weight, "details": r.raw}
                        for r in results],
    }
    Path(out_path).write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"  JSON report saved → {out_path}")


# ──────────────────────────────────────────────────────────────────────────────
# 6. MAIN PIPELINE
# ──────────────────────────────────────────────────────────────────────────────

def evaluate(doc_path: str, map_path: str,
             out_json: str = "eval_report.json",
             chunk_size: int = 150,
             coverage_threshold: float = 0.45) -> dict:
    """
    Full evaluation pipeline.
    
    Args:
        doc_path:            Path to source document (PDF or TXT)
        map_path:            Path to exported mindmap JSON
        out_json:            Output path for JSON report
        chunk_size:          Words per document chunk
        coverage_threshold:  Cosine similarity threshold for coverage/faithfulness
    
    Returns:
        dict with final_score and all metric results
    """
    print(f"[Eval] Loading document: {doc_path}")
    doc_text   = extract_text_from_file(doc_path)
    doc_chunks = chunk_document(doc_text, chunk_size=chunk_size)
    print(f"[Eval] Document: {len(doc_text.split())} words → {len(doc_chunks)} chunks")

    print(f"[Eval] Parsing mindmap: {map_path}")
    nodes = parse_mindmap(map_path)
    print(f"[Eval] Mindmap: {len(nodes)} nodes")

    print("[Eval] Loading embedding model (first run downloads ~90MB)...")
    engine = EmbeddingEngine()

    print("[Eval] Computing metrics...")
    results = [
        structural_metrics(nodes),
        hierarchy_metrics(nodes, engine),
        coverage_metrics(nodes, doc_chunks, engine, coverage_threshold),
        semantic_metrics(nodes, engine),
        redundancy_metrics(nodes, engine),
        readability_metrics(nodes),
        graph_metrics(nodes),
    ]

    final = compute_final_score(results)
    print_report(results, final, doc_path, map_path)
    export_json_report(results, final, doc_path, map_path, out_json)

    return {
        "final_score": round(final, 4),
        "metrics": {r.name: r.score for r in results},
    }


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    """
    Usage:
        python mindmap_evaluator.py <document.pdf> <mindmap.json>
        python mindmap_evaluator.py <document.pdf> <mindmap.json> --out report.json
        python mindmap_evaluator.py <document.txt> <mindmap.json> --threshold 0.40
    """
    import argparse
    parser = argparse.ArgumentParser(description="Mindmap Quality Evaluator")
    parser.add_argument("document",   help="Source document (PDF or TXT)")
    parser.add_argument("mindmap",    help="Exported mindmap JSON")
    parser.add_argument("--out",      default="eval_report.json", help="Output JSON path")
    parser.add_argument("--chunk",    type=int,   default=150,  help="Chunk size in words")
    parser.add_argument("--threshold",type=float, default=0.45, help="Coverage threshold")
    args = parser.parse_args()

    result = evaluate(
        doc_path             = args.document,
        map_path             = args.mindmap,
        out_json             = args.out,
        chunk_size           = args.chunk,
        coverage_threshold   = args.threshold,
    )
    sys.exit(0 if result["final_score"] >= 0.50 else 1)
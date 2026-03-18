"""
prepare_testset.py
==================
Tự động sinh testset (question + ground_truth) từ xmind_chunks.json.
Dùng Gemini để tạo câu hỏi, không cần viết tay.

USAGE:
    python prepare_testset.py \\
        --source     xmind_chunks.json \\
        --output     testset.json \\
        --n          20 \\
        --gemini_key AIza...
"""
import time  # Add this at the top with other imports
import os, json, argparse, random, sys
from typing import List, Dict, Any
import google.generativeai as genai


def load_chunks(path: str) -> List[str]:
    """Load xmind_chunks.json → list of text strings."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    chunks: List[str] = []

    def _walk(node: Any):
        # Check if node is a dictionary before calling .get()
        if isinstance(node, dict):
            t = (node.get("text") or node.get("label") or
                 node.get("topic") or node.get("content") or "").strip()
            if t:
                chunks.append(t)
            for child in node.get("children", []):
                _walk(child)
        elif isinstance(node, str):
            # If it's just a string, add it directly
            t = node.strip()
            if t:
                chunks.append(t)

    if isinstance(data, list):
        for item in data:
            _walk(item)
    elif isinstance(data, dict):
        if "chunks" in data:
            for c in data["chunks"]:
                _walk(c)
        elif "nodes" in data:
            nv = data["nodes"]
            items = nv.values() if isinstance(nv, dict) else nv
            for n in items:
                _walk(n)
        elif "root" in data:
            _walk(data["root"])

    return [c for c in chunks if len(c) > 10]  # lọc quá ngắn


PROMPT = """You are building a QA evaluation dataset for a RAG mindmap system.

Given this concept from a mindmap:
"{concept}"

Generate ONE question-answer pair where:
- QUESTION: tests understanding of this concept (varied: What/How/Why/Explain/Compare)
- GROUND_TRUTH: factual answer derivable directly from the concept

Return valid JSON only (no markdown):
{{"question": "...", "ground_truth": "..."}}"""


def gen_qa(concept: str, model) -> Dict:
    response = model.generate_content(
        PROMPT.format(concept=concept),
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0.7,
        ),
    )
    return json.loads(response.text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source",     required=True,  help="xmind_chunks.json")
    ap.add_argument("--output",     default="testset.json")
    ap.add_argument("--n",          type=int, default=20, help="Số câu hỏi cần tạo")
    ap.add_argument("--gemini_key", default=os.getenv("GEMINI_API_KEY"))
    ap.add_argument("--seed",       type=int, default=42)
    args = ap.parse_args()

    if not args.gemini_key:
        sys.exit("❌  Cần GEMINI_API_KEY")

    random.seed(args.seed)
    genai.configure(api_key=args.gemini_key)
    model = genai.GenerativeModel("gemini-2.5-flash-lite")

    print(f"📂  Loading chunks from {args.source}…")
    chunks = load_chunks(args.source)
    print(f"   Found {len(chunks)} chunks")

    # Ưu tiên chunks dài (nhiều thông tin hơn), rồi sample
    chunks.sort(key=len, reverse=True)
    sample = chunks[:min(args.n * 2, len(chunks))]  # lấy top 2x rồi random
    sample = random.sample(sample, min(args.n, len(sample)))

    testset = []
    print(f"\n  Generating {len(sample)} QA pairs with Gemini…")
    for i, chunk in enumerate(sample, 1):
        try:
            qa = gen_qa(chunk, model)
            qa["source_chunk"] = chunk
            testset.append(qa)
            print(f"    {i:>2}/{len(sample)}  Q: {qa['question'][:70]}…")

            if i < len(sample):
                time.sleep(4)

        except Exception as e:
            if "429" in str(e):
                print(f"    {i:>2}/{len(sample)}  ✗ Quota hit, waiting 10s...")
                time.sleep(10) # Wait longer if we hit a limit
            else:
                print(f"    {i:>2}/{len(sample)}  ✗ Error: {e}")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(testset, f, indent=2, ensure_ascii=False)
    print(f"\n  ✅  Saved {len(testset)} QA pairs → {args.output}")


if __name__ == "__main__":
    main()
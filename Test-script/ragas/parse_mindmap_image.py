"""
parse_mindmap_image.py — Dùng Gemini Vision đọc mindmap từ PNG/JPEG/PDF
rồi convert thành chunks để RAGAS evaluate

Usage:
    python parse_mindmap_image.py D:/mindmap_xmind.png
    python parse_mindmap_image.py D:/mindmap_export.pdf
"""
import os, sys, json, base64, re
from pathlib import Path
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))


def image_to_base64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("utf-8")


def extract_mindmap_from_image(file_path: str) -> list:
    path   = Path(file_path)
    suffix = path.suffix.lower()
    print(f"Reading mindmap: {path.name}")

    model  = genai.GenerativeModel("gemini-2.0-flash")
    prompt = """Đây là ảnh/PDF của một mindmap. Hãy:
1. Đọc toàn bộ nội dung trong mindmap (tất cả các node, nhánh)
2. Trả về dưới dạng JSON theo format sau:

{
  "root": "Tên chủ đề chính",
  "branches": [
    {
      "name": "Tên nhánh chính 1",
      "children": ["sub-node 1", "sub-node 2", "sub-node 3"]
    }
  ]
}

Đọc tất cả text trong ảnh, kể cả text nhỏ. Chỉ trả về JSON, không có text khác."""

    if suffix in (".jpg", ".jpeg", ".png", ".webp"):
        b64  = image_to_base64(path)
        mime = "image/jpeg" if suffix in (".jpg", ".jpeg") else f"image/{suffix[1:]}"
        response = model.generate_content([{"mime_type": mime, "data": b64}, prompt])
    elif suffix == ".pdf":
        print("   Uploading PDF to Gemini...")
        uploaded = genai.upload_file(str(path), mime_type="application/pdf")
        response = model.generate_content([uploaded, prompt])
    else:
        raise ValueError(f"Unsupported: {suffix}")

    raw = response.text.strip().replace("```json", "").replace("```", "").strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'\{[\s\S]*\}', raw)
        data  = json.loads(match.group()) if match else {}

    chunks = []
    root   = data.get("root", "Mindmap")
    for branch in data.get("branches", []):
        name     = branch.get("name", "")
        children = branch.get("children", [])
        chunk    = f"{root} > {name}: " + ", ".join(str(c) for c in children) if children else f"{root} > {name}"
        chunks.append(chunk)
        print(f"   + {name} ({len(children)} sub-nodes)")

    print(f"\nExtracted {len(chunks)} branches as chunks")
    return chunks


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_mindmap_image.py <image_or_pdf>")
        sys.exit(1)

    chunks = extract_mindmap_from_image(sys.argv[1])
    Path("xmind_chunks.json").write_text(
        json.dumps(chunks, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Saved {len(chunks)} chunks -> xmind_chunks.json")
    print("\nPreview:")
    for i, c in enumerate(chunks[:5]):
        print(f"  [{i+1}] {c[:90]}{'...' if len(c) > 90 else ''}")
    print("\nNext step: python compare_full.py --rag-id <id> --xmind-chunks xmind_chunks.json")
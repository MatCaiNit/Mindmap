import natural from 'natural';

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function requireString(val, name) {
  if (typeof val !== 'string' || !val.trim()) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return val.trim()
}

const tokenizer = new natural.WordTokenizer();

export function calculateMetrics(mindmap, rawPdfText, filename = "Document") {
    // Tự động tìm dữ liệu thực (Bóc vỏ nếu AI bọc trong 'root', 'data' hoặc 'mindmap')
    let rootNode = mindmap;
    if (mindmap?.root) rootNode = mindmap.root;
    else if (mindmap?.data) rootNode = mindmap.data;
    else if (Array.isArray(mindmap)) rootNode = mindmap[0];

    // Kiểm tra nếu rootNode vẫn rỗng
    if (!rootNode || (!rootNode.text && !rootNode.label && !rootNode.name && !rootNode.title)) {
        return { filename, metrics: { coverage: "0%" }, status: "EMPTY DATA" };
    }
    const root = Array.isArray(rootNode) ? rootNode[0] : rootNode;

    const nodes = flattenMindmap(root);
    
    // Nếu không trích xuất được node nào, trả về kết quả rỗng
    if (nodes.length === 0) {
        return {
            filename,
            metrics: { coverage: "0%", depth: 0, total_nodes: 0, branching_avg: "0", detail_richness: "0%" },
            status: "FAIL (No nodes found)"
        };
    }

    // --- 1. KEYWORD COVERAGE ---
    const safePdfText = (rawPdfText || "").toLowerCase();
    const pdfWords = tokenizer.tokenize(safePdfText) || [];
    const pdfKeywords = [...new Set(pdfWords.filter(w => w.length > 5))].slice(0, 100); 
    
    // Thêm check an toàn cho n.text
    const mindmapText = nodes.map(n => (n.text || "").toLowerCase()).join(' ');
    const coveredKeywords = pdfKeywords.length > 0 
        ? pdfKeywords.filter(kw => mindmapText.includes(kw))
        : [];
    
    const coverageScore = pdfKeywords.length > 0 
        ? (coveredKeywords.length / pdfKeywords.length) * 100 
        : 0;

    // --- 2. STRUCTURAL DENSITY ---
    const maxDepth = nodes.length > 0 ? Math.max(...nodes.map(n => n.depth || 0)) : 0;
    const totalNodes = nodes.length;
    const leafNodes = nodes.filter(n => n.isLeaf).length;
    
    // Tránh chia cho 0 nếu chỉ có 1 node
    const denominator = (totalNodes - leafNodes) || 1;
    const branchingFactor = (totalNodes - 1) / denominator;

    // --- 3. COHESION SCORE ---
    const detailNodes = nodes.filter(n => n.depth >= 4).length;
    const detailRatio = (detailNodes / totalNodes) * 100;

    return {
        filename, // Đã có biến này từ tham số hàm
        metrics: {
            coverage: `${coverageScore.toFixed(2)}%`,
            depth: maxDepth,
            total_nodes: totalNodes,
            branching_avg: branchingFactor.toFixed(2),
            detail_richness: `${detailRatio.toFixed(2)}%`
        },
        status: coverageScore > 70 && maxDepth >= 4 ? "PASS (Chuẩn)" : "WARNING (Cần đào sâu thêm)"
    };
}

//Chuyển cây thành mảng để tính toán
function flattenMindmap(node, depth = 0, result = []) {
    if (!node) return result;
    
    // AI có thể trả về text, label hoặc name. Chúng ta lấy cái nào có dữ liệu.
    const nodeText = node.text || node.label || node.name || node.title || "";
    const isLeaf = !node.children || node.children.length === 0;
    
    result.push({ text: nodeText, depth, isLeaf });
    
    if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => flattenMindmap(child, depth + 1, result));
    }
    return result;
}
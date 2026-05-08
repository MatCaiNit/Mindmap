import fs from 'fs';
import mammoth from 'mammoth';

// =====================================================================
// 1. CÁC HÀM XỬ LÝ TEXT VÀ TÍNH METRICS (Đã tối ưu cho cả bullet & khoảng trắng)
// =====================================================================

function parseWordTextToTree(text) {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const root = { text: "Root Document", children: [], depth: 0 };
    const stack = [{ node: root, indent: -1 }];

    for (const line of lines) {
        const spaceMatch = line.match(/^(\s*)/);
        let indentLength = spaceMatch ? spaceMatch[1].replace(/\t/g, '    ').length : 0;

        let cleanContent = line.trim();
        let bulletType = '';

        // Nhận diện ký tự list (•, o, , -, *, +)
        const bulletMatch = cleanContent.match(/^([•o\-\*\+])\s+/);
        if (bulletMatch) {
            bulletType = bulletMatch[1];
            cleanContent = cleanContent.substring(bulletMatch[0].length).trim();
        }

        // Fallback nếu mất khoảng trắng nhưng còn ký tự bullet
        if (indentLength === 0 && bulletType) {
            if (bulletType === '•') indentLength = 0;       // Level 0
            else if (bulletType === 'o') indentLength = 4;  // Level 1
            else if (bulletType === '') indentLength = 8;  // Level 2 trở đi
        }

        const newNode = { text: cleanContent, children: [], depth: 0 };

        while (stack.length > 1 && stack[stack.length - 1].indent >= indentLength) {
            stack.pop();
        }

        const parentItem = stack[stack.length - 1];
        newNode.depth = parentItem.node.depth + 1;
        parentItem.node.children.push(newNode);

        stack.push({ node: newNode, indent: indentLength });
    }

    return root;
}

function flattenMindmap(node, result = []) {
    if (!node) return result;
    const isLeaf = !node.children || node.children.length === 0;
    
    if (node.depth > 0) {
        result.push({ text: node.text, depth: node.depth, isLeaf });
    }
    
    if (node.children) {
        node.children.forEach(child => flattenMindmap(child, result));
    }
    return result;
}

function calculateWordMetrics(rawText, filename) {
    const tree = parseWordTextToTree(rawText);
    const nodes = flattenMindmap(tree);

    if (nodes.length === 0) {
        return { filename, status: "FAIL", message: "Không tìm thấy nội dung hợp lệ" };
    }

    const maxDepth = Math.max(...nodes.map(n => n.depth));
    const totalNodes = nodes.length;
    const leafNodes = nodes.filter(n => n.isLeaf).length;
    
    const parentNodesCount = totalNodes - leafNodes || 1; 
    const branchingFactor = totalNodes / parentNodesCount;

    const detailNodes = nodes.filter(n => n.depth >= 3).length;
    const detailRatio = (detailNodes / totalNodes) * 100;

    return {
        filename,
        status: "SUCCESS",
        metrics: {
            "Tổng số Node (Total Nodes)": totalNodes,
            "Độ sâu tối đa (Max Depth)": maxDepth,
            "Hệ số phân nhánh (Branching Avg)": branchingFactor.toFixed(2),
            "Độ chi tiết (Detail Richness)": `${detailRatio.toFixed(2)}%`
        },
        // tree: tree // Bỏ comment nếu muốn lấy cả cấu trúc JSON của cây
    };
}

// =====================================================================
// 2. HÀM ĐỌC FILE DOCX TỪ HỆ THỐNG VÀ PHÂN TÍCH
// =====================================================================

// =====================================================================
// 2. HÀM ĐỌC FILE DOCX TỪ HỆ THỐNG VÀ PHÂN TÍCH (ĐÃ SỬA LỖI)
// =====================================================================

export async function analyzeDocxFile(filePath) {
    try {
        console.log(`[System] Đang đọc file: ${filePath}...`);
        
        if (!fs.existsSync(filePath)) {
            throw new Error("File không tồn tại!");
        }

        // SỬA Ở ĐÂY: Dùng convertToHtml để giữ lại cấu trúc phân cấp (List) của Word
        const result = await mammoth.convertToHtml({ path: filePath });
        const html = result.value;

        if (!html || html.trim() === "") {
            throw new Error("File Word rỗng hoặc không chứa văn bản.");
        }

        // --- TRICK: Chuyển đổi HTML Hierarchy thành Indented Text (Văn bản thụt lề) ---
        let indent = 0;
        let indentedText = "";
        
        // Tách chuỗi theo các thẻ quyết định cấu trúc
        const tokens = html.split(/(<\/?ul>|<\/?ol>|<\/?li>|<\/?p>)/).filter(Boolean);
        
        for (const token of tokens) {
            if (token === "<ul>" || token === "<ol>") {
                indent++; // Đi vào cấp con
            } else if (token === "</ul>" || token === "</ol>") {
                indent--; // Trở ra cấp cha
            } else if (token === "<li>" || token === "<p>") {
                // Thêm dòng mới + khoảng trắng thụt lề (1 level = 4 spaces)
                // Math.max để đảm bảo text ngoài list (hoặc list cấp 1) nằm sát lề (0 space)
                indentedText += "\n" + " ".repeat(Math.max(0, indent - 1) * 4);
            } else if (token === "</li>" || token === "</p>") {
                // Đóng thẻ thì không làm gì
            } else {
                // Token này là text thực tế. Xóa các thẻ HTML rác (<strong>, <em>,...) nếu có
                indentedText += token.replace(/<[^>]+>/g, "");
            }
        }
        // -----------------------------------------------------------------------------

        // Chuyển bản text đã phục hồi thụt lề vào hàm tính Metrics
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
        const report = calculateWordMetrics(indentedText, fileName);

        // Bỏ comment dòng dưới nếu bạn muốn xem bản text đã được thụt lề chuẩn ra sao:
        // console.log("--- BẢN TEXT ĐÃ PHỤC HỒI ---\n", indentedText);

        return report;

    } catch (error) {
        console.error("[Lỗi] Xử lý file DOCX thất bại:", error.message);
        return { status: "ERROR", message: error.message };
    }
}
// =====================================================================
// 3. CHẠY THỬ NGHIỆM (TESTING)
// =====================================================================

// Giả sử bạn có file "test.docx" nằm cùng thư mục với script này
const testFilePath = "./PSO.docx"; 

analyzeDocxFile(testFilePath).then(report => {
    if (report && report.status === "SUCCESS") {
        console.log(`\n📊 BÁO CÁO CHẤT LƯỢNG SƠ ĐỒ CHO FILE: ${report.filename}`);
        console.table(report.metrics);
    }
});
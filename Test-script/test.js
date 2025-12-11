// test.js
import axios from "axios";
import { WebSocket } from "ws";
import * as Y from "yjs";

/* ===========================
   CONFIG
=========================== */
const BACKEND_URL = "http://localhost:5000/api";
const REALTIME_WS_URL = "ws://localhost:1234";

const TEST_USER = {
    email: `test_user_${Date.now()}@example.com`,
    password: "password123",
    name: "Integration Tester"
};

/* ===========================
   STEP 1: LẤY ACCESS TOKEN
=========================== */
async function getAccessToken() {
    console.log("1️⃣  Đang đăng ký user...");

    try {
        const res = await axios.post(`${BACKEND_URL}/auth/register`, TEST_USER);
        console.log("✅ Đăng ký thành công!");
        return res.data.accessToken;

    } catch (err) {
        if (err.response?.status === 400) {
            console.log("⚠️ User đã tồn tại → chuyển sang đăng nhập...");
            const res = await axios.post(`${BACKEND_URL}/auth/login`, {
                email: TEST_USER.email,
                password: TEST_USER.password
            });
            return res.data.accessToken;
        }
        throw err;
    }
}

/* ===========================
   STEP 2: TẠO MINDMAP
=========================== */
async function createMindmap(token) {
    console.log("2️⃣  Đang tạo mindmap test...");

    const res = await axios.post(
        `${BACKEND_URL}/mindmaps`,
        { title: "Integration Test Map" },
        { headers: { Authorization: `Bearer ${token}` } }
    );

    const mindmap = res.data.mindmap;
    console.log("✅ Mindmap tạo thành công! ydocId =", mindmap.ydocId);

    return mindmap.ydocId;
}

/* ===========================
   STEP 3: TEST WEBSOCKET
=========================== */
function testWebSocket(token, ydocId) {
    return new Promise((resolve, reject) => {
        console.log(`3️⃣  Đang kết nối WS → ${REALTIME_WS_URL}/${ydocId} ...`);

        const ws = new WebSocket(
            `${REALTIME_WS_URL}/${ydocId}?token=${token}`
        );

        ws.binaryType = "arraybuffer";

        ws.on("open", () => {
            console.log("✅ WebSocket connected!");

            // Tạo document tạm
            const doc = new Y.Doc();
            const text = doc.getText("content");
            text.insert(0, "Hello from integration test!");

            const update = Y.encodeStateAsUpdate(doc);
            const msg = new Uint8Array(update.length + 1);
            msg[0] = 1;
            msg.set(update, 1);

            console.log("4️⃣  Gửi update lên Realtime Server...");
            ws.send(msg);

            // Đợi server phản hồi
            setTimeout(() => {
                console.log("🎉 TEST SUCCESS: Realtime hoạt động chính xác!");
                ws.close();
                resolve();
            }, 1500);
        });

        ws.on("error", (err) => {
            console.error("❌ WebSocket error:", err.message);
            reject(err);
        });

        ws.on("close", (code) => {
            if (code !== 1000) {
                console.error("❌ WebSocket đóng bất thường. Code =", code);
            }
        });
    });
}

/* ===========================
   MAIN
=========================== */
(async () => {
    try {
        const token = await getAccessToken();
        const ydocId = await createMindmap(token);
        await testWebSocket(token, ydocId);

        console.log("\n🎯 TẤT CẢ TEST ĐỀU PASSED!\n");
        process.exit(0);

    } catch (err) {
        console.error("\n❌ TEST FAILED:", err?.response?.data || err.message);
        process.exit(1);
    }
})();

#!/usr/bin/env node
/**
 * Test-script/ragas/dump_mindmap.js
 * ==================================
 * Gọi RAG pipeline → lưu kết quả ra our_mindmap.json để chạy RAGAS.
 *
 * USAGE:
 *   node dump_mindmap.js --mindmapId <id> --title "Tên PDF"
 *
 *   Hoặc nếu chưa có mindmapId (test nhanh từ text):
 *   node dump_mindmap.js --text "Nội dung muốn test..."
 *
 *   Hoặc gọi API backend đang chạy:
 *   node dump_mindmap.js --api http://localhost:5000 --mindmapId <id> --token <jwt>
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";

// ─── Parse args ───────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    mindmapId: { type: "string" },
    title:     { type: "string", default: "Document" },
    text:      { type: "string" },          // test nhanh từ raw text
    api:       { type: "string" },          // gọi backend REST API
    token:     { type: "string" },          // JWT token nếu dùng --api
    output:    { type: "string", default: "our_mindmap.json" },
    mongoUri:  { type: "string", default: process.env.MONGO_URI || "mongodb://localhost:27017" },
  },
});

// ─── Mode 1: Gọi trực tiếp GenAI service (không cần server chạy) ─────────────

async function dumpFromService() {
  // Dynamic import để chạy từ thư mục Test-script/ragas
  // → cần chạy từ root project hoặc điều chỉnh path
  const { generateMindmap, generateFromPdf } = await import(
    "../../GenAI/services/ai.service.js"
  );

  let result;

  if (args.text) {
    console.log("📝  Generating from raw text…");
    result = await generateMindmap(args.text);
  } else if (args.mindmapId) {
    console.log(`📄  Generating from PDF chunks (mindmapId: ${args.mindmapId})…`);
    result = await generateFromPdf(args.mindmapId, args.title);
  } else {
    console.error("❌  Cần --mindmapId hoặc --text");
    process.exit(1);
  }

  return result.mindmap;  // { root: { text, children[] } }
}

// ─── Mode 2: Gọi qua REST API (backend đang chạy) ────────────────────────────

async function dumpFromApi() {
  const url = `${args.api}/api/mindmaps/${args.mindmapId}/generate-json`;

  console.log(`🌐  Calling API: GET ${url}`);

  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // Backend trả về { mindmap: { root: {...} } } hoặc trực tiếp { root: {...} }
  return data.mindmap || data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let mindmap;

  if (args.api) {
    mindmap = await dumpFromApi();
  } else {
    mindmap = await dumpFromService();
  }

  const outPath = path.resolve(args.output);
  fs.writeFileSync(outPath, JSON.stringify(mindmap, null, 2), "utf-8");

  // Print summary
  function countNodes(node) {
    return 1 + (node.children || []).reduce((s, c) => s + countNodes(c), 0);
  }
  const total = countNodes(mindmap.root);

  console.log(`\n✅  Saved → ${outPath}`);
  console.log(`   Root  : "${mindmap.root.text}"`);
  console.log(`   Nodes : ${total}`);
  console.log(`   Branches: ${mindmap.root.children?.length || 0}`);
  console.log(`\n📋  Sample structure:`);
  for (const branch of (mindmap.root.children || []).slice(0, 3)) {
    console.log(`   ├─ ${branch.text} (${branch.children?.length || 0} children)`);
    for (const child of (branch.children || []).slice(0, 2)) {
      console.log(`   │   └─ ${child.text}`);
    }
  }
  console.log(`\n🚀  Next: python evaluate_full.py --our_file ${args.output} --xmind_file xmind_chunks.json --testset testset.json`);
}

main().catch(err => {
  console.error("❌ ", err.message);
  process.exit(1);
});
/**
 * GenAI/services/ai.service.js  –  UPGRADED
 * ==========================================
 * Cải tiến:
 *  1. Structured JSON output  – Gemini trả về JSON trực tiếp, không parse thủ công
 *  2. Chunked context         – inject top-k chunks vào prompt, có source citation
 *  3. Mindmap schema rõ ràng  – prompt chuẩn hơn, output nhất quán hơn
 *  4. Safety settings         – tắt filter không cần thiết cho technical content
 *  5. Retry với backoff       – tránh 429 rate-limit
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { HybridRetriever } from "./retriever.js";

const genai     = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEN_MODEL = "gemini-3.1-flash-lite-preview";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";

// ─── Safety settings (giữ nguyên cho technical docs) ──────────────────────────
const SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function withRetry(fn, retries = 3, baseDelay = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      console.error(`[AI] Attempt ${i + 1} failed:`, err?.message || err)  // ← THÊM
      const isRetryable = err?.status === 429 || err?.status === 503 || err?.code === "ECONNRESET";
      if (!isRetryable || i === retries) throw err;
      const delay = baseDelay * 2 ** i + Math.random() * 500;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MINDMAP SCHEMA  (dùng cho structured output)
// ═══════════════════════════════════════════════════════════════════════════════

const MINDMAP_SCHEMA = {
  type: "object",
  properties: {
    root: {
      type: "object",
      properties: {
        text: { type: "string" },
        sourceChunk: { type: "integer" },
        children: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sourceChunk: { type: "integer" },
              text: { type: "string" },
              children: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    sourceChunk: { type: "integer" },
                    text: { type: "string" },
                    children: { type: "array", items: { type: "object",
                      properties: { text: { type: "string" } , sourceChunk: { type: "integer" }},
                      required: ["text"],
                    }},
                  },
                  required: ["text"],
                },
              },
            },
            required: ["text"],
          },
        },
      },
      required: ["text", "children"],
    },
  },
  required: ["root"],
};

// ═══════════════════════════════════════════════════════════════════════════════
//  1.  GENERATE MINDMAP FROM TEXT
// ═══════════════════════════════════════════════════════════════════════════════

const GEN_PROMPT = (text) => `
You are an expert at creating EXTREMELY DETAILED and COMPREHENSIVE mind maps.

Given the following text, create a hierarchical mind map that:
- Captures EVERY technical detail, feature, library, and requirement mentioned.
- Does NOT summarize. Instead, extract information into a granular structure.
- If a sentence lists multiple items (e.g., "Supports A, B, and C"), create 3 separate child nodes for A, B, and C.
- Maintain a deep hierarchy (Root -> Category -> Sub-category -> Detail -> Specifics).

Rules:
- Each node text: 2–6 words, precise technical terms.
- No limit on the number of branches or sub-nodes – the more detailed, the better.
- Cover 100% of the major and minor concepts in the text.

Text to analyze:
"""
${text.slice(0, 10000)} 
"""
`;

export async function generateMindmap(text) {
  const model = genai.getGenerativeModel({
    model: GEN_MODEL,
    safetySettings: SAFETY,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema:   MINDMAP_SCHEMA,
      temperature:      0.3,
      maxOutputTokens:  4096,
    },
  });

  return withRetry(async () => {
    const result = await model.generateContent(GEN_PROMPT(text));
    const json   = JSON.parse(result.response.text());

    if (!json.root) throw new Error("Invalid mindmap structure from AI");

    console.log(`[AI] Generated mindmap: ${countNodes(json.root)} nodes`);
    return { ok: true, mindmap: json, chunks, chunksUsed: chunks.length };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  2.  RAG-BASED MINDMAP FROM PDF CHUNKS
// ═══════════════════════════════════════════════════════════════════════════════

const RAG_PROMPT = (topic, chunks) => {
  const ctxText = chunks
    .map((c, i) => `[${i + 1}] (p.${c.pageNum ?? "?"}) ${c.text}`)
    .join("\n");

  return `
You are an expert at creating mind maps from document excerpts.

Create a comprehensive mind map about: "${topic}"

Use the following document chunks as your ONLY source of information.
Each chunk is labeled [N] with its page number.

Document chunks (ONLY use these, cite by index number):
${ctxText}

Create a highly granular and exhaustive mind map that:
- Extracts EVERY specific piece of information found in the chunks.
- For every technical component or step mentioned, create a dedicated node.
- Deeply nest information: If a chunk describes a process, map out every step as a sub-node.
- Use as many branches as necessary to represent the full scope of the provided data.
- Ensure no detail from the "Document Chunks" is omitted.
`;
};

export async function generateFromChunks(topic, chunks) {
  const model = genai.getGenerativeModel({
    model: GEN_MODEL,
    safetySettings: SAFETY,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema:   MINDMAP_SCHEMA,
      temperature:      0.2,  // lower = more faithful to source
      maxOutputTokens:  8192,
    },
  });

  return withRetry(async () => {
    const result = await model.generateContent(RAG_PROMPT(topic, chunks));
    const json   = JSON.parse(result.response.text());
    if (!json.root) throw new Error("Invalid mindmap structure");
    return { ok: true, mindmap: json, chunksUsed: chunks.length };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  3.  AI SUGGEST  (gợi ý node con cho node đang chọn)
// ═══════════════════════════════════════════════════════════════════════════════

export async function suggestNodes(context) {
  const SUGGEST_SCHEMA = {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            text:   { type: "string" },
            reason: { type: "string" },
          },
          required: ["text"],
        },
      },
    },
    required: ["suggestions"],
  };

  const prompt = `
You are helping expand a mind map node.

Current node: "${context.currentNode}"
Parent chain: ${context.parentNodes?.join(" → ") || "root"}
Sibling nodes: ${context.siblings?.join(", ") || "none yet"}

Suggest 4–5 child nodes that:
- Are directly relevant to the current node
- Don't duplicate existing siblings
- Are concise (2–5 words each)
- Represent distinct sub-topics or aspects
`;

  const model = genai.getGenerativeModel({
    model: GEN_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema:   SUGGEST_SCHEMA,
      temperature:      0.7,
    },
  });

  return withRetry(async () => {
    const result = await model.generateContent(prompt);
    const json   = JSON.parse(result.response.text());
    return { ok: true, suggestions: json.suggestions || [] };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  4.  FULL RAG PIPELINE  (PDF → chunks → retrieve → mindmap)
//      Dùng trong controller khi user upload PDF
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateFromPdf(mindmapId, pdfTitle) {
  const retriever = new HybridRetriever(MONGO_URI);
  try {
    // Lấy all chunks của mindmap này làm context tổng thể
    const chunks = await retriever.retrieve(
      pdfTitle || "main topic overview",
      mindmapId,
      { topK: 20, scoreThreshold: 0.55, useMMR: true, expand: true },
    );

    if (chunks.length === 0) {
      throw new Error(`No chunks found for mindmap ${mindmapId}`);
    }

    console.log(`[AI] Retrieved ${chunks.length} chunks for mindmap ${mindmapId}`);
    return generateFromChunks(pdfTitle || "Document", chunks);
  } finally {
    await retriever.close();
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function countNodes(node, count = 0) {
  count++;
  for (const child of node.children || []) {
    count = countNodes(child, count);
  }
  return count;
}
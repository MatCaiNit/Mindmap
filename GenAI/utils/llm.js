// GenAI/utils/llm.js — provider-agnostic streaming text generator.
//
//   LLM_PROVIDER=gemini  → Google Gemini (fast, cloud)
//   LLM_PROVIDER=ollama  → local Ollama  (default; original behaviour)
//
// streamLLM() yields plain text deltas. Callers keep their own line-buffer /
// <think> / markdown parsing exactly as before — only the transport changes.
//
// Env:
//   LLM_PROVIDER   "gemini" | "ollama"            (default "ollama")
//   GEMINI_API_KEY <key>
//   GEMINI_MODEL   default "gemini-2.5-flash"     (or "gemini-3.1-flash-lite")
//   OLLAMA_URL     default "http://localhost:11434"
//   OLLAMA_GEN_MODEL default "qwen3:8b"

const OLLAMA_BASE  = process.env.OLLAMA_URL       || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_GEN_MODEL || "qwen3:8b";
const PROVIDER     = (process.env.LLM_PROVIDER    || "ollama").toLowerCase();
const GEMINI_KEY   = process.env.GEMINI_API_KEY   || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL     || "gemini-2.5-flash";

export function llmProvider() {
  return PROVIDER;
}

// opts: { signal, maxTokens=4000, temperature=0.2, model, numCtx=8192 }
export async function* streamLLM(prompt, opts = {}) {
  const {
    signal,
    maxTokens = 4000,
    temperature = 0.2,
    model,
    numCtx = 8192,
  } = opts;
  const dec = new TextDecoder();

  // ─── Gemini ────────────────────────────────────────────────────────────────
  if (PROVIDER === "gemini") {
    const mdl = model || GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          // NOTE: no stopSequences here. Gemini Flash inserts blank lines
          // between headings; a "\n\n\n" stop would truncate the map after
          // the first branch. Ollama keeps its stop (set below).
          // Disable 2.5-flash "thinking" → big latency cut. Harmless on models
          // that ignore it; remove this line if a model rejects the field.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const reader = res.body.getReader();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue; // skip SSE blank/event lines
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const t =
            j.candidates?.[0]?.content?.parts
              ?.map((p) => p.text || "")
              .join("") || "";
          if (t) yield t;
        } catch (_) {
          /* partial / non-JSON keep-alive line */
        }
      }
    }
    return;
  }

  // ─── Ollama (default) — preserves original NDJSON behaviour ────────────────
  const mdl = model || OLLAMA_MODEL;
  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: mdl,
      prompt,
      stream: true,
      options: {
        temperature,
        num_ctx: numCtx,
        num_predict: maxTokens,
        num_gpu: 99,
        num_thread: 4,
        stop: ["\n\n\n"],
      },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const reader = res.body.getReader();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const jl = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!jl.trim()) continue;
      try {
        const o = JSON.parse(jl);
        if (o.thinking) continue;
        if (o.response) yield o.response;
        if (o.done) return;
      } catch (_) {
        /* skip malformed line */
      }
    }
  }
}
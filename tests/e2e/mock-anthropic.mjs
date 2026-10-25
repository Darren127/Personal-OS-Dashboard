// TEST-ONLY fake of the Claude Messages API (streaming), used by the E2E
// suite so the app's real SDK, streaming, tool loop, and UI can be exercised
// without a real API key or cost. It is never used by the app itself.
//
// It answers by keyword in the user's latest message:
//   "bank"     → looks up overdue tasks, proposes creating a task
//   "remember" → proposes a memory
//   anything else → a short plan in markdown
// and checks that each request carries the expected key.
import http from "node:http";

const PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? 4100);
const EXPECTED_AUTH = `Bearer ${process.env.MOCK_EXPECTED_KEY ?? "sk-ant-e2e-mock-key"}`;
let n = 0;

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
}

function streamMessage(res, blocks, stopReason) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  sse(res, "message_start", {
    message: {
      id: `msg_mock_${++n}`, type: "message", role: "assistant", model: "claude-opus-5-5", content: [],
      stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 2400, output_tokens: 1, cache_read_input_tokens: 1800, cache_creation_input_tokens: 0 },
    },
  });
  blocks.forEach((b, index) => {
    if (b.type === "thinking") {
      sse(res, "content_block_start", { index, content_block: { type: "thinking", thinking: "", signature: "" } });
      if (b.text) sse(res, "content_block_delta", { index, delta: { type: "thinking_delta", thinking: b.text } });
      sse(res, "content_block_delta", { index, delta: { type: "signature_delta", signature: "mock-signature" } });
    } else if (b.type === "text") {
      sse(res, "content_block_start", { index, content_block: { type: "text", text: "" } });
      for (const chunk of b.text.match(/.{1,12}/gs)) sse(res, "content_block_delta", { index, delta: { type: "text_delta", text: chunk } });
    } else if (b.type === "tool_use") {
      sse(res, "content_block_start", { index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      sse(res, "content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    sse(res, "content_block_stop", { index });
  });
  sse(res, "message_delta", { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 180 } });
  sse(res, "message_stop", {});
  res.end();
}

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url !== "/v1/messages" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.authorization !== EXPECTED_AUTH) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "unexpected credentials" } }));
      return;
    }
    const params = JSON.parse(body || "{}");
    const lastUser = [...(params.messages ?? [])].reverse().find((m) => m.role === "user");
    const isToolResult = Array.isArray(lastUser?.content) && lastUser.content.some((c) => c.type === "tool_result");
    const userText = JSON.stringify(lastUser?.content ?? "");

    if (isToolResult) {
      const queued = lastUser.content.map((c) => c.content).join(" ").includes("awaiting_user_approval");
      return streamMessage(res, [
        { type: "thinking", text: "" },
        { type: "text", text: queued ? "I've queued that — it's **waiting for your approval** in the card above." : "Done — that's taken care of." },
      ], "end_turn");
    }
    if (/bank/i.test(userText)) {
      return streamMessage(res, [
        { type: "thinking", text: "Checking what's overdue before adding anything." },
        { type: "tool_use", id: `toolu_s${n}`, name: "search_tasks", input: { due: "overdue" } },
        { type: "tool_use", id: `toolu_c${n}`, name: "create_task", input: { title: "Call the bank about the mortgage rate", priority: "high" } },
      ], "tool_use");
    }
    if (/remember/i.test(userText)) {
      return streamMessage(res, [
        { type: "tool_use", id: `toolu_m${n}`, name: "propose_memory", input: { category: "working_style", content: "Does deep work best before noon", confidence: "confirmed", evidence: "Said so directly", importance: 4 } },
      ], "tool_use");
    }
    return streamMessage(res, [{ type: "text", text: "Here's a plan:\n\n1. Finish the most important task first.\n2. Then the quick ones." }], "end_turn");
  });
}).listen(PORT, "127.0.0.1", () => console.log(`mock anthropic on :${PORT}`));

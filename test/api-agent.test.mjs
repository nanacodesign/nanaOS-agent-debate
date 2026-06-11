// API-agent integration test. Boots the real server in a temporary working
// directory (so the local agent config and runs/ stay untouched) plus a mock
// OpenAI-compatible endpoint, then drives one debate over the HTTP surface.
// Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import http from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "server.js");
const HOST = "127.0.0.1";
const PORT = 4192;
const MOCK_PORT = 4193;
const TEST_KEY = "test-key-value";

let child;
let mockServer;
let workDir;
const mockRequests = [];

function request(path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORT, path, method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request("/api/status");
      if (res.status === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("server did not start in time");
}

before(async () => {
  mockServer = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      mockRequests.push({
        url: req.url,
        authorization: req.headers.authorization || "",
        body: JSON.parse(raw || "{}"),
      });
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":" world"}}]}\n\n');
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  await new Promise((resolve) => mockServer.listen(MOCK_PORT, HOST, resolve));

  workDir = mkdtempSync(join(tmpdir(), "agent-debate-api-test-"));
  writeFileSync(
    join(workDir, "agent-debate.config.json"),
    JSON.stringify({
      agents: [
        {
          id: "mock",
          name: "Mock API",
          type: "api",
          baseUrl: `http://${HOST}:${MOCK_PORT}/v1`,
          model: "mock-model",
          apiKeyEnv: "AGENT_DEBATE_TEST_KEY",
          enabled: true,
        },
      ],
    }),
  );

  child = spawn(process.execPath, [serverPath], {
    cwd: workDir,
    env: {
      ...process.env,
      AGENT_DEBATE_HOST: HOST,
      AGENT_DEBATE_PORT: String(PORT),
      AGENT_DEBATE_TEST_KEY: TEST_KEY,
      NANAOS_DESIGN_SYSTEM_PATH: "/tmp/agent-debate-nonexistent-ds",
      BROWSER: "none",
    },
    stdio: "ignore",
  });
  await waitForServer();
});

after(() => {
  if (child) child.kill("SIGKILL");
  if (mockServer) mockServer.close();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

test("API agents are reported with their type and connection state", async () => {
  const res = await request("/api/status");
  assert.equal(res.status, 200);
  const agent = JSON.parse(res.body).agents.find((item) => item.id === "mock");
  assert.ok(agent, "expected the mock API agent in /api/status");
  assert.equal(agent.type, "api");
  assert.equal(agent.connected, true);
  assert.equal(agent.model, "mock-model");
  // Only the env var NAME may appear in the status payload, never the key.
  assert.equal(agent.apiKeyEnv, "AGENT_DEBATE_TEST_KEY");
  assert.ok(!res.body.includes(TEST_KEY), "the API key value must never be reported");
});

test("a debate streams the API agent response end to end", async () => {
  const res = await request("/api/debate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "Test topic",
      workflow: ["Summarize the topic in one line."],
      language: "English",
      projectPath: workDir,
    }),
  });

  assert.equal(res.status, 200);
  const events = res.body
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  const agentDone = events.find((event) => event.type === "agent-done");
  assert.ok(agentDone, "expected an agent-done event");
  assert.equal(agentDone.response, "Hello world");
  assert.ok(events.some((event) => event.type === "stream" && event.text === "Hello"));
  assert.ok(events.some((event) => event.type === "done"));

  const call = mockRequests.at(-1);
  assert.equal(call.url, "/v1/chat/completions");
  assert.equal(call.authorization, `Bearer ${TEST_KEY}`);
  assert.equal(call.body.model, "mock-model");
  assert.equal(call.body.stream, true);
});

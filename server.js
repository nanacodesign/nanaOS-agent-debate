import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { appendFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const publicDir = join(root, "public");
const runsDir = join(root, "runs");
const agentConfigPath = join(root, "agent-debate.config.json");
const defaultProjectPath = resolve(process.env.AGENT_DEBATE_DEFAULT_PROJECT_PATH || root);
const nvmNodeVersionsDir = join(homedir(), ".nvm", "versions", "node");
const nvmBinDirs = existsSync(nvmNodeVersionsDir)
  ? readdirSync(nvmNodeVersionsDir).map((version) => join(nvmNodeVersionsDir, version, "bin"))
  : [];
const cliBinDirs = [
  ...String(process.env.AGENT_DEBATE_EXTRA_PATHS || "")
    .split(":")
    .map((dir) => dir.trim())
    .filter(Boolean),
  join(homedir(), ".local", "bin"),
  ...nvmBinDirs,
  "/opt/homebrew/bin",
  "/usr/local/bin",
];
const host = process.env.AGENT_DEBATE_HOST || "127.0.0.1";
const port = (() => {
  const value = process.env.AGENT_DEBATE_PORT || process.env.PORT || "4177";
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 4177;
})();

process.env.PATH = [
  ...cliBinDirs.filter((dir) => existsSync(dir)),
  process.env.PATH || "",
]
  .filter(Boolean)
  .join(":");

mkdirSync(runsDir, { recursive: true });
let appProcess = null;
let appRunStatus = {
  state: "stopped",
  projectPath: "",
  url: "",
  pid: null,
  error: "",
  output: "",
};

const agentInputModes = new Set(["stdin", "stdin-last-message-file", "none"]);
const defaultAgents = [
  {
    id: "gemini",
    name: "Gemini",
    command: "gemini",
    args: ["-p", "", "--output-format", "text", "--approval-mode", "plan", "--skip-trust"],
    input: "stdin",
  },
  {
    id: "claude",
    name: "Claude",
    command: "claude",
    args: [
      "-p",
      "--output-format",
      "text",
      "--input-format",
      "text",
      "--permission-mode",
      "plan",
      "--tools",
      "",
      "--no-session-persistence",
    ],
    input: "stdin",
  },
  {
    id: "codex",
    name: "Codex",
    command: "codex",
    args: [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--color",
      "never",
      "-s",
      "read-only",
      "-",
    ],
    input: "stdin-last-message-file",
    enabled: true,
  },
];

const debateRounds = [
  {
    round: 1,
    title: "Independent positions",
    phase: "state your own position without seeing the other models",
    instruction:
      "This is the first round. You must not refer to other agents because their views are intentionally hidden from you. Present your own clear position, assumptions, and recommended direction.",
  },
  {
    round: 2,
    title: "Reflection after reading all positions",
    phase: "read every opening position and refine your own view",
    instruction:
      "This is the second round. Read every agent's first-round position, identify where your view changed or became firmer, and explain your updated thinking.",
  },
  {
    round: 3,
    title: "Final debate",
    phase: "debate once more after the second-round refinements",
    instruction:
      "This is the third round. Debate once more using the first and second rounds. Be direct about remaining disagreements, tradeoffs, and the proposal you would now support.",
  },
];

const debateRoundCount = debateRounds.length;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function readJsonBody(req, maxBytes = 1_000_000) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";
    let size = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        if (rejected) return;
        rejected = true;
        rejectBody(new Error("Request body is too large."));
        return;
      }
      raw += chunk.toString();
    });

    req.on("error", (error) => {
      if (rejected) return;
      rejected = true;
      rejectBody(error);
    });

    req.on("end", () => {
      if (rejected) return;
      try {
        resolveBody(JSON.parse(raw || "{}"));
      } catch {
        rejectBody(new Error("Invalid JSON."));
      }
    });
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(html);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toSlug(value, fallback) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function normalizeAgentConfig(agent, index) {
  const name = String(agent?.name || `Agent ${index + 1}`).trim();
  const command = String(agent?.command || "").trim();
  const input = agentInputModes.has(agent?.input) ? agent.input : "stdin";
  const args = Array.isArray(agent?.args) ? agent.args.map((arg) => String(arg)) : [];

  return {
    id: toSlug(agent?.id || name, `agent-${index + 1}`),
    name,
    command,
    args,
    input,
    enabled: agent?.enabled !== false,
  };
}

function normalizeAgents(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source
    .map((agent, index) => normalizeAgentConfig(agent, index))
    .filter((agent) => agent.name && agent.command)
    .map((agent, index) => {
      let id = agent.id || `agent-${index + 1}`;
      while (seen.has(id)) id = `${agent.id || "agent"}-${index + 1}`;
      seen.add(id);
      return { ...agent, id };
    });
}

function readAgents() {
  if (!existsSync(agentConfigPath)) {
    return normalizeAgents(defaultAgents);
  }

  try {
    const config = JSON.parse(readFileSync(agentConfigPath, "utf8"));
    const agents = normalizeAgents(config.agents);
    return agents.length ? agents : normalizeAgents(defaultAgents);
  } catch {
    return normalizeAgents(defaultAgents);
  }
}

function writeAgents(agents) {
  const normalized = normalizeAgents(agents);
  if (!normalized.length) {
    throw new Error("Add at least one agent with a name and command.");
  }

  writeFileSync(
    agentConfigPath,
    `${JSON.stringify(
      {
        agents: normalized,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return normalized;
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line) {
  const cells = parseTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let inCode = false;
  let codeLines = [];
  let listType = "";

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = "";
  };

  const renderTable = (startIndex) => {
    const headers = parseTableRow(lines[startIndex]);
    let index = startIndex + 2;
    const rows = [];

    while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
      rows.push(parseTableRow(lines[index]));
      index += 1;
    }

    html.push("<table><thead><tr>");
    for (const header of headers) {
      html.push(`<th>${renderInlineMarkdown(header)}</th>`);
    }
    html.push("</tr></thead><tbody>");
    for (const row of rows) {
      html.push("<tr>");
      for (const cell of row) {
        html.push(`<td>${renderInlineMarkdown(cell)}</td>`);
      }
      html.push("</tr>");
    }
    html.push("</tbody></table>");
    return index - 1;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith("```")) {
      closeList();
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    if (index + 1 < lines.length && line.includes("|") && isTableDivider(lines[index + 1])) {
      closeList();
      index = renderTable(index);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  closeList();

  return html.join("\n");
}

function resolveRunFile(file) {
  const cleanFile = decodeURIComponent(String(file || "")).trim();
  if (!cleanFile.endsWith(".md") || cleanFile.includes("/") || cleanFile.includes("\\")) {
    throw new Error("Invalid run file.");
  }

  const fullPath = resolve(join(runsDir, cleanFile));
  if (fullPath !== runsDir && !fullPath.startsWith(runsDir + sep)) {
    throw new Error("Invalid run file.");
  }
  if (!existsSync(fullPath)) {
    throw new Error("Run file not found.");
  }

  return { file: cleanFile, fullPath };
}

function commandPath(command) {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function resolveProjectPath(projectPath) {
  const candidate = String(projectPath || defaultProjectPath).trim() || defaultProjectPath;
  const resolved = resolve(candidate);
  const stat = statSync(resolved);

  if (!stat.isDirectory()) {
    throw new Error("Project path must be a directory.");
  }

  return resolved;
}

function detectLocalUrl(text) {
  const cleanText = text.replace(/\x1b\[[0-9;]*m/g, "");
  const match = cleanText.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+[^\s]*/);
  if (!match) return "";
  return match[0].replace("0.0.0.0", "127.0.0.1");
}

function rememberAppOutput(text) {
  const output = `${appRunStatus.output}${text}`;
  appRunStatus.output = output.slice(-4000);

  const url = detectLocalUrl(text);
  if (url) {
    appRunStatus.url = url;
    appRunStatus.state = "running";
  }
}

function currentAppStatus() {
  return {
    state: appRunStatus.state,
    projectPath: appRunStatus.projectPath,
    url: appRunStatus.url,
    pid: appRunStatus.pid,
    error: appRunStatus.error,
  };
}

function startApp(projectPath) {
  const cwd = resolveProjectPath(projectPath);

  if (appProcess && appProcess.exitCode === null) {
    return currentAppStatus();
  }

  appRunStatus = {
    state: "starting",
    projectPath: cwd,
    url: "",
    pid: null,
    error: "",
    output: "",
  };

  const child = spawn("npm", ["run", "dev"], {
    cwd,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  appProcess = child;
  appRunStatus.pid = child.pid;

  setTimeout(() => {
    if (appProcess === child && appRunStatus.state === "starting") {
      appRunStatus.state = "running";
    }
  }, 2500).unref();

  child.stdout.on("data", (chunk) => {
    rememberAppOutput(chunk.toString());
  });

  child.stderr.on("data", (chunk) => {
    rememberAppOutput(chunk.toString());
  });

  child.on("error", (error) => {
    appRunStatus.state = "stopped";
    appRunStatus.error = error.message;
    appRunStatus.pid = null;
    appProcess = null;
  });

  child.on("close", (code, signal) => {
    if (appProcess !== child) return;

    const wasStopping = appRunStatus.state === "stopping";
    appRunStatus.state = "stopped";
    appRunStatus.pid = null;
    appRunStatus.url = "";
    appRunStatus.error =
      wasStopping || signal === "SIGTERM" || signal === "SIGKILL"
        ? ""
        : code === 0
          ? ""
          : appRunStatus.output.trim() || `App exited with code ${code}.`;
    appProcess = null;
  });

  return currentAppStatus();
}

function stopApp() {
  if (!appProcess || appProcess.exitCode !== null) {
    appProcess = null;
    appRunStatus = { ...appRunStatus, state: "stopped", url: "", pid: null, error: "" };
    return currentAppStatus();
  }

  const child = appProcess;
  appRunStatus.state = "stopping";
  child.kill("SIGTERM");

  setTimeout(() => {
    if (appProcess === child && child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }, 5000).unref();

  return currentAppStatus();
}

function getStatus(agents = readAgents()) {
  return agents.map((agent) => {
    const path = commandPath(agent.command);
    return {
      id: agent.id,
      name: agent.name,
      command: agent.command,
      args: agent.args,
      input: agent.input,
      enabled: agent.enabled,
      connected: Boolean(path),
      path,
    };
  });
}

function trimContext(transcript, maxChars) {
  if (transcript.length <= maxChars) return transcript;
  const marker = "\n\n[... earlier transcript omitted ...]\n\n";
  const keep = Math.max(maxChars - marker.length, 0);
  const head = Math.floor(keep * 0.25);
  const tail = keep - head;
  return transcript.slice(0, head) + marker + transcript.slice(-tail);
}

function buildPrompt({ topic, context, language, projectPath, roundConfig, agentName, participantNames, transcript }) {
  return `You are ${agentName}, one of the AI agents in a structured debate.

Topic:
${topic}

Project path:
${projectPath}

Imported context:
${context.trim() || "(No imported context.)"}

Debate setup:
- Participants: ${participantNames}.
- Current round: ${roundConfig.round} of ${debateRoundCount}: ${roundConfig.title}.
- Your phase: ${roundConfig.phase}.
- Reply in ${language}.
- Do not use tools, browse, edit files, or run commands.
- Be concise: 4 to 8 bullet points, then one short conclusion.
- If you disagree, make the disagreement specific and useful.

Round instruction:
${roundConfig.instruction}

Transcript so far:
${transcript.trim() || "(No prior transcript.)"}

Now write ${agentName}'s contribution for round ${roundConfig.round}.`;
}

function buildSummaryPrompt({ topic, context, language, projectPath, participantNames, transcript }) {
  return `You are the moderator and final synthesizer for a completed multi-agent debate.

Topic:
${topic}

Project path:
${projectPath}

Imported context:
${context.trim() || "(No imported context.)"}

Debate transcript:
${transcript.trim() || "(No debate transcript.)"}

Write the final synthesis in ${language}.

Required output:
1. A short summary of the third-round debate.
2. A markdown table comparing how these agents changed across rounds: ${participantNames}. Include columns for Agent, Round 1 view, Round 2 shift, Round 3 final stance. Use table labels in ${language}.
3. A short final proposal as either a compact markdown table or a brief result list.

Keep the final proposal practical and concise. Do not use tools, browse, edit files, or run commands.`;
}

function writeEvent(res, event) {
  res.write(`${JSON.stringify(event)}\n`);
}

function runAgent(agent, prompt, res, cwd) {
  return new Promise((resolveRun) => {
    let stdout = "";
    let stderr = "";
    let outputFile = "";
    let args = [...agent.args];

    if (agent.input === "stdin-last-message-file") {
      outputFile = join(tmpdir(), `agent-debate-${randomUUID()}.txt`);
    }

    args = args.map((arg) =>
      arg.replaceAll("{prompt}", prompt).replaceAll("{outputFile}", outputFile),
    );

    if (agent.input === "stdin-last-message-file" && outputFile && !args.includes(outputFile)) {
      const dashIndex = args.lastIndexOf("-");
      args =
        dashIndex >= 0
          ? [...args.slice(0, dashIndex), "-o", outputFile, ...args.slice(dashIndex)]
          : [...args, "-o", outputFile];
    }

    const child = spawn(agent.command, args, {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      writeEvent(res, { type: "stream", agent: agent.name, text });
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      writeEvent(res, { type: "debug", agent: agent.name, text });
    });

    child.on("error", (error) => {
      resolveRun(`[${agent.name} failed]\n\n${error.message}`);
    });

    child.on("close", (code) => {
      if (outputFile && existsSync(outputFile)) {
        const lastMessage = readFileSync(outputFile, "utf8").trim();
        if (lastMessage) {
          resolveRun(lastMessage);
          return;
        }
      }

      if (code !== 0) {
        resolveRun(`[${agent.name} exited with code ${code}]\n\n${stderr.trim() || stdout.trim() || "No output."}`);
        return;
      }

      resolveRun(stdout.trim() || stderr.trim());
    });

    child.stdin.end(agent.input === "none" ? "" : prompt);
  });
}

function selectSynthesizer(agents) {
  return (
    agents.find((agent) => agent.id === "codex") ||
    agents.find((agent) => agent.name.toLowerCase().includes("codex")) ||
    agents[agents.length - 1]
  );
}

async function handleDebate(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.message === "Request body is too large." ? 413 : 400, {
      error: error.message,
    });
    return;
  }

  const topic = String(payload.topic || "").trim();
  const context = String(payload.context || "").slice(0, 20000);
  const language = String(payload.language || "Korean").trim() || "Korean";
  let projectPath;
  try {
    projectPath = resolveProjectPath(payload.projectPath);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  if (!topic) {
    sendJson(res, 400, { error: "Topic is required." });
    return;
  }

  const debateAgents = readAgents().filter((agent) => agent.enabled);
  if (!debateAgents.length) {
    sendJson(res, 400, { error: "Enable at least one agent before starting a debate." });
    return;
  }

  const participantNames = debateAgents.map((agent) => agent.name).join(", ");

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const created = new Date();
  const filename = `${created.toISOString().replace(/[:.]/g, "-")}.md`;
  const runPath = join(runsDir, filename);
  let transcript = "";

  writeFileSync(
    runPath,
    `# Agent Debate\n\n- Topic: ${topic}\n- Project: ${projectPath}\n- Created: ${created.toISOString()}\n- Workflow: 3 debate rounds plus Codex final synthesis\n- Language: ${language}\n\n`,
    "utf8",
  );

  writeEvent(res, {
    type: "start",
    file: filename,
    topic,
    rounds: debateRoundCount,
    language,
    projectPath,
    agents: debateAgents.map((agent) => agent.name),
  });

  for (const roundConfig of debateRounds) {
    const transcriptSnapshot = roundConfig.round === 1 ? "" : trimContext(transcript, 30000);

    for (const agent of debateAgents) {
      writeEvent(res, {
        type: "agent-start",
        agent: agent.name,
        round: roundConfig.round,
        roundTitle: roundConfig.title,
      });
      const prompt = buildPrompt({
        topic,
        context,
        language,
        projectPath,
        roundConfig,
        agentName: agent.name,
        participantNames,
        transcript: transcriptSnapshot,
      });

      const response = await runAgent(agent, prompt, res, projectPath);
      const section = `\n\n## Round ${roundConfig.round}: ${agent.name}\n\n${response.trim()}\n`;
      transcript += section;
      await appendFile(runPath, section, "utf8");
      writeEvent(res, {
        type: "agent-done",
        agent: agent.name,
        round: roundConfig.round,
        roundTitle: roundConfig.title,
        response,
      });
    }
  }

  const synthesisAgent = selectSynthesizer(debateAgents);
  if (synthesisAgent) {
    writeEvent(res, {
      type: "agent-start",
      agent: synthesisAgent.name,
      round: "Final",
      roundTitle: `${synthesisAgent.name} synthesis`,
    });

    const summaryPrompt = buildSummaryPrompt({
      topic,
      context,
      language,
      projectPath,
      participantNames,
      transcript: trimContext(transcript, 45000),
    });
    const summary = await runAgent(synthesisAgent, summaryPrompt, res, projectPath);
    const section = `\n\n## Final: ${synthesisAgent.name} Synthesis\n\n${summary.trim()}\n`;
    transcript += section;
    await appendFile(runPath, section, "utf8");
    writeEvent(res, {
      type: "agent-done",
      agent: synthesisAgent.name,
      round: "Final",
      roundTitle: `${synthesisAgent.name} synthesis`,
      response: summary,
    });
  }

  writeEvent(res, { type: "done", file: filename });
  res.end();
}

async function handleAgents(req, res) {
  if (req.method === "GET") {
    const agents = readAgents();
    sendJson(res, 200, {
      agents: getStatus(agents),
      configured: existsSync(agentConfigPath),
      configFile: "agent-debate.config.json",
    });
    return;
  }

  try {
    const payload = await readJsonBody(req, 200_000);
    const agents = writeAgents(payload.agents);
    sendJson(res, 200, { agents: getStatus(agents), configFile: "agent-debate.config.json" });
  } catch (error) {
    sendJson(res, error.message === "Request body is too large." ? 413 : 400, {
      error: error.message,
    });
  }
}

function handleRuns(res) {
  const files = readdirSync(runsDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, 20)
    .map((file) => ({
      file,
      name: file.replace(".md", ""),
    }));

  sendJson(res, 200, { runs: files });
}

function handleRunViewer(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const fileFromPath = url.pathname.replace(/^\/view\//, "");

  try {
    const { file, fullPath } = resolveRunFile(fileFromPath);
    const markdown = readFileSync(fullPath, "utf8");
    const title = file.replace(".md", "");
    sendHtml(
      res,
      200,
      `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Agent Debate</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #efebe1;
        --surface: #fffdf8;
        --ink: #171614;
        --muted: #6f6a60;
        --line: #d7cdbc;
        --blue: #1f418f;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
      }
      .viewer-shell {
        width: min(980px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 48px;
      }
      .viewer-topbar {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
        padding: 12px 0;
        background: var(--bg);
      }
      .viewer-title {
        min-width: 0;
      }
      .viewer-title h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1.2;
      }
      .viewer-title p {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 13px;
        overflow-wrap: anywhere;
      }
      .back-link {
        flex: 0 0 auto;
        border: 1px solid var(--blue);
        border-radius: 8px;
        padding: 10px 12px;
        color: var(--blue);
        font-weight: 850;
        text-decoration: none;
        background: white;
      }
      main {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        padding: 26px;
        box-shadow: 0 18px 42px rgba(35, 28, 17, 0.1);
      }
      h1, h2, h3, h4, h5, h6 {
        margin: 24px 0 10px;
        line-height: 1.25;
      }
      main > h1:first-child,
      main > h2:first-child {
        margin-top: 0;
      }
      p, li {
        font-size: 15px;
        line-height: 1.65;
      }
      p {
        margin: 10px 0;
      }
      ul, ol {
        margin: 10px 0 16px;
        padding-left: 24px;
      }
      table {
        width: 100%;
        margin: 16px 0;
        border-collapse: collapse;
        overflow-wrap: anywhere;
      }
      th, td {
        border: 1px solid var(--line);
        padding: 10px;
        text-align: left;
        vertical-align: top;
        line-height: 1.45;
      }
      th {
        background: #f7f2e8;
      }
      pre {
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 14px;
        background: #f7f2e8;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 0.92em;
      }
      a {
        color: var(--blue);
        font-weight: 750;
      }
      @media (max-width: 640px) {
        .viewer-shell {
          width: min(100vw - 20px, 980px);
          padding-top: 12px;
        }
        .viewer-topbar {
          align-items: stretch;
          flex-direction: column;
        }
        .back-link {
          text-align: center;
        }
        main {
          padding: 18px;
        }
      }
    </style>
  </head>
  <body>
    <div class="viewer-shell">
      <header class="viewer-topbar">
        <div class="viewer-title">
          <h1>Agent Debate Run</h1>
          <p>${escapeHtml(file)}</p>
        </div>
        <a class="back-link" href="/">Back to Debate</a>
      </header>
      <main>${renderMarkdown(markdown)}</main>
    </div>
  </body>
</html>`,
    );
  } catch (error) {
    sendHtml(
      res,
      error.message === "Run file not found." ? 404 : 400,
      `<!doctype html><html lang="ko"><meta charset="utf-8" /><title>Run not found</title><body><p>${escapeHtml(error.message)}</p><p><a href="/">Back to Debate</a></p></body></html>`,
    );
  }
}

async function handleProject(req, res) {
  try {
    const payload = await readJsonBody(req, 20_000);
    const projectPath = resolveProjectPath(payload.projectPath);
    sendJson(res, 200, { projectPath });
  } catch (error) {
    sendJson(res, error.message === "Request body is too large." ? 413 : 400, {
      error: error.message,
    });
  }
}

async function handleApp(req, res) {
  try {
    const payload = await readJsonBody(req, 20_000);
    const action = String(payload.action || "start");
    const status = action === "stop" ? stopApp() : startApp(payload.projectPath);
    sendJson(res, 200, status);
  } catch (error) {
    sendJson(res, error.message === "Request body is too large." ? 413 : 400, {
      error: error.message,
    });
  }
}

function serveStatic(req, res) {
  let requested = "/index.html";
  try {
    const url = new URL(req.url, `http://${host}`);
    requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: "Invalid URL." });
    return;
  }
  const fullPath = resolve(join(publicDir, requested));
  if (fullPath !== publicDir && !fullPath.startsWith(publicDir + sep)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  if (!existsSync(fullPath)) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const ext = extname(fullPath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
  });
  createReadStream(fullPath).pipe(res);
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/status") {
    const agents = readAgents();
    sendJson(res, 200, { agents: getStatus(agents), defaultProjectPath });
    return;
  }

  if ((req.method === "GET" || req.method === "POST") && req.url === "/api/agents") {
    handleAgents(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/runs") {
    handleRuns(res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/view/")) {
    handleRunViewer(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/app/status") {
    sendJson(res, 200, currentAppStatus());
    return;
  }

  if (req.method === "POST" && req.url === "/api/debate") {
    handleDebate(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/app") {
    handleApp(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/project") {
    handleProject(req, res);
    return;
  }

  serveStatic(req, res);
}).listen(port, host, () => {
  console.log(`Agent Debate running at http://${host}:${port}`);
});

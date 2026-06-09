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
import { dirname, extname, join, resolve, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const publicDir = join(root, "public");
const runsDir = join(root, "runs");
const agentConfigPath = join(root, "agent-debate.config.json");
const defaultProjectPath = resolve(process.env.AGENT_DEBATE_DEFAULT_PROJECT_PATH || root);
const designSystemDir = resolve(process.env.NANAOS_DESIGN_SYSTEM_PATH || join(root, "..", "design-system"));
const designSystemStaticRoots = [
  join(designSystemDir, "dist"),
  join(designSystemDir, "fonts"),
  join(designSystemDir, "icons", "material-symbols", "fonts"),
  join(designSystemDir, "packages", "web-components"),
];
const nvmNodeVersionsDir = join(homedir(), ".nvm", "versions", "node");
const personalCodexSkillsDir = join(homedir(), ".codex", "skills");
const personalAgentSkillsDir = join(homedir(), ".agents", "skills");
const pluginCacheDir = join(homedir(), ".codex", "plugins", "cache");
const skillSearchRoots = [
  { dir: personalCodexSkillsDir, source: "Personal" },
  { dir: personalAgentSkillsDir, source: "Personal" },
  { dir: pluginCacheDir, source: "Plugin" },
];
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
let skillIndexCache = null;

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

const defaultWorkflowSteps = [
  "Read the topic and state independent positions. Agents do not see one another's first answer. Default order: Codex -> Gemini -> Claude.",
  "Debate first: read every position and state your updated view.",
  "Debate second: challenge tradeoffs and refine the recommendation.",
  "Debate third: settle remaining disagreements and name the strongest direction.",
  "Codex synthesizes every position into one decision.",
];

const workflowStepCount = defaultWorkflowSteps.length;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
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

function toTitle(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const debateTitleStopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "could",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "more",
  "need",
  "needs",
  "not",
  "of",
  "on",
  "or",
  "our",
  "should",
  "that",
  "the",
  "this",
  "to",
  "use",
  "using",
  "want",
  "what",
  "when",
  "where",
  "with",
  "would",
  "component",
  "components",
  "componenet",
  "file",
  "path",
  "sites",
  "src",
  "users",
  "var",
]);

const debateTitleWordOverrides = new Map([
  ["ai", "AI"],
  ["api", "API"],
  ["aria", "ARIA"],
  ["cli", "CLI"],
  ["css", "CSS"],
  ["html", "HTML"],
  ["json", "JSON"],
  ["md", "MD"],
  ["npm", "npm"],
  ["ui", "UI"],
  ["url", "URL"],
  ["ux", "UX"],
  ["nanaos", "nanaOS"],
  ["shadcn", "shadcn"],
]);

const debateTitleHints = [
  { pattern: new RegExp("\\uC624\\uB978\\uCABD|\\uB05D\\s*\\uC601\\uC5ED"), words: ["Slot"] },
  { pattern: new RegExp("\\uBA85\\uCE6D|\\uC774\\uB984|\\uB124\\uC774\\uBC0D"), words: ["Naming"] },
  { pattern: new RegExp("\\uD638\\uBC84"), words: ["Hover"] },
  { pattern: new RegExp("\\uCE74\\uB4DC"), words: ["Card"] },
  { pattern: new RegExp("\\uD31D\\uC624\\uBC84"), words: ["Popover"] },
  { pattern: new RegExp("\\uCF64\\uBCF4"), words: ["Combobox"] },
  { pattern: new RegExp("\\uC140\\uB809\\uD2B8|\\uC120\\uD0DD"), words: ["Select"] },
  { pattern: new RegExp("\\uB2E4\\uD06C"), words: ["Dark"] },
  { pattern: new RegExp("\\uBBF8\\uB514\\uC5B4"), words: ["Media"] },
  { pattern: new RegExp("\\uC774\\uBBF8\\uC9C0"), words: ["Image"] },
  { pattern: new RegExp("\\uB514\\uC790\\uC778\\s*\\uC2DC\\uC2A4\\uD15C"), words: ["Design", "System"] },
  { pattern: new RegExp("\\uD0C0\\uC774\\uD3EC"), words: ["Typography"] },
  { pattern: new RegExp("\\uAC80\\uC99D"), words: ["Validation"] },
  { pattern: new RegExp("\\uB808\\uC774\\uC544\\uC6C3"), words: ["Layout"] },
  { pattern: new RegExp("\\uD1A0\\uD070"), words: ["Token"] },
  { pattern: new RegExp("\\uBAA8\\uB2EC"), words: ["Modal"] },
  { pattern: new RegExp("\\uD328\\uB110"), words: ["Panel"] },
  { pattern: new RegExp("\\uB2E4\\uC774\\uC5BC\\uB85C\\uADF8"), words: ["Dialog"] },
];

function formatDebateTitleWord(word) {
  const cleanWord = String(word || "").replace(/[^a-z0-9]/gi, "");
  const lowerWord = cleanWord.toLowerCase();
  if (!cleanWord || debateTitleStopWords.has(lowerWord)) return "";
  if (debateTitleWordOverrides.has(lowerWord)) return debateTitleWordOverrides.get(lowerWord);
  return `${cleanWord.slice(0, 1).toUpperCase()}${cleanWord.slice(1).toLowerCase()}`;
}

function debateTitleFromTopic(topic, maxWords = 5) {
  const text = String(topic || "");
  const candidates = [];

  for (const match of text.matchAll(/[a-z][a-z0-9]*/gi)) {
    candidates.push({ index: match.index ?? 0, word: match[0] });
  }

  for (const hint of debateTitleHints) {
    const match = hint.pattern.exec(text);
    if (!match) continue;
    hint.words.forEach((word, offset) => {
      candidates.push({ index: (match.index ?? 0) + offset / 10, word });
    });
  }

  const words = [];
  const seen = new Set();
  for (const candidate of candidates.sort((a, b) => a.index - b.index)) {
    const formatted = formatDebateTitleWord(candidate.word);
    const key = formatted.toLowerCase();
    if (!formatted || seen.has(key)) continue;
    words.push(formatted);
    seen.add(key);
    if (words.length >= maxWords) break;
  }

  return words.length ? words.join(" ") : "Debate";
}

function uniqueRunFilename(topic, created) {
  const date = created.toISOString().slice(0, 10);
  const title = debateTitleFromTopic(topic);
  const baseName = `${title} ${date}`.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "").trim();
  let filename = `${baseName}.md`;
  let index = 2;

  while (existsSync(join(runsDir, filename))) {
    filename = `${baseName} ${index}.md`;
    index += 1;
  }

  return filename;
}

function compactText(value, maxLength = 320) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function normalizeWorkflowSteps(value) {
  const source = Array.isArray(value) ? value : defaultWorkflowSteps;
  const steps = source
    .map((step) => (typeof step === "string" ? step : step?.text || step?.instruction || ""))
    .map((step) => compactText(step, 700))
    .filter(Boolean)
    .slice(0, workflowStepCount);

  while (steps.length < workflowStepCount) {
    steps.push(defaultWorkflowSteps[steps.length]);
  }

  return steps.map((text, index) => ({
    index,
    number: index + 1,
    text,
    title: compactText(text, 88),
    kind: index === workflowStepCount - 1 ? "synthesis" : "debate",
  }));
}

function formatWorkflowSteps(steps) {
  return steps.map((step) => `${step.number}. ${step.text}`).join("\n");
}

function findSkillFiles(dir, depth = 0, results = []) {
  if (!existsSync(dir) || depth > 8 || results.length >= 500) return results;

  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;

    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") {
      results.push(fullPath);
      continue;
    }

    if (entry.isDirectory()) {
      findSkillFiles(fullPath, depth + 1, results);
    }
  }

  return results;
}

function extractFrontMatter(markdown) {
  if (!markdown.startsWith("---\n")) return "";
  const endIndex = markdown.indexOf("\n---", 4);
  return endIndex === -1 ? "" : markdown.slice(4, endIndex);
}

function readFrontMatterValue(frontMatter, key) {
  const lines = frontMatter.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(new RegExp(`^${key}:\\s*(.*)$`));
    if (!match) continue;

    const value = match[1].trim();
    if (value !== "|" && value !== ">") {
      return value.replace(/^["']|["']$/g, "");
    }

    const block = [];
    for (let blockIndex = index + 1; blockIndex < lines.length; blockIndex += 1) {
      const blockLine = lines[blockIndex];
      if (blockLine.trim() && !/^\s/.test(blockLine)) break;
      block.push(blockLine.trim());
    }
    return block.join(" ");
  }

  return "";
}

function skillSourceFromPath(filePath, fallbackSource) {
  if (filePath.startsWith(personalCodexSkillsDir) || filePath.startsWith(personalAgentSkillsDir)) {
    return "Personal";
  }

  const parts = filePath.split(sep);
  const cacheIndex = parts.lastIndexOf("cache");
  if (cacheIndex >= 0 && parts[cacheIndex + 2]) {
    return toTitle(parts[cacheIndex + 2]);
  }

  return fallbackSource;
}

function loadSkillIndex() {
  if (skillIndexCache) return skillIndexCache;

  const skills = [];
  const seenIds = new Set();

  for (const rootConfig of skillSearchRoots) {
    for (const filePath of findSkillFiles(rootConfig.dir)) {
      let markdown = "";
      try {
        markdown = readFileSync(filePath, "utf8");
      } catch {
        continue;
      }

      const frontMatter = extractFrontMatter(markdown);
      const folderName = filePath.split(sep).at(-2) || "skill";
      const name = readFrontMatterValue(frontMatter, "name") || folderName;
      const description = compactText(readFrontMatterValue(frontMatter, "description"));
      const source = skillSourceFromPath(filePath, rootConfig.source);
      const baseId = toSlug(`${source}-${name}`, `skill-${skills.length + 1}`);
      let id = baseId;
      let duplicate = 2;

      while (seenIds.has(id)) {
        id = `${baseId}-${duplicate}`;
        duplicate += 1;
      }
      seenIds.add(id);

      skills.push({
        id,
        name,
        title: toTitle(name),
        description,
        source,
      });
    }
  }

  skillIndexCache = skills.sort((first, second) =>
    `${first.title} ${first.source}`.localeCompare(`${second.title} ${second.source}`),
  );
  return skillIndexCache;
}

function scoreSkill(skill, query) {
  if (!query) return 1;

  const terms = query
    .toLowerCase()
    .replace(/^[/@$]+/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  if (!terms.length) return 1;

  const name = skill.name.toLowerCase();
  const title = skill.title.toLowerCase();
  const source = skill.source.toLowerCase();
  const description = skill.description.toLowerCase();
  const haystack = `${name} ${title} ${source} ${description}`;

  if (!terms.every((term) => haystack.includes(term))) return 0;

  return terms.reduce((score, term) => {
    if (name === term || title === term) return score + 120;
    if (name.startsWith(term) || title.startsWith(term)) return score + 80;
    if (name.includes(term) || title.includes(term)) return score + 40;
    if (source.includes(term)) return score + 20;
    return score + 5;
  }, 0);
}

function searchSkills(query) {
  return loadSkillIndex()
    .map((skill) => ({ ...skill, score: scoreSkill(skill, query) }))
    .filter((skill) => skill.score > 0)
    .sort((first, second) => second.score - first.score || first.title.localeCompare(second.title))
    .slice(0, 12)
    .map(({ score, ...skill }) => skill);
}

function normalizeSelectedSkills(value) {
  const source = Array.isArray(value) ? value : [];
  return source.slice(0, 8).map((skill) => ({
    name: compactText(skill?.name || skill?.title || "Selected skill", 80),
    title: compactText(skill?.title || skill?.name || "Selected skill", 80),
    description: compactText(skill?.description || "", 500),
    source: compactText(skill?.source || "Skill", 80),
  }));
}

function formatSelectedSkills(skills) {
  if (!skills.length) return "(No selected skills.)";
  return skills
    .map((skill) => {
      const description = skill.description ? `: ${skill.description}` : "";
      return `- ${skill.title} (${skill.source})${description}`;
    })
    .join("\n");
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

function requestMatchesUiOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(`http://${req.headers.host || `${host}:${port}`}`);
    return originUrl.protocol === requestUrl.protocol && originUrl.host === requestUrl.host;
  } catch {
    return false;
  }
}

// Reject requests whose Host header is a domain name (only IP literals and
// "localhost" are expected for a local server). This mitigates DNS-rebinding
// attacks, where a malicious site points a hostname at 127.0.0.1 to bypass the
// Origin check below.
function requestHostIsSafe(req) {
  const hostHeader = req.headers.host;
  if (!hostHeader) return true;

  const hostname = hostHeader.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (hostname === "localhost") return true;

  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  const isIpv6 = hostname.includes(":");
  return isIpv4 || isIpv6;
}

function openRunFileFolder(fullPath) {
  const folderPath = dirname(fullPath);
  let command = "";
  let args = [];

  if (process.platform === "darwin") {
    command = "open";
    args = ["-R", fullPath];
  } else if (process.platform === "win32") {
    command = "explorer";
    args = [`/select,${fullPath}`];
  } else {
    command = "xdg-open";
    args = [folderPath];
  }

  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
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

function debateAgentRank(agent) {
  const value = `${agent.id || ""} ${agent.name || ""} ${agent.command || ""}`.toLowerCase();
  if (value.includes("codex")) return 0;
  if (value.includes("gemini")) return 1;
  if (value.includes("claude")) return 2;
  return 10;
}

function orderDebateAgents(agents) {
  return agents
    .map((agent, index) => ({ agent, index }))
    .sort((left, right) => debateAgentRank(left.agent) - debateAgentRank(right.agent) || left.index - right.index)
    .map(({ agent }) => agent);
}

function trimContext(transcript, maxChars) {
  if (transcript.length <= maxChars) return transcript;
  const marker = "\n\n[... earlier transcript omitted ...]\n\n";
  const keep = Math.max(maxChars - marker.length, 0);
  const head = Math.floor(keep * 0.25);
  const tail = keep - head;
  return transcript.slice(0, head) + marker + transcript.slice(-tail);
}

function buildPrompt({
  topic,
  context,
  selectedSkills,
  language,
  projectPath,
  roundConfig,
  debateRoundCount,
  agentName,
  participantNames,
  transcript,
}) {
  return `You are ${agentName}, one of the AI agents in a structured debate.

Topic:
${topic}

Project path:
${projectPath}

Imported context:
${context.trim() || "(No imported context.)"}

Selected skills:
${formatSelectedSkills(selectedSkills)}

Debate setup:
- Participants: ${participantNames}.
- Current workflow step: ${roundConfig.number} of ${workflowStepCount}: ${roundConfig.title}.
- Current debate round: ${roundConfig.round} of ${debateRoundCount}.
- Reply in ${language}.
- Do not use tools, browse, edit files, or run commands.
- Use selected skills as framing guidance when they are relevant, but do not claim that you executed a skill.
- Be concise: 4 to 8 bullet points, then one short conclusion.
- If you disagree, make the disagreement specific and useful.

Round instruction:
${roundConfig.text}

Transcript so far:
${transcript.trim() || "(No prior transcript.)"}

Now write ${agentName}'s contribution for round ${roundConfig.round}.`;
}

function buildSummaryPrompt({
  topic,
  context,
  selectedSkills,
  language,
  projectPath,
  participantNames,
  workflowSteps,
  synthesisStep,
  transcript,
}) {
  return `You are the moderator and final synthesizer for a completed multi-agent debate.

Topic:
${topic}

Project path:
${projectPath}

Imported context:
${context.trim() || "(No imported context.)"}

Selected skills:
${formatSelectedSkills(selectedSkills)}

Workflow:
${formatWorkflowSteps(workflowSteps)}

Synthesis instruction:
${synthesisStep.text}

Debate transcript:
${transcript.trim() || "(No debate transcript.)"}

Write the final synthesis in ${language}.

Required output:
1. A short summary of the completed debate.
2. A markdown table comparing how these agents changed across the workflow: ${participantNames}. Include columns for Agent, Opening view, Strongest shift, and Final stance. Use table labels in ${language}.
3. A short final proposal as either a compact markdown table or a brief result list.

Keep the final proposal practical and concise. Do not use tools, browse, edit files, or run commands. Use selected skills as framing guidance when they are relevant, but do not claim that you executed a skill.`;
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
    payload = await readJsonBody(req, 6_000_000);
  } catch (error) {
    sendJson(res, error.message === "Request body is too large." ? 413 : 400, {
      error: error.message,
    });
    return;
  }

  const topic = String(payload.topic || "").trim();
  const context = String(payload.context || "").slice(0, 20000);
  const selectedSkills = normalizeSelectedSkills(payload.skills);
  const workflowSteps = normalizeWorkflowSteps(payload.workflow);
  const debateSteps = workflowSteps.filter((step) => step.kind === "debate");
  const synthesisStep = workflowSteps.find((step) => step.kind === "synthesis") || workflowSteps.at(-1);
  const debateRoundCount = debateSteps.length;
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

  const debateAgents = orderDebateAgents(readAgents().filter((agent) => agent.enabled));
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
  const filename = uniqueRunFilename(topic, created);
  const runPath = join(runsDir, filename);
  let transcript = "";

  writeFileSync(
    runPath,
    `# Agent Debate\n\n- Topic: ${topic}\n- Project: ${projectPath}\n- Created: ${created.toISOString()}\n- Workflow: Custom ${workflowSteps.length}-step debate workflow\n- Language: ${language}\n- Skills: ${selectedSkills.length ? selectedSkills.map((skill) => skill.title).join(", ") : "None"}\n\n## Workflow\n\n${formatWorkflowSteps(workflowSteps)}\n\n`,
    "utf8",
  );

  writeEvent(res, {
    type: "start",
    file: filename,
    topic,
    rounds: debateRoundCount,
    workflow: workflowSteps,
    language,
    projectPath,
    agents: debateAgents.map((agent) => agent.name),
    skills: selectedSkills.map((skill) => skill.title),
  });

  for (const roundConfig of debateSteps.map((step, index) => ({ ...step, round: index + 1 }))) {
    const transcriptSnapshot = roundConfig.round === 1 ? "" : trimContext(transcript, 30000);
    writeEvent(res, {
      type: "step-start",
      stepIndex: roundConfig.index,
      stepTitle: roundConfig.title,
    });

    for (const agent of debateAgents) {
      writeEvent(res, {
        type: "agent-start",
        agent: agent.name,
        round: roundConfig.round,
        roundTitle: roundConfig.title,
        stepIndex: roundConfig.index,
      });
      const prompt = buildPrompt({
        topic,
        context,
        selectedSkills,
        language,
        projectPath,
        roundConfig,
        debateRoundCount,
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
        stepIndex: roundConfig.index,
        response,
      });
    }

    writeEvent(res, {
      type: "step-done",
      stepIndex: roundConfig.index,
      stepTitle: roundConfig.title,
    });
  }

  const synthesisAgent = selectSynthesizer(debateAgents);
  if (synthesisAgent) {
    writeEvent(res, {
      type: "step-start",
      stepIndex: synthesisStep.index,
      stepTitle: synthesisStep.title,
    });
    writeEvent(res, {
      type: "agent-start",
      agent: synthesisAgent.name,
      round: "Final",
      roundTitle: synthesisStep.title || `${synthesisAgent.name} synthesis`,
      stepIndex: synthesisStep.index,
    });

    const summaryPrompt = buildSummaryPrompt({
      topic,
      context,
      selectedSkills,
      language,
      projectPath,
      participantNames,
      workflowSteps,
      synthesisStep,
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
      roundTitle: synthesisStep.title || `${synthesisAgent.name} synthesis`,
      stepIndex: synthesisStep.index,
      response: summary,
    });
    writeEvent(res, {
      type: "step-done",
      stepIndex: synthesisStep.index,
      stepTitle: synthesisStep.title,
    });
  }

  writeEvent(res, { type: "done", file: filename, workflow: workflowSteps });
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
    .map((file) => {
      const fullPath = join(runsDir, file);
      let modified = 0;
      try {
        modified = statSync(fullPath).mtimeMs;
      } catch {
        modified = 0;
      }
      return {
        file,
        modified,
        name: file.replace(".md", ""),
      };
    })
    .sort((a, b) => b.modified - a.modified || b.file.localeCompare(a.file))
    .slice(0, 20)
    .map(({ file, name }) => ({ file, name }));

  sendJson(res, 200, { runs: files });
}

async function handleOpenRunFolder(req, res) {
  if (!requestMatchesUiOrigin(req)) {
    sendJson(res, 403, { error: "Request origin is not allowed." });
    return;
  }

  try {
    const payload = await readJsonBody(req, 20_000);
    const { file, fullPath } = resolveRunFile(payload.file);
    openRunFileFolder(fullPath);
    sendJson(res, 200, { status: "opened", file });
  } catch (error) {
    const status =
      error.message === "Request body is too large."
        ? 413
        : error.message === "Run file not found."
          ? 404
          : error.message === "Invalid run file."
            ? 400
            : 500;
    sendJson(res, status, { error: error.message || "Could not open folder." });
  }
}

function handleSkills(req, res) {
  const url = new URL(req.url, `http://${host}`);
  const query = String(url.searchParams.get("q") || "").trim().slice(0, 80);
  sendJson(res, 200, { skills: searchSkills(query) });
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
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Agent Debate</title>
    <link rel="stylesheet" href="/theme.css" />
    <link rel="stylesheet" href="/nanaos/dist/nanaos.css" />
    <style>
      :root {
        color-scheme: light dark;
        --viewer-bg: var(--background-dim1);
        --viewer-surface: var(--background-default);
        --viewer-muted: var(--foreground-dim2);
        --viewer-line: color-mix(in oklab, var(--foreground-default) 14%, transparent);
        --viewer-line-strong: color-mix(in oklab, var(--foreground-default) 28%, transparent);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--viewer-bg);
        color: var(--foreground-default);
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
        gap: var(--spacing-16);
        margin-bottom: var(--spacing-16);
        padding: var(--spacing-12) 0;
        background: var(--viewer-bg);
      }
      .viewer-title {
        min-width: 0;
      }
      .viewer-title h1 {
        margin: 0;
        font-size: var(--font-size-20);
        line-height: var(--line-height-12);
      }
      .viewer-title p {
        margin: var(--spacing-4) 0 0;
        color: var(--viewer-muted);
        font-size: var(--font-size-12);
        overflow-wrap: anywhere;
      }
      .viewer-actions {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: flex-end;
        gap: var(--spacing-8);
        min-width: 0;
      }
      .viewer-action-stack {
        display: grid;
        gap: var(--spacing-6);
        justify-items: end;
      }
      .viewer-button {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-8);
        min-height: 36px;
        padding: 0 var(--spacing-14);
        border: var(--border-width-1) solid var(--viewer-line-strong);
        border-radius: var(--border-radius-800);
        background: transparent;
        color: var(--foreground-default);
        cursor: pointer;
        font: inherit;
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-700);
        line-height: var(--line-height-10);
        text-decoration: none;
        white-space: nowrap;
      }
      .viewer-button:hover:not(:disabled) {
        background: var(--state-hover-background);
      }
      .viewer-button:focus-visible {
        outline: var(--focus-ring-width) var(--focus-ring-style) var(--focus-ring-color);
        outline-offset: var(--focus-ring-offset);
      }
      .viewer-button:disabled {
        background: var(--state-disabled-background);
        color: var(--state-disabled-foreground);
        cursor: not-allowed;
      }
      .button__icon {
        display: inline-flex;
      }
      .folder-status {
        min-height: 16px;
        color: var(--viewer-muted);
        font-size: var(--font-size-12);
        line-height: var(--line-height-14);
      }
      main {
        border: var(--border-width-1) solid var(--viewer-line);
        border-radius: var(--border-radius-8);
        background: var(--viewer-surface);
        padding: var(--spacing-24);
        box-shadow: var(--elevation-6);
      }
      h1, h2, h3, h4, h5, h6 {
        margin: var(--spacing-24) 0 var(--spacing-10);
        line-height: var(--line-height-12);
      }
      main > h1:first-child,
      main > h2:first-child {
        margin-top: 0;
      }
      p, li {
        font-size: var(--font-size-14);
        line-height: var(--line-height-16);
      }
      p {
        margin: var(--spacing-10) 0;
      }
      ul, ol {
        margin: var(--spacing-10) 0 var(--spacing-16);
        padding-left: var(--spacing-24);
      }
      table {
        width: 100%;
        margin: var(--spacing-16) 0;
        border-collapse: collapse;
        overflow-wrap: anywhere;
      }
      th, td {
        border: var(--border-width-1) solid var(--viewer-line);
        padding: var(--spacing-10);
        text-align: left;
        vertical-align: top;
        line-height: var(--line-height-14);
      }
      th {
        background: var(--background-dim2);
      }
      pre {
        overflow: auto;
        border: var(--border-width-1) solid var(--viewer-line);
        border-radius: var(--border-radius-8);
        padding: var(--spacing-14);
        background: var(--background-dim2);
      }
      code {
        font-family: var(--font-family-geist-mono);
        font-size: 0.92em;
      }
      a {
        color: var(--action-link-fg);
        font-weight: var(--font-weight-700);
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
        .viewer-actions,
        .viewer-action-stack {
          align-items: stretch;
          justify-items: stretch;
        }
        .viewer-actions {
          flex-direction: column;
        }
        .viewer-actions .viewer-button {
          width: 100%;
        }
        main {
          padding: var(--spacing-20);
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
        <div class="viewer-action-stack">
          <div class="viewer-actions">
            <button id="openRunFolder" class="viewer-button" type="button" data-file="${escapeHtml(file)}">
              <span class="button__icon icon" aria-hidden="true">folder_open</span>
              <span class="button__label">Open Folder</span>
            </button>
            <a class="viewer-button" href="/">
              <span class="button__label">Back to Debate</span>
            </a>
          </div>
          <span class="folder-status" id="openFolderStatus" aria-live="polite"></span>
        </div>
      </header>
      <main>${renderMarkdown(markdown)}</main>
    </div>
    <script type="module">
      const openRunFolderButton = document.querySelector("#openRunFolder");
      const openFolderStatus = document.querySelector("#openFolderStatus");

      openRunFolderButton.addEventListener("click", async () => {
        openRunFolderButton.disabled = true;
        openFolderStatus.textContent = "Opening folder...";

        try {
          const response = await fetch("/api/runs/open-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: openRunFolderButton.dataset.file }),
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.error || "Could not open folder.");
          }

          openFolderStatus.textContent = "Folder opened.";
        } catch (error) {
          openFolderStatus.textContent = error.message || "Could not open folder.";
        } finally {
          openRunFolderButton.disabled = false;
        }
      });
    </script>
  </body>
</html>`,
    );
  } catch (error) {
    sendHtml(
      res,
      error.message === "Run file not found." ? 404 : 400,
      `<!doctype html><html lang="en"><meta charset="utf-8" /><title>Run not found</title><body><p>${escapeHtml(error.message)}</p><p><a href="/">Back to Debate</a></p></body></html>`,
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
    "Cache-Control": "no-store",
  });
  createReadStream(fullPath).pipe(res);
}

function serveDesignSystem(req, res) {
  let requested = "";
  try {
    const url = new URL(req.url, `http://${host}`);
    requested = decodeURIComponent(url.pathname.replace(/^\/nanaos\/?/, ""));
  } catch {
    sendJson(res, 400, { error: "Invalid URL." });
    return;
  }

  const fullPath = resolve(join(designSystemDir, requested));
  const isAllowed = designSystemStaticRoots.some((staticRoot) => (
    fullPath === staticRoot || fullPath.startsWith(staticRoot + sep)
  ));

  if (!isAllowed) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  if (!existsSync(fullPath)) {
    sendJson(res, 404, {
      error: "nanaOS design-system asset not found.",
      designSystemPath: designSystemDir,
    });
    return;
  }

  const ext = extname(fullPath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(fullPath).pipe(res);
}

createServer((req, res) => {
  if (!requestHostIsSafe(req)) {
    sendJson(res, 403, { error: "Host header is not allowed." });
    return;
  }

  // CSRF protection: any state-changing API call must originate from the local
  // UI. A cross-site page can send the request, but its Origin will not match,
  // so reconfiguring agents or starting a debate (which spawns commands) is
  // blocked. Non-browser clients send no Origin and are allowed through.
  if (req.method === "POST" && req.url.startsWith("/api/") && !requestMatchesUiOrigin(req)) {
    sendJson(res, 403, { error: "Request origin is not allowed." });
    return;
  }

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

  if (req.method === "POST" && req.url === "/api/runs/open-folder") {
    handleOpenRunFolder(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/skills")) {
    handleSkills(req, res);
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

  if (req.method === "GET" && req.url.startsWith("/nanaos/")) {
    serveDesignSystem(req, res);
    return;
  }

  serveStatic(req, res);
}).listen(port, host, () => {
  console.log(`Agent Debate running at http://${host}:${port}`);
});

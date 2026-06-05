const agentList = document.querySelector("#agentList");
const agentForm = document.querySelector("#agentForm");
const agentIdInput = document.querySelector("#agentId");
const agentNameInput = document.querySelector("#agentName");
const agentCommandInput = document.querySelector("#agentCommand");
const agentArgsInput = document.querySelector("#agentArgs");
const agentInputMode = document.querySelector("#agentInput");
const agentEnabledInput = document.querySelector("#agentEnabled");
const agentNote = document.querySelector("#agentNote");
const addAgentButton = document.querySelector("#addAgentButton");
const cancelAgentButton = document.querySelector("#cancelAgentButton");
const runList = document.querySelector("#runList");
const refreshStatus = document.querySelector("#refreshStatus");
const debateForm = document.querySelector("#debateForm");
const startButton = document.querySelector("#startButton");
const topicInput = document.querySelector("#topic");
const contextInput = document.querySelector("#context");
const contextFile = document.querySelector("#contextFile");
const languageInput = document.querySelector("#language");
const transcriptEl = document.querySelector("#transcript");
const runState = document.querySelector("#runState");
const debateStatus = document.querySelector("#debateStatus");
const projectPathInput = document.querySelector("#projectPath");
const useProjectButton = document.querySelector("#useProjectButton");
const projectNote = document.querySelector("#projectNote");
const runAppButton = document.querySelector("#runAppButton");
const appStatus = document.querySelector("#appStatus");

const savedProjectPath = localStorage.getItem("agentDebate.projectPath");
if (savedProjectPath) {
  projectPathInput.value = savedProjectPath;
}

let agents = [];
let appRunState = { state: "stopped" };
let appStatusTimer = 0;
let notificationAudioContext = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setState(text) {
  runState.textContent = text;
}

function setDebateStatus(status) {
  const labels = {
    ready: "Ready",
    starting: "Starting",
    running: "Debating",
    done: "Finished",
    error: "Error",
  };
  debateStatus.textContent = labels[status] || labels.ready;
  debateStatus.className = `tag debate-status is-${status}`;
}

function getNotificationAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!notificationAudioContext) {
    notificationAudioContext = new AudioContextClass();
  }

  return notificationAudioContext;
}

function primeCompletionSound() {
  const audioContext = getNotificationAudioContext();
  if (!audioContext || audioContext.state !== "suspended") return;
  audioContext.resume().catch(() => {});
}

function playCompletionSound() {
  const audioContext = getNotificationAudioContext();
  if (!audioContext) return;

  audioContext
    .resume()
    .then(() => {
      const tones = [
        { frequency: 660, delay: 0, duration: 0.1 },
        { frequency: 880, delay: 0.11, duration: 0.16 },
      ];
      const now = audioContext.currentTime;

      for (const tone of tones) {
        const start = now + tone.delay;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + tone.duration + 0.02);
      }
    })
    .catch(() => {});
}

function agentStatus(agent) {
  if (!agent.enabled) return { className: "is-disabled", label: "Disabled" };
  if (agent.connected) return { className: "is-ready", label: "Ready" };
  return { className: "is-missing", label: "Missing" };
}

function renderAgents(nextAgents) {
  agents = nextAgents;
  agentList.innerHTML = agents.length
    ? agents
        .map((agent) => {
          const status = agentStatus(agent);
          return `
            <article class="agent-card ${status.className}">
              <div class="agent-card__main">
                <div>
                  <h3>${escapeHtml(agent.name)}</h3>
                  <p>${escapeHtml(agent.command)}</p>
                </div>
                <span class="tag tag--12 tag--rectangle">${status.label}</span>
              </div>
              <div class="agent-card__meta">
                <span>${escapeHtml(agent.input)}</span>
                <span>${agent.args.length} args</span>
              </div>
              <button class="button button--outlined button--14 button--round agent-edit" type="button" data-agent-id="${escapeHtml(agent.id)}">
                <span class="button__label">Edit</span>
              </button>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">No agents configured.</div>`;
}

function renderRuns(runs) {
  runList.innerHTML = runs.length
    ? runs
        .map(
          (run) => `
            <a class="run-item run-link" href="/view/${encodeURIComponent(run.file)}" target="_blank" rel="noreferrer">
              ${escapeHtml(run.file)}
            </a>
          `,
        )
        .join("")
    : `<div class="run-item">No runs</div>`;
}

function renderAppStatus(status) {
  appRunState = status;
  const isRunning = status.state === "running" || status.state === "starting";

  runAppButton.querySelector(".button__label").textContent = isRunning ? "Stop App" : "Run App";
  runAppButton.classList.toggle("is-running", isRunning);
  appStatus.textContent = "";

  if (isRunning && status.url) {
    appStatus.append("Running at ");
    const link = document.createElement("a");
    link.href = status.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = status.url;
    appStatus.append(link);
    return;
  }

  if (status.state === "starting") {
    appStatus.textContent = "Starting app...";
    return;
  }

  if (status.state === "stopping") {
    appStatus.textContent = "Stopping app...";
    return;
  }

  if (status.state === "running") {
    appStatus.textContent = "App is running.";
    return;
  }

  appStatus.textContent = status.error || "App is stopped.";
}

async function loadStatus() {
  const [statusResponse, agentsResponse] = await Promise.all([
    fetch("/api/status"),
    fetch("/api/agents"),
  ]);
  const statusData = await statusResponse.json();
  const agentsData = await agentsResponse.json();

  if (!localStorage.getItem("agentDebate.projectPath") && statusData.defaultProjectPath) {
    projectPathInput.value = statusData.defaultProjectPath;
  }

  renderAgents(agentsData.agents || statusData.agents || []);
}

async function validateProjectPath() {
  const projectPath = projectPathInput.value.trim();
  if (!projectPath) {
    projectPathInput.focus();
    return false;
  }

  useProjectButton.disabled = true;
  projectNote.textContent = "Checking location...";

  try {
    const response = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath }),
    });
    const data = await response.json();

    if (!response.ok) {
      projectNote.textContent = data.error || "Could not use this location.";
      return false;
    }

    projectPathInput.value = data.projectPath;
    localStorage.setItem("agentDebate.projectPath", data.projectPath);
    projectNote.textContent = "Agents will run from this folder.";
    return true;
  } catch (error) {
    projectNote.textContent = error.message;
    return false;
  } finally {
    useProjectButton.disabled = false;
  }
}

async function loadRuns() {
  const response = await fetch("/api/runs");
  const data = await response.json();
  renderRuns(data.runs);
}

async function loadAppStatus() {
  const response = await fetch("/api/app/status");
  const data = await response.json();
  renderAppStatus(data);
  return data;
}

function watchAppStatus() {
  if (appStatusTimer) return;
  appStatusTimer = window.setInterval(async () => {
    const status = await loadAppStatus();
    if (status.state !== "running" && status.state !== "starting" && status.state !== "stopping") {
      window.clearInterval(appStatusTimer);
      appStatusTimer = 0;
    }
  }, 1500);
}

function appendMessage({ agent, round, roundTitle, text, kind = "message" }) {
  const item = document.createElement("article");
  const roundLabel = roundTitle || (round ? `Round ${round}` : "");
  item.className = `message ${kind === "debug" ? "debug" : "agent-message"}`;
  item.innerHTML = `
    <div class="message-title">
      <span>${escapeHtml(agent || "System")}</span>
      <span>${escapeHtml(roundLabel)}</span>
    </div>
    <pre></pre>
  `;
  item.querySelector("pre").textContent = text;
  transcriptEl.append(item);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  return item;
}

async function readNdjson(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      handleEvent(JSON.parse(line));
    }
  }

  if (buffer.trim()) {
    handleEvent(JSON.parse(buffer));
  }
}

function handleEvent(event) {
  if (event.type === "start") {
    setState("Running");
    setDebateStatus("running");
    appendMessage({
      agent: "System",
      text: `Saved to runs/${event.file}\nAgents: ${(event.agents || []).join(", ")}\nWorkflow: 3 debate rounds + final synthesis`,
    });
  }

  if (event.type === "agent-start") {
    setState(`${event.agent} · ${event.roundTitle || `round ${event.round}`}`);
    setDebateStatus("running");
  }

  if (event.type === "debug") {
    const text = event.text.trim();
    if (text) appendMessage({ agent: event.agent, text, kind: "debug" });
  }

  if (event.type === "agent-done") {
    appendMessage({
      agent: event.agent,
      round: event.round,
      roundTitle: event.roundTitle,
      text: event.response || "",
    });
  }

  if (event.type === "done") {
    setState("Done");
    setDebateStatus("done");
    playCompletionSound();
    loadRuns();
  }
}

function openAgentForm(agent = null) {
  agentForm.hidden = false;
  agentIdInput.value = agent?.id || "";
  agentNameInput.value = agent?.name || "";
  agentCommandInput.value = agent?.command || "";
  agentArgsInput.value = JSON.stringify(agent?.args || [], null, 2);
  agentInputMode.value = agent?.input || "stdin";
  agentEnabledInput.checked = agent?.enabled !== false;
  agentNote.textContent = agent
    ? "Editing an existing agent connection."
    : "Use {prompt} or {outputFile} in args when a CLI needs placeholders.";
  agentNameInput.focus();
}

function closeAgentForm() {
  agentForm.hidden = true;
  agentForm.reset();
  agentIdInput.value = "";
  agentNote.textContent = "Use {prompt} or {outputFile} in args when a CLI needs placeholders.";
}

function parseAgentArgs() {
  const raw = agentArgsInput.value.trim();
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("Arguments must be a JSON array.");
  return value.map((arg) => String(arg));
}

async function saveAgent(event) {
  event.preventDefault();
  agentNote.textContent = "Saving...";

  try {
    const args = parseAgentArgs();
    const id = agentIdInput.value || agentNameInput.value;
    const nextAgent = {
      id,
      name: agentNameInput.value.trim(),
      command: agentCommandInput.value.trim(),
      args,
      input: agentInputMode.value,
      enabled: agentEnabledInput.checked,
    };

    if (!nextAgent.name || !nextAgent.command) {
      throw new Error("Name and command are required.");
    }

    const existingIndex = agents.findIndex((agent) => agent.id === agentIdInput.value);
    const nextAgents = existingIndex >= 0 ? [...agents] : [...agents, nextAgent];
    if (existingIndex >= 0) nextAgents[existingIndex] = nextAgent;

    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agents: nextAgents }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not save agent.");
    }

    renderAgents(data.agents);
    closeAgentForm();
  } catch (error) {
    agentNote.textContent = error.message;
  }
}

async function startDebate(event) {
  event.preventDefault();
  const topic = topicInput.value.trim();
  if (!topic) {
    topicInput.focus();
    return;
  }

  transcriptEl.innerHTML = "";
  startButton.disabled = true;
  setState("Starting");
  setDebateStatus("starting");
  primeCompletionSound();

  try {
    const projectReady = await validateProjectPath();
    if (!projectReady) {
      setState("Project error");
      setDebateStatus("error");
      return;
    }

    const response = await fetch("/api/debate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        context: contextInput.value,
        projectPath: projectPathInput.value,
        language: languageInput.value,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      appendMessage({ agent: "System", text: data.error || "Request failed" });
      setState("Error");
      setDebateStatus("error");
      return;
    }

    await readNdjson(response);
  } catch (error) {
    appendMessage({ agent: "System", text: error.message });
    setState("Error");
    setDebateStatus("error");
  } finally {
    startButton.disabled = false;
  }
}

async function toggleAppRun() {
  runAppButton.disabled = true;

  try {
    const action =
      appRunState.state === "running" || appRunState.state === "starting" ? "stop" : "start";

    if (action === "start") {
      const projectReady = await validateProjectPath();
      if (!projectReady) return;
    }

    const response = await fetch("/api/app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        projectPath: projectPathInput.value,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      renderAppStatus({ state: "stopped", error: data.error || "Could not run app." });
      return;
    }

    renderAppStatus(data);
    watchAppStatus();
  } catch (error) {
    renderAppStatus({ state: "stopped", error: error.message });
  } finally {
    runAppButton.disabled = false;
  }
}

contextFile.addEventListener("change", async () => {
  const file = contextFile.files?.[0];
  if (!file) return;
  contextInput.value = await file.text();
});

agentList.addEventListener("click", (event) => {
  const button = event.target.closest(".agent-edit");
  if (!button) return;
  const agent = agents.find((item) => item.id === button.dataset.agentId);
  if (agent) openAgentForm(agent);
});

refreshStatus.addEventListener("click", loadStatus);
useProjectButton.addEventListener("click", validateProjectPath);
addAgentButton.addEventListener("click", () => openAgentForm());
cancelAgentButton.addEventListener("click", closeAgentForm);
agentForm.addEventListener("submit", saveAgent);
debateForm.addEventListener("submit", startDebate);
runAppButton.addEventListener("click", toggleAppRun);

loadStatus();
loadRuns();
loadAppStatus().then((status) => {
  if (status.state === "running" || status.state === "starting" || status.state === "stopping") {
    watchAppStatus();
  }
});

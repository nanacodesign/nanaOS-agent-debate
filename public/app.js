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
const runSearchForm = document.querySelector("#runSearchForm");
const runSearchInput = document.querySelector("#runSearch");
const runSearchStatus = document.querySelector("#runSearchStatus");
const refreshStatus = document.querySelector("#refreshStatus");
const debateForm = document.querySelector("#debateForm");
const startButton = document.querySelector("#startButton");
const topicInput = document.querySelector("#topic");
const skillSearchInput = document.querySelector("#skillSearch");
const skillResultsEl = document.querySelector("#skillResults");
const selectedSkillsEl = document.querySelector("#selectedSkills");
const contextInput = document.querySelector("#context");
const contextFile = document.querySelector("#contextFile");
const contextImportButton = document.querySelector("#contextImportButton");
const contextImportStatus = document.querySelector("#contextImportStatus");
const transcriptEl = document.querySelector("#transcript");
const runState = document.querySelector("#runState");
const debateStatus = document.querySelector("#debateStatus");
const workflowList = document.querySelector("#workflowList");
const workflowStatus = document.querySelector("#workflowStatus");
const projectPathInput = document.querySelector("#projectPath");
const useProjectButton = document.querySelector("#useProjectButton");
const projectNote = document.querySelector("#projectNote");
const runAppButton = document.querySelector("#runAppButton");
const appStatus = document.querySelector("#appStatus");
const openSettings = document.querySelector("#openSettings");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsLanguageSelect = document.querySelector("#settingsLanguageSelect");
const settingsThemeSelect = document.querySelector("#settingsThemeSelect");
const settingsClose = document.querySelector("#settingsClose");
const settingsDone = document.querySelector("#settingsDone");

const STORAGE_KEYS = {
  language: "agentDebate.language",
  projectPath: "agentDebate.projectPath",
  theme: "agentDebate.theme",
  workflow: "agentDebate.workflow",
};

const LANGUAGE_OPTIONS = [
  "Korean",
  "English",
  "Japanese",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Vietnamese",
  "Thai",
  "Indonesian",
  "Hindi",
  "Arabic",
  "Turkish",
  "Dutch",
  "Swedish",
  "Polish",
  "Ukrainian",
  "Russian",
  "Czech",
  "Greek",
  "Hebrew",
  "Malay",
  "Filipino",
  "Bengali",
  "Urdu",
  "Tamil",
  "Telugu",
];
const LANGUAGE_VALUES = new Set(LANGUAGE_OPTIONS);
const THEME_OPTIONS = [
  { value: "system", labelKey: "theme.system" },
  { value: "light", labelKey: "theme.light" },
  { value: "dark", labelKey: "theme.dark" },
];
const THEME_VALUES = new Set(THEME_OPTIONS.map((option) => option.value));
const TEXT_IMPORT_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);
const IMAGE_IMPORT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const IMAGE_IMPORT_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MAX_IMAGE_IMPORT_BYTES = 2 * 1024 * 1024;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DEFAULT_WORKFLOW_STEPS = [
  "Read the topic and state independent positions. Agents do not see one another's first answer. Default order: Codex -> Gemini -> Claude.",
  "Debate first: read every position and state your updated view.",
  "Debate second: challenge tradeoffs and refine the recommendation.",
  "Debate third: settle remaining disagreements and name the strongest direction.",
  "Codex synthesizes every position into one decision.",
];
const WORKFLOW_STEP_COUNT = DEFAULT_WORKFLOW_STEPS.length;

const UI_COPY = {
  "app.run": "Run App",
  "app.running": "App is running.",
  "app.runningAt": "Running at:",
  "app.starting": "Starting app...",
  "app.stop": "Stop App",
  "app.stopped": "App is stopped.",
  "app.stopping": "Stopping app...",
  "agents.add": "Add",
  "agents.args": "Arguments JSON",
  "agents.argsCount": "{count} args",
  "agents.argsInvalid": "Arguments must be a JSON array.",
  "agents.argsPlaceholder": "[\"exec\", \"--skip-git-repo-check\", \"-\"]",
  "agents.command": "Command",
  "agents.commandPlaceholder": "codex",
  "agents.couldNotSave": "Could not save agent.",
  "agents.edit": "Edit",
  "agents.editing": "Editing an existing agent connection.",
  "agents.empty": "No agents configured.",
  "agents.enabled": "Enabled",
  "agents.inputMode": "Input mode",
  "agents.name": "Name",
  "agents.namePlaceholder": "Codex",
  "agents.required": "Name and command are required.",
  "agents.save": "Save Agent",
  "agents.saving": "Saving...",
  "agents.status.disabled": "Disabled",
  "agents.status.missing": "Missing",
  "agents.status.ready": "Ready",
  "agents.subtitle": "Connect the CLIs you want in the debate.",
  "agents.title": "Agent Connections",
  "agents.usage": "Use {prompt} or {outputFile} in args when a CLI needs placeholders.",
  "brand.subtitle": "nanaOS-flavored local debate room for CLI agents",
  "common.cancel": "Cancel",
  "composer.context": "Context",
  "composer.contextPlaceholder": "Paste drafts, link notes, and requirements to reference",
  "composer.import": "Import",
  "composer.imported": "Imported {count} file{plural}.",
  "composer.importing": "Importing {count} file{plural}...",
  "composer.importSkipped": "Skipped {count} file{plural}: {details}.",
  "composer.start": "Start Debate",
  "composer.subtitle": "Topic and context.",
  "composer.title": "Composer",
  "composer.topic": "Topic",
  "composer.topicPlaceholder": "Example: Can this API name be simplified to start/end?",
  "debate.subtitle": "Live output streams into the transcript.",
  "debate.title": "Debate Room",
  "language.english": "English",
  "language.japanese": "Japanese",
  "language.korean": "Korean",
  "message.agents": "Agents: {agents}",
  "message.round": "Round {round}",
  "message.requestFailed": "Request failed",
  "message.savedTo": "Saved to runs/{file}",
  "message.skills": "Skills: {skills}",
  "message.system": "System",
  "message.workflow": "Workflow: {count} custom steps",
  "project.checking": "Checking location...",
  "project.couldNotUse": "Could not use this location.",
  "project.local": "local",
  "project.note": "Agents will run from this folder.",
  "project.path": "Path",
  "project.pathPlaceholder": "/path/to/project",
  "project.subtitle": "Agents run from this folder.",
  "project.title": "Project",
  "project.useLocation": "Use Location",
  "refresh.icon": "Refresh",
  "refresh.label": "Status",
  "runs.empty": "No debates",
  "runs.matches": "{count} debate{plural} found",
  "runs.noMatches": "No matching debates",
  "runs.searchAria": "Search debate transcripts",
  "runs.searchLabel": "Search debates",
  "runs.searchPlaceholder": "Search debates",
  "runs.subtitle": "Recent debate transcripts.",
  "runs.title": "Debates",
  "settings.close": "Close settings",
  "settings.done": "Done",
  "settings.language": "Language",
  "settings.open": "Settings",
  "settings.theme": "Theme",
  "settings.title": "Settings",
  "skills.assist": "Type a slash command or skill name, then choose a skill from the results.",
  "skills.label": "Skills",
  "skills.noResults": "No matching skills.",
  "skills.placeholder": "/modern",
  "skills.remove": "Remove {skill}",
  "skills.searching": "Searching skills...",
  "state.agentRound": "{agent} · {round}",
  "state.done": "Done",
  "state.error": "Error",
  "state.projectError": "Project error",
  "state.ready": "Ready",
  "state.running": "Running",
  "state.starting": "Starting",
  "status.done": "Finished",
  "status.error": "Error",
  "status.ready": "Ready",
  "status.running": "Debating",
  "status.starting": "Starting",
  "theme.dark": "Dark",
  "theme.light": "Light",
  "theme.system": "System",
  "transcript.empty": "No debate yet",
  "workflow.complete": "Complete",
  "workflow.edit": "Edit step {step}",
  "workflow.listLabel": "Debate workflow",
  "workflow.pending": "Pending",
  "workflow.required": "Workflow step is required.",
  "workflow.running": "Running",
  "workflow.save": "Save",
  "workflow.saved": "Workflow step saved.",
  "workflow.stepField": "Step {step} instruction",
  "workflow.stepLabel": "Step {step}",
  "workflow.subtitle": "Designed for quick maintainer decisions before coding.",
  "workflow.title": "Workflow",
};

function readLanguageSetting() {
  const savedLanguage = localStorage.getItem(STORAGE_KEYS.language);
  return LANGUAGE_VALUES.has(savedLanguage) ? savedLanguage : "Korean";
}

function readThemeSetting() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  return THEME_VALUES.has(savedTheme) ? savedTheme : "system";
}

function normalizeWorkflowSteps(value) {
  const source = Array.isArray(value) ? value : DEFAULT_WORKFLOW_STEPS;
  const steps = source
    .map((step) => String(step || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, WORKFLOW_STEP_COUNT);

  while (steps.length < WORKFLOW_STEP_COUNT) {
    steps.push(DEFAULT_WORKFLOW_STEPS[steps.length]);
  }

  return steps;
}

function readWorkflowSteps() {
  try {
    return normalizeWorkflowSteps(JSON.parse(localStorage.getItem(STORAGE_KEYS.workflow) || "[]"));
  } catch {
    return normalizeWorkflowSteps(DEFAULT_WORKFLOW_STEPS);
  }
}

const appSettings = {
  language: readLanguageSetting(),
  theme: readThemeSetting(),
};

const savedProjectPath = localStorage.getItem(STORAGE_KEYS.projectPath);
if (savedProjectPath) {
  projectPathInput.value = savedProjectPath;
}

let agents = [];
let runs = [];
let appRunState = { state: "stopped" };
let appStatusTimer = 0;
let notificationAudioContext = null;
let currentDebateStatus = "ready";
let currentState = { key: "state.ready", params: {} };
let projectNoteState = { key: "project.note", params: {} };
let agentNoteState = { key: "agents.usage", params: {} };
let workflowSteps = readWorkflowSteps();
let editingWorkflowIndex = -1;
let workflowProgress = { activeIndex: -1, completedIndex: -1 };
let skillResults = [];
let selectedSkills = [];
let highlightedSkillIndex = -1;
let skillSearchTimer = 0;
let skillSearchRequest = 0;

function t(key, params = {}) {
  const template = UI_COPY[key] || key;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

function plural(count) {
  return count === 1 ? "" : "s";
}

function getFileExtension(name) {
  const extensionIndex = name.lastIndexOf(".");
  return extensionIndex === -1 ? "" : name.slice(extensionIndex).toLowerCase();
}

function normalizeFileName(name) {
  return String(name || "Untitled file")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isTextImport(file) {
  return file.type.startsWith("text/") || TEXT_IMPORT_EXTENSIONS.has(getFileExtension(file.name));
}

function isImageImport(file) {
  return IMAGE_IMPORT_TYPES.has(file.type) || IMAGE_IMPORT_EXTENSIONS.has(getFileExtension(file.name));
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== "function") {
      reject(new Error("FileReader is not available."));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("File import failed.")));
    reader.readAsDataURL(file);
  });
}

function bytesToBase64(bytes) {
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];

    output += BASE64_ALPHABET[first >> 2];
    output += BASE64_ALPHABET[((first & 3) << 4) | ((second || 0) >> 4)];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[((second & 15) << 2) | ((third || 0) >> 6)] : "=";
    output += index + 2 < bytes.length ? BASE64_ALPHABET[third & 63] : "=";
  }

  return output;
}

async function readFileAsDataUrl(file) {
  try {
    return await readAsDataUrl(file);
  } catch (error) {
    if (typeof file.arrayBuffer !== "function") throw error;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return `data:${file.type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
  }
}

function appendContextImport(text) {
  const nextText = text.trim();
  if (!nextText) return;

  const currentText = contextInput.value.trimEnd();
  contextInput.value = currentText ? `${currentText}\n\n---\n\n${nextText}\n` : `${nextText}\n`;
  contextInput.focus();
}

async function buildTextImport(file) {
  const text = await file.text();
  return [`## Imported text: ${normalizeFileName(file.name)}`, "", text.trim()].join("\n");
}

async function buildImageImport(file) {
  if (file.size > MAX_IMAGE_IMPORT_BYTES) {
    throw new Error(`${normalizeFileName(file.name)} is larger than ${formatBytes(MAX_IMAGE_IMPORT_BYTES)}`);
  }

  const dataUrl = await readFileAsDataUrl(file);
  return [
    `## Imported image: ${normalizeFileName(file.name)}`,
    `Type: ${file.type || "unknown"}`,
    `Size: ${formatBytes(file.size)}`,
    "",
    "Data URL:",
    dataUrl,
  ].join("\n");
}

async function importContextFiles() {
  const files = Array.from(contextFile.files || []);
  if (!files.length) return;

  contextImportStatus.textContent = t("composer.importing", {
    count: files.length,
    plural: plural(files.length),
  });

  const importedBlocks = [];
  const skipped = [];

  for (const file of files) {
    try {
      if (isTextImport(file)) {
        importedBlocks.push(await buildTextImport(file));
        continue;
      }

      if (isImageImport(file)) {
        importedBlocks.push(await buildImageImport(file));
        continue;
      }

      skipped.push(`${normalizeFileName(file.name)} is not a supported file type`);
    } catch (error) {
      skipped.push(error.message);
    }
  }

  if (importedBlocks.length) {
    appendContextImport(importedBlocks.join("\n\n---\n\n"));
  }

  const statusParts = [];
  if (importedBlocks.length) {
    statusParts.push(
      t("composer.imported", {
        count: importedBlocks.length,
        plural: plural(importedBlocks.length),
      }),
    );
  }
  if (skipped.length) {
    statusParts.push(
      t("composer.importSkipped", {
        count: skipped.length,
        plural: plural(skipped.length),
        details: skipped.join("; "),
      }),
    );
  }

  contextImportStatus.textContent = statusParts.join(" ");
  contextFile.value = "";
}

function normalizeSkillQuery(value) {
  return String(value || "")
    .trim()
    .replace(/^[/@$]+/, "")
    .trim();
}

function normalizeRunQuery(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function filteredRuns() {
  const query = normalizeRunQuery(runSearchInput.value);
  if (!query) return runs;

  return runs.filter((run) =>
    normalizeRunQuery(`${run.name || ""} ${run.file || ""}`).includes(query),
  );
}

function updateRunSearchStatus(count) {
  const query = normalizeRunQuery(runSearchInput.value);
  runSearchStatus.textContent = query
    ? t("runs.matches", { count, plural: plural(count) })
    : "";
}

function isSkillSelected(skill) {
  return selectedSkills.some((selectedSkill) => selectedSkill.id === skill.id);
}

function selectedSkillPayload() {
  return selectedSkills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    title: skill.title,
    description: skill.description,
    source: skill.source,
  }));
}

function setSkillResultsOpen(isOpen) {
  skillSearchInput.setAttribute("aria-expanded", String(isOpen));
  skillResultsEl.hidden = !isOpen;
  if (!isOpen) {
    highlightedSkillIndex = -1;
    skillSearchInput.removeAttribute("aria-activedescendant");
  }
}

function renderSelectedSkills() {
  selectedSkillsEl.innerHTML = selectedSkills
    .map(
      (skill) => `
        <button
          class="chip chip--outlined skill-chip"
          type="button"
          aria-label="${escapeHtml(t("skills.remove", { skill: skill.title }))}"
          data-skill-id="${escapeHtml(skill.id)}"
        >
          <span class="chip__label">${escapeHtml(skill.title)}</span>
          <span class="chip__end-icon icon" aria-hidden="true">close</span>
        </button>
      `,
    )
    .join("");
}

function renderSkillResults() {
  if (!skillResults.length) {
    skillResultsEl.innerHTML = `<div class="skill-empty">${escapeHtml(t("skills.noResults"))}</div>`;
    setSkillResultsOpen(true);
    return;
  }

  skillResultsEl.innerHTML = skillResults
    .map((skill, index) => {
      const isHighlighted = index === highlightedSkillIndex;
      const isSelected = isSkillSelected(skill);
      return `
        <button
          type="button"
          class="skill-option${isHighlighted ? " is-highlighted" : ""}${isSelected ? " is-selected" : ""}"
          id="skill-option-${index}"
          role="option"
          aria-selected="${isHighlighted}"
          data-skill-index="${index}"
        >
          <span class="skill-option__main">
            <span class="skill-option__name">${escapeHtml(skill.title)}</span>
            <span class="skill-option__description">${escapeHtml(skill.description || skill.name)}</span>
          </span>
          <span class="tag tag--12 tag--rectangle">${escapeHtml(skill.source)}</span>
        </button>
      `;
    })
    .join("");

  skillSearchInput.setAttribute("aria-activedescendant", `skill-option-${Math.max(highlightedSkillIndex, 0)}`);
  setSkillResultsOpen(true);
}

function selectSkill(skill) {
  if (!skill || isSkillSelected(skill)) return;
  selectedSkills = [...selectedSkills, skill];
  renderSelectedSkills();
  skillSearchInput.value = "";
  skillResults = [];
  setSkillResultsOpen(false);
  skillSearchInput.focus();
}

async function searchSkillsNow() {
  const query = normalizeSkillQuery(skillSearchInput.value);
  const requestId = skillSearchRequest + 1;
  skillSearchRequest = requestId;

  if (!query) {
    skillResults = [];
    setSkillResultsOpen(false);
    return;
  }

  skillResultsEl.innerHTML = `<div class="skill-empty">${escapeHtml(t("skills.searching"))}</div>`;
  setSkillResultsOpen(true);

  try {
    const response = await fetch(`/api/skills?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (requestId !== skillSearchRequest) return;
    skillResults = data.skills || [];
    highlightedSkillIndex = skillResults.length ? 0 : -1;
    renderSkillResults();
  } catch (error) {
    if (requestId !== skillSearchRequest) return;
    skillResults = [];
    skillResultsEl.innerHTML = `<div class="skill-empty">${escapeHtml(error.message)}</div>`;
    setSkillResultsOpen(true);
  }
}

function scheduleSkillSearch() {
  window.clearTimeout(skillSearchTimer);
  skillSearchTimer = window.setTimeout(searchSkillsNow, 160);
}

function moveSkillHighlight(direction) {
  if (!skillResults.length) return;
  highlightedSkillIndex =
    (highlightedSkillIndex + direction + skillResults.length) % skillResults.length;
  renderSkillResults();
}

function handleSkillOptionSelect(event) {
  const option = event.target.closest("[data-skill-index]");
  if (!option) return;
  event.preventDefault();
  selectSkill(skillResults[Number(option.dataset.skillIndex)]);
}

function handleSkillSearchKeydown(event) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (skillResultsEl.hidden) {
      scheduleSkillSearch();
      return;
    }
    moveSkillHighlight(1);
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSkillHighlight(-1);
  }

  if (event.key === "Enter" && !skillResultsEl.hidden && highlightedSkillIndex >= 0) {
    event.preventDefault();
    selectSkill(skillResults[highlightedSkillIndex]);
  }

  if (event.key === "Escape") {
    setSkillResultsOpen(false);
  }
}

function removeSelectedSkill(skillId) {
  selectedSkills = selectedSkills.filter((skill) => skill.id !== skillId);
  renderSelectedSkills();
}

function applyTheme() {
  document.documentElement.dataset.theme = appSettings.theme;
}

function setTranslatedAttributes(selector, attribute, keyAttribute) {
  document.querySelectorAll(selector).forEach((element) => {
    element.setAttribute(attribute, t(element.dataset[keyAttribute]));
  });
}

function setTranslatedProperties(selector, property, keyAttribute) {
  document.querySelectorAll(selector).forEach((element) => {
    element[property] = t(element.dataset[keyAttribute]);
  });
}

function languageSelectItems() {
  return LANGUAGE_OPTIONS.map((language) => ({ value: language, label: language }));
}

function themeSelectItems() {
  return THEME_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }));
}

function renderSelectOptions(select, options, value) {
  select.innerHTML = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
    )
    .join("");
  select.value = value;
}

function syncSettingsControls() {
  renderSelectOptions(settingsLanguageSelect, languageSelectItems(), appSettings.language);
  renderSelectOptions(settingsThemeSelect, themeSelectItems(), appSettings.theme);
}

function applyLanguage() {
  document.documentElement.lang = "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  setTranslatedAttributes("[data-i18n-placeholder]", "placeholder", "i18nPlaceholder");
  setTranslatedAttributes("[data-i18n-aria-label]", "aria-label", "i18nAriaLabel");
  syncSettingsControls();
  transcriptEl.dataset.emptyLabel = t("transcript.empty");
  setDebateStatus(currentDebateStatus);
  renderCurrentState();
  if (projectNoteState.key) setProjectNote(projectNoteState.key, projectNoteState.params);
  else setProjectNoteText(projectNoteState.text || "");
  if (agentNoteState.key) setAgentNote(agentNoteState.key, agentNoteState.params);
  else setAgentNoteText(agentNoteState.text || "");
  renderAgents(agents);
  renderRuns(runs);
  renderWorkflow();
  renderAppStatus(appRunState);
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.language, appSettings.language);
  localStorage.setItem(STORAGE_KEYS.theme, appSettings.theme);
}

function applySettings() {
  syncSettingsControls();
  applyTheme();
  applyLanguage();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function findLanguageValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return LANGUAGE_OPTIONS.find((option) => option.toLowerCase() === normalized) || "";
}

function selectLanguage(value) {
  const nextLanguage = findLanguageValue(value);
  if (!nextLanguage) return false;

  appSettings.language = nextLanguage;
  saveSettings();
  applyLanguage();
  return true;
}

function renderCurrentState() {
  if (!runState) return;
  runState.textContent = currentState.key
    ? t(currentState.key, currentState.params)
    : currentState.text;
}

function setState(key, params = {}) {
  currentState = { key, params };
  renderCurrentState();
}

function setProjectNote(key, params = {}) {
  projectNoteState = { key, params };
  projectNote.textContent = t(key, params);
}

function setProjectNoteText(text) {
  projectNoteState = { text };
  projectNote.textContent = text;
}

function setAgentNote(key, params = {}) {
  agentNoteState = { key, params };
  agentNote.textContent = t(key, params);
}

function setAgentNoteText(text) {
  agentNoteState = { text };
  agentNote.textContent = text;
}

function setDebateStatus(status) {
  currentDebateStatus = status;
  debateStatus.textContent = t(`status.${status}`) || t("status.ready");
  debateStatus.classList.remove("is-ready", "is-starting", "is-running", "is-done", "is-error");
  debateStatus.classList.add("debate-status", `is-${status}`);
  renderWorkflow();
}

function isDebateLocked() {
  return currentDebateStatus === "starting" || currentDebateStatus === "running";
}

function workflowStepState(index) {
  if (workflowProgress.activeIndex === index) return "running";
  if (index <= workflowProgress.completedIndex) return "complete";
  return "pending";
}

function workflowStateLabel(state) {
  if (state === "running") return t("workflow.running");
  if (state === "complete") return t("workflow.complete");
  return t("workflow.pending");
}

function saveWorkflowSteps() {
  localStorage.setItem(STORAGE_KEYS.workflow, JSON.stringify(workflowSteps));
}

function renderWorkflow() {
  const locked = isDebateLocked();
  workflowList.innerHTML = workflowSteps
    .map((step, index) => {
      const stepNumber = index + 1;
      const state = workflowStepState(index);
      const stateLabel = workflowStateLabel(state);

      if (editingWorkflowIndex === index) {
        return `
          <div class="list__item workflow-step workflow-step--editing is-${state}" role="listitem" data-workflow-index="${index}" aria-current="${state === "running" ? "step" : "false"}">
            <span class="list__item-icon workflow-indicator is-${state}" aria-hidden="true"></span>
            <form class="workflow-edit-form" data-workflow-index="${index}">
              <label class="textarea-field workflow-edit-field" for="workflowStep${stepNumber}">
                <span class="textarea-label visually-hidden">${escapeHtml(t("workflow.stepField", { step: stepNumber }))}</span>
                <textarea id="workflowStep${stepNumber}" class="textarea workflow-edit-input" data-density="12" name="step" rows="3" maxlength="700" required>${escapeHtml(step)}</textarea>
              </label>
              <button class="button button--filled button--14 button--round workflow-save-button list__item-end" type="submit">
                <span class="button__label">${escapeHtml(t("workflow.save"))}</span>
              </button>
            </form>
          </div>
        `;
      }

      return `
        <div class="list__item workflow-step is-${state}" role="listitem" data-workflow-index="${index}" aria-current="${state === "running" ? "step" : "false"}">
          <span class="list__item-icon workflow-indicator is-${state}" aria-hidden="true"></span>
          <div class="title-body workflow-step__text">
            <strong class="title-body__title">${escapeHtml(t("workflow.stepLabel", { step: stepNumber }))}</strong>
            <span class="title-body__body">${escapeHtml(step)}</span>
            <span class="visually-hidden">${escapeHtml(stateLabel)}</span>
          </div>
          <button class="button button--plain button--14 button--circle button--icon-only workflow-icon-button list__item-end" type="button" data-workflow-edit="${index}" aria-label="${escapeHtml(t("workflow.edit", { step: stepNumber }))}" ${locked ? "disabled" : ""}>
            <span class="button__icon icon" aria-hidden="true">edit</span>
          </button>
        </div>
      `;
    })
    .join("");
}

function setWorkflowProgress(activeIndex, completedIndex = workflowProgress.completedIndex) {
  workflowProgress = { activeIndex, completedIndex };
  renderWorkflow();
}

function resetWorkflowProgress() {
  workflowProgress = { activeIndex: -1, completedIndex: -1 };
  renderWorkflow();
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
  if (!agent.enabled) return { className: "is-disabled", label: t("agents.status.disabled") };
  if (agent.connected) return { className: "is-ready", label: t("agents.status.ready"), icon: "check" };
  return { className: "is-missing", label: t("agents.status.missing") };
}

function renderAgents(nextAgents) {
  agents = nextAgents;
  agentList.innerHTML = agents.length
    ? agents
        .map((agent) => {
          const status = agentStatus(agent);
          const args = Array.isArray(agent.args) ? agent.args : [];
          const agentId = agent.id || agent.name || agent.command || "";
          const agentName = agent.name || agentId || "Agent";
          const agentCommand = agent.command || "";
          const inputMode = agent.input || "stdin";
          const statusIcon = status.icon
            ? `<span class="icon agent-card__status-icon" aria-hidden="true">${status.icon}</span>`
            : "";
          return `
            <article class="agent-card ${status.className}">
              <div class="agent-card__main">
                <div class="agent-card__identity">
                  ${statusIcon}
                  <div class="agent-card__copy">
                    <h3>${escapeHtml(agentName)}</h3>
                    <p>${escapeHtml(agentCommand)}</p>
                  </div>
                </div>
                <span class="tag tag--12 tag--rectangle">${status.label}</span>
              </div>
              <div class="agent-card__meta">
                <span>${escapeHtml(inputMode)}</span>
                <span>${escapeHtml(t("agents.argsCount", { count: args.length }))}</span>
              </div>
              <button class="button button--outlined button--14 button--round agent-edit" type="button" data-agent-id="${escapeHtml(agentId)}">
                <span class="button__label">${escapeHtml(t("agents.edit"))}</span>
              </button>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">${escapeHtml(t("agents.empty"))}</div>`;
}

function renderRuns(nextRuns) {
  if (Array.isArray(nextRuns)) {
    runs = nextRuns;
  }

  const visibleRuns = filteredRuns();
  runList.innerHTML = visibleRuns.length
    ? visibleRuns
        .map(
          (run) => `
            <a class="run-item run-link" href="/view/${encodeURIComponent(run.file)}" target="_blank" rel="noreferrer">
              ${escapeHtml(run.file)}
            </a>
          `,
        )
        .join("")
    : `<div class="run-item">${escapeHtml(t(runSearchInput.value ? "runs.noMatches" : "runs.empty"))}</div>`;
  updateRunSearchStatus(visibleRuns.length);
}

function renderAppStatus(status) {
  appRunState = status;
  const isRunning = status.state === "running" || status.state === "starting";

  runAppButton.querySelector(".button__label").textContent = isRunning ? t("app.stop") : t("app.run");
  runAppButton.classList.toggle("is-running", isRunning);
  appStatus.textContent = "";

  if (isRunning && status.url) {
    appStatus.append(`${t("app.runningAt")} `);
    const link = document.createElement("a");
    link.href = status.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = status.url;
    appStatus.append(link);
    return;
  }

  if (status.state === "starting") {
    appStatus.textContent = t("app.starting");
    return;
  }

  if (status.state === "stopping") {
    appStatus.textContent = t("app.stopping");
    return;
  }

  if (status.state === "running") {
    appStatus.textContent = t("app.running");
    return;
  }

  appStatus.textContent = status.error || t("app.stopped");
}

async function loadStatus() {
  const [statusResponse, agentsResponse] = await Promise.all([
    fetch("/api/status"),
    fetch("/api/agents"),
  ]);
  const statusData = await statusResponse.json();
  const agentsData = await agentsResponse.json();

  if (!localStorage.getItem(STORAGE_KEYS.projectPath) && statusData.defaultProjectPath) {
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
  setProjectNote("project.checking");

  try {
    const response = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath }),
    });
    const data = await response.json();

    if (!response.ok) {
      if (data.error) setProjectNoteText(data.error);
      else setProjectNote("project.couldNotUse");
      return false;
    }

    projectPathInput.value = data.projectPath;
    localStorage.setItem(STORAGE_KEYS.projectPath, data.projectPath);
    setProjectNote("project.note");
    return true;
  } catch (error) {
    setProjectNoteText(error.message);
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
  const roundLabel = roundTitle || (round ? t("message.round", { round }) : "");
  item.className = `message ${kind === "debug" ? "debug" : "agent-message"}`;
  item.innerHTML = `
    <div class="message-title">
      <span>${escapeHtml(agent || t("message.system"))}</span>
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
    setState("state.running");
    setDebateStatus("running");
    setWorkflowProgress(0, -1);
    appendMessage({
      agent: t("message.system"),
      text: [
        t("message.savedTo", { file: event.file }),
        t("message.agents", { agents: (event.agents || []).join(", ") }),
        (event.skills || []).length ? t("message.skills", { skills: event.skills.join(", ") }) : "",
        t("message.workflow", { count: (event.workflow || workflowSteps).length }),
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  if (event.type === "step-start") {
    setWorkflowProgress(event.stepIndex, event.stepIndex - 1);
  }

  if (event.type === "agent-start") {
    if (Number.isInteger(event.stepIndex)) {
      setWorkflowProgress(event.stepIndex, event.stepIndex - 1);
    }
    setState("state.agentRound", {
      agent: event.agent,
      round: event.roundTitle || t("message.round", { round: event.round }),
    });
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

  if (event.type === "step-done") {
    setWorkflowProgress(-1, event.stepIndex);
  }

  if (event.type === "done") {
    setWorkflowProgress(-1, workflowSteps.length - 1);
    setState("state.done");
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
  setAgentNote(agent ? "agents.editing" : "agents.usage");
  agentNameInput.focus();
}

function closeAgentForm() {
  agentForm.hidden = true;
  agentForm.reset();
  agentIdInput.value = "";
  setAgentNote("agents.usage");
}

function parseAgentArgs() {
  const raw = agentArgsInput.value.trim();
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error(t("agents.argsInvalid"));
  return value.map((arg) => String(arg));
}

async function saveAgent(event) {
  event.preventDefault();
  setAgentNote("agents.saving");

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
      throw new Error(t("agents.required"));
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
      throw new Error(data.error || t("agents.couldNotSave"));
    }

    renderAgents(data.agents);
    closeAgentForm();
  } catch (error) {
    setAgentNoteText(error.message);
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
  editingWorkflowIndex = -1;
  workflowStatus.textContent = "";
  resetWorkflowProgress();
  setState("state.starting");
  setDebateStatus("starting");
  primeCompletionSound();

  try {
    const projectReady = await validateProjectPath();
    if (!projectReady) {
      resetWorkflowProgress();
      setState("state.projectError");
      setDebateStatus("error");
      return;
    }

    const response = await fetch("/api/debate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        context: contextInput.value,
        skills: selectedSkillPayload(),
        workflow: workflowSteps,
        projectPath: projectPathInput.value,
        language: appSettings.language,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      appendMessage({ agent: t("message.system"), text: data.error || t("message.requestFailed") });
      resetWorkflowProgress();
      setState("state.error");
      setDebateStatus("error");
      return;
    }

    await readNdjson(response);
  } catch (error) {
    appendMessage({ agent: t("message.system"), text: error.message });
    resetWorkflowProgress();
    setState("state.error");
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

function openSettingsDialog() {
  syncSettingsControls();
  if (typeof settingsDialog.showModal === "function") {
    settingsDialog.showModal();
    return;
  }
  settingsDialog.setAttribute("open", "");
}

function closeSettingsDialog() {
  if (typeof settingsDialog.close === "function") {
    settingsDialog.close();
    return;
  }
  settingsDialog.removeAttribute("open");
}

function updateThemeSetting(value) {
  if (!THEME_VALUES.has(value)) return false;
  appSettings.theme = value;
  saveSettings();
  applyTheme();
  syncSettingsControls();
  return true;
}

function editWorkflowStep(index) {
  if (isDebateLocked()) return;
  editingWorkflowIndex = index;
  workflowStatus.textContent = "";
  renderWorkflow();
  window.requestAnimationFrame(() => {
    const input = workflowList.querySelector(`#workflowStep${index + 1}`);
    input?.focus();
    input?.select();
  });
}

function handleWorkflowClick(event) {
  const editButton = event.target.closest("[data-workflow-edit]");
  if (!editButton) return;
  editWorkflowStep(Number.parseInt(editButton.dataset.workflowEdit, 10));
}

function saveWorkflowStep(event) {
  const form = event.target.closest(".workflow-edit-form");
  if (!form) return;

  event.preventDefault();
  const index = Number.parseInt(form.dataset.workflowIndex, 10);
  const input = form.elements.step;
  const value = input.value.replace(/\s+/g, " ").trim();

  if (!value) {
    input.setCustomValidity(t("workflow.required"));
    input.reportValidity();
    return;
  }

  input.setCustomValidity("");
  workflowSteps = workflowSteps.map((step, stepIndex) => (stepIndex === index ? value : step));
  saveWorkflowSteps();
  editingWorkflowIndex = -1;
  workflowStatus.textContent = t("workflow.saved");
  renderWorkflow();
}

function handleWorkflowInput(event) {
  if (event.target.matches(".workflow-edit-input")) {
    event.target.setCustomValidity("");
  }
}

contextFile.addEventListener("change", importContextFiles);
contextImportButton.addEventListener("click", () => contextFile.click());
skillSearchInput.addEventListener("input", scheduleSkillSearch);
skillSearchInput.addEventListener("keydown", handleSkillSearchKeydown);
skillSearchInput.addEventListener("focus", () => {
  if (normalizeSkillQuery(skillSearchInput.value)) scheduleSkillSearch();
});
skillSearchInput.addEventListener("blur", () => {
  window.setTimeout(() => setSkillResultsOpen(false), 140);
});
skillResultsEl.addEventListener("pointerdown", handleSkillOptionSelect);
skillResultsEl.addEventListener("click", handleSkillOptionSelect);
selectedSkillsEl.addEventListener("chip-remove", (event) => {
  const chip = event.target.closest("[data-skill-id]");
  if (!chip) return;
  removeSelectedSkill(chip.dataset.skillId);
});
selectedSkillsEl.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-skill-id]");
  if (!chip) return;
  removeSelectedSkill(chip.dataset.skillId);
});

agentList.addEventListener("click", (event) => {
  const button = event.target.closest(".agent-edit");
  if (!button) return;
  const agent = agents.find(
    (item) => (item.id || item.name || item.command || "") === button.dataset.agentId,
  );
  if (agent) openAgentForm(agent);
});

refreshStatus.addEventListener("click", loadStatus);
useProjectButton.addEventListener("click", validateProjectPath);
openSettings.addEventListener("click", openSettingsDialog);
settingsDialog.addEventListener("close", syncSettingsControls);
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) closeSettingsDialog();
});
settingsClose.addEventListener("click", closeSettingsDialog);
settingsDone.addEventListener("click", closeSettingsDialog);
settingsLanguageSelect.addEventListener("change", (event) => {
  selectLanguage(event.target.value);
});
settingsThemeSelect.addEventListener("change", (event) => {
  updateThemeSetting(event.target.value);
});
addAgentButton.addEventListener("click", () => openAgentForm());
cancelAgentButton.addEventListener("click", closeAgentForm);
agentForm.addEventListener("submit", saveAgent);
debateForm.addEventListener("submit", startDebate);
runAppButton.addEventListener("click", toggleAppRun);
runSearchForm.addEventListener("submit", (event) => event.preventDefault());
runSearchInput.addEventListener("input", () => renderRuns());
workflowList.addEventListener("click", handleWorkflowClick);
workflowList.addEventListener("input", handleWorkflowInput);
workflowList.addEventListener("submit", saveWorkflowStep);

applySettings();
renderWorkflow();
loadStatus();
loadRuns();
loadAppStatus().then((status) => {
  if (status.state === "running" || status.state === "starting" || status.state === "stopping") {
    watchAppStatus();
  }
});

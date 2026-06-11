import { LANGUAGE_OPTIONS, TRANSLATIONS, UI_COPY } from "./i18n.js";

const agentList = document.querySelector("#agentList");
const agentForm = document.querySelector("#agentForm");
const agentIdInput = document.querySelector("#agentId");
const agentNameInput = document.querySelector("#agentName");
const agentCommandInput = document.querySelector("#agentCommand");
const agentArgsInput = document.querySelector("#agentArgs");
const agentInputMode = document.querySelector("#agentInput");
const agentEnabledInput = document.querySelector("#agentEnabled");
const agentTypeSelect = document.querySelector("#agentType");
const agentBaseUrlInput = document.querySelector("#agentBaseUrl");
const agentModelInput = document.querySelector("#agentModel");
const agentApiKeyEnvInput = document.querySelector("#agentApiKeyEnv");
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
const debateStatus = document.querySelector("#debateStatus");
const workflowList = document.querySelector("#workflowList");
const workflowStatus = document.querySelector("#workflowStatus");
const addWorkflowStepButton = document.querySelector("#addWorkflowStepButton");
const projectPathInput = document.querySelector("#projectPath");
const useProjectButton = document.querySelector("#useProjectButton");
const projectNote = document.querySelector("#projectNote");
const runAppButton = document.querySelector("#runAppButton");
const appStatus = document.querySelector("#appStatus");
const openSettings = document.querySelector("#openSettings");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsPopup = document.querySelector("#settingsPopup");
const settingsBackdrop = settingsDialog.querySelector(".dialog-backdrop");
const settingsClose = document.querySelector("#settingsClose");
const settingsDone = document.querySelector("#settingsDone");
const languageCombobox = document.querySelector("#languageCombobox");
const settingsLanguageInput = document.querySelector("#settingsLanguageInput");
const settingsLanguageTrigger = document.querySelector("#settingsLanguageTrigger");
const settingsLanguageList = document.querySelector("#settingsLanguageList");
const settingsLanguageEmpty = document.querySelector("#settingsLanguageEmpty");
const themeSelect = document.querySelector("#themeSelect");
const settingsThemeTrigger = document.querySelector("#settingsThemeTrigger");
const settingsThemeValue = document.querySelector("#settingsThemeValue");
const settingsThemeList = document.querySelector("#settingsThemeList");
const skillCombobox = document.querySelector("#skillCombobox");
const skillTrigger = document.querySelector("#skillTrigger");
const skillEmpty = document.querySelector("#skillEmpty");

const STORAGE_KEYS = {
  language: "agentDebate.language",
  projectPath: "agentDebate.projectPath",
  theme: "agentDebate.theme",
  workflow: "agentDebate.workflow",
};

const LANGUAGE_VALUES = new Set(LANGUAGE_OPTIONS.map((option) => option.value));
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
// Presets fill the endpoint and key-variable fields. The model field is left
// to the user so the UI never hardcodes a model name that can be retired.
const API_AGENT_PRESETS = {
  ollama: { name: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", apiKeyEnv: "" },
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" },
};

function readLanguageSetting() {
  const savedLanguage = localStorage.getItem(STORAGE_KEYS.language);
  return LANGUAGE_VALUES.has(savedLanguage) ? savedLanguage : "English";
}

function readThemeSetting() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  return THEME_VALUES.has(savedTheme) ? savedTheme : "system";
}

function normalizeWorkflowSteps(value) {
  const source = Array.isArray(value) ? value : DEFAULT_WORKFLOW_STEPS;
  const steps = source
    .map((step) => String(step || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return steps.length ? steps : [...DEFAULT_WORKFLOW_STEPS];
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
let editingAgentId = null;
let skillResults = [];
let selectedSkills = [];
let highlightedSkillIndex = -1;
let skillSearchTimer = 0;
let skillSearchRequest = 0;

function t(key, params = {}) {
  const translations = TRANSLATIONS[appSettings.language];
  const template = (translations && translations[key]) || UI_COPY[key] || key;
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

function setComboboxOpen(combobox, input, trigger, isOpen) {
  combobox.toggleAttribute("data-open", isOpen);
  input.setAttribute("aria-expanded", String(isOpen));
  combobox.querySelector(".combobox__positioner")?.toggleAttribute("data-open", isOpen);
  combobox.querySelector(".combobox__popup")?.toggleAttribute("data-open", isOpen);
  if (trigger) {
    trigger.toggleAttribute("data-popup-open", isOpen);
    trigger.setAttribute("aria-label", t(isOpen ? "combobox.close" : "combobox.open"));
  }
  if (!isOpen) input.removeAttribute("aria-activedescendant");
}

function setComboboxEmpty(combobox, emptyEl, message) {
  const isEmpty = Boolean(message);
  combobox.querySelector(".combobox__popup")?.toggleAttribute("data-empty", isEmpty);
  emptyEl.hidden = !isEmpty;
  emptyEl.textContent = message || "";
}

function setSkillResultsOpen(isOpen) {
  setComboboxOpen(skillCombobox, skillSearchInput, skillTrigger, isOpen);
  if (!isOpen) {
    highlightedSkillIndex = -1;
  }
}

function renderSelectedSkills() {
  selectedSkillsEl.innerHTML = selectedSkills
    .map(
      (skill) => `
        <span class="chip chip--size-14 skill-chip" data-trailing="remove" data-body-inert data-skill-id="${escapeHtml(skill.id)}">
          <button class="chip__action" type="button" tabindex="-1">
            <span class="chip__label">${escapeHtml(skill.title)}</span>
          </button>
          <button class="chip__remove" type="button" aria-label="${escapeHtml(t("skills.remove", { skill: skill.title }))}">
            <span class="chip__end-icon icon" aria-hidden="true">close</span>
          </button>
        </span>
      `,
    )
    .join("");
}

function renderSkillResults() {
  if (!skillResults.length) {
    skillResultsEl.innerHTML = "";
    setComboboxEmpty(skillCombobox, skillEmpty, t("skills.noResults"));
    setSkillResultsOpen(true);
    return;
  }

  setComboboxEmpty(skillCombobox, skillEmpty, "");
  skillResultsEl.innerHTML = skillResults
    .map((skill, index) => {
      const isHighlighted = index === highlightedSkillIndex;
      const isSelected = isSkillSelected(skill);
      return `
        <div
          class="combobox__option skill-option"
          id="skill-option-${index}"
          role="option"
          aria-selected="${isSelected}"
          ${isSelected ? "data-selected" : ""}
          ${isHighlighted ? "data-highlighted" : ""}
          data-skill-index="${index}"
        >
          <span class="combobox__option-text">${escapeHtml(skill.title)}</span>
          <span class="tag tag--12 tag--rectangle skill-option__source">${escapeHtml(skill.source)}</span>
        </div>
      `;
    })
    .join("");

  if (highlightedSkillIndex >= 0) {
    skillSearchInput.setAttribute("aria-activedescendant", `skill-option-${highlightedSkillIndex}`);
  } else {
    skillSearchInput.removeAttribute("aria-activedescendant");
  }
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

  skillResultsEl.innerHTML = "";
  setComboboxEmpty(skillCombobox, skillEmpty, t("skills.searching"));
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
    skillResultsEl.innerHTML = "";
    setComboboxEmpty(skillCombobox, skillEmpty, error.message);
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
  const isOpen = skillCombobox.hasAttribute("data-open");

  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!isOpen) {
      scheduleSkillSearch();
      return;
    }
    moveSkillHighlight(1);
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSkillHighlight(-1);
  }

  if (event.key === "Enter" && isOpen && highlightedSkillIndex >= 0) {
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
  let theme = appSettings.theme;
  if (theme === "system") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
}

// Listen for system theme changes
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (appSettings.theme === "system") {
    applyTheme();
  }
});

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

function themeSelectItems() {
  return THEME_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }));
}

/* Theme picker: design-system Select (button-triggered listbox). */

function renderThemeOptions() {
  const items = themeSelectItems();
  settingsThemeList.innerHTML = items
    .map((option) => {
      const isSelected = option.value === appSettings.theme;
      return `
        <button class="select__item" type="button" role="option" aria-selected="${isSelected}" ${isSelected ? "data-selected" : ""} data-value="${escapeHtml(option.value)}">
          <span class="select__item-text">${escapeHtml(option.label)}</span>
          ${isSelected ? `<span class="icon select__item-indicator" aria-hidden="true">check</span>` : ""}
        </button>
      `;
    })
    .join("");
  settingsThemeValue.textContent = items.find((option) => option.value === appSettings.theme)?.label || "";
}

function setThemeSelectOpen(isOpen) {
  themeSelect.toggleAttribute("data-open", isOpen);
  themeSelect.querySelector(".select__positioner").toggleAttribute("data-open", isOpen);
  settingsThemeTrigger.toggleAttribute("data-popup-open", isOpen);
  settingsThemeTrigger.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) settingsThemeTrigger.setAttribute("aria-controls", "settingsThemeList");
}

function focusThemeOption(direction) {
  const items = Array.from(settingsThemeList.querySelectorAll(".select__item"));
  if (!items.length) return;
  const activeIndex = items.indexOf(document.activeElement);
  const startIndex = activeIndex >= 0 ? activeIndex : items.findIndex((item) => item.hasAttribute("data-selected"));
  const nextIndex = startIndex < 0 ? 0 : (startIndex + direction + items.length) % items.length;
  items.forEach((item) => item.toggleAttribute("data-highlighted", item === items[nextIndex]));
  items[nextIndex].focus();
}

/* Language picker: design-system Combobox (filterable listbox). */

function renderLanguageOptions(query = "") {
  const normalized = query.trim().toLowerCase();
  const matches = LANGUAGE_OPTIONS.filter(
    (language) =>
      !normalized ||
      language.label.toLowerCase().includes(normalized) ||
      language.value.toLowerCase().includes(normalized),
  );
  settingsLanguageList.innerHTML = matches
    .map((language, index) => {
      const isSelected = language.value === appSettings.language;
      return `
        <div class="combobox__option" id="language-option-${index}" role="option" aria-selected="${isSelected}" ${isSelected ? "data-selected" : ""} data-value="${escapeHtml(language.value)}">
          <span class="combobox__option-text">${escapeHtml(language.label)}</span>
          ${isSelected ? `<span class="icon combobox__option-indicator" aria-hidden="true">check</span>` : ""}
        </div>
      `;
    })
    .join("");
  setComboboxEmpty(languageCombobox, settingsLanguageEmpty, matches.length ? "" : t("settings.noLanguages"));
  return matches;
}

function setLanguageOpen(isOpen) {
  setComboboxOpen(languageCombobox, settingsLanguageInput, settingsLanguageTrigger, isOpen);
  if (!isOpen) {
    settingsLanguageInput.value = getLanguageLabel(appSettings.language);
  }
}

function moveLanguageHighlight(direction) {
  const options = Array.from(settingsLanguageList.querySelectorAll(".combobox__option"));
  if (!options.length) return;
  const currentIndex = options.findIndex((option) => option.hasAttribute("data-highlighted"));
  const nextIndex = currentIndex < 0
    ? (direction < 0 ? options.length - 1 : 0)
    : (currentIndex + direction + options.length) % options.length;
  options.forEach((option, index) => option.toggleAttribute("data-highlighted", index === nextIndex));
  settingsLanguageInput.setAttribute("aria-activedescendant", options[nextIndex].id);
  options[nextIndex].scrollIntoView({ block: "nearest" });
}

function handleLanguageOptionSelect(event) {
  const option = event.target.closest(".combobox__option");
  if (!option) return;
  event.preventDefault();
  selectLanguage(option.dataset.value);
  setLanguageOpen(false);
}

function syncSettingsControls() {
  settingsLanguageInput.value = getLanguageLabel(appSettings.language);
  renderLanguageOptions();
  renderThemeOptions();
}

function applyLanguage() {
  document.documentElement.lang = getLanguageOption(appSettings.language)?.locale || "en";
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

function getLanguageOption(value) {
  return LANGUAGE_OPTIONS.find((option) => option.value === value);
}

function getLanguageLabel(value) {
  return getLanguageOption(value)?.label || value;
}

function findLanguageValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const match = LANGUAGE_OPTIONS.find(
    (option) =>
      option.value.toLowerCase() === normalized || option.label.toLowerCase() === normalized,
  );
  return match ? match.value : "";
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
  // UI slot for runState was removed.
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

/* Status indication uses the DS Badge (dot kind + tone); the adjacent text
 * label carries the meaning, so the dot itself stays aria-hidden. */
const DEBATE_STATUS_TONES = {
  ready: "unavailable",
  starting: "primary",
  running: "primary",
  done: "available",
  error: "alarm",
};

function statusBadge(tone) {
  return `<span class="badge badge--${tone}" data-kind="dot" data-tone="${tone}" data-placement="top-end" aria-hidden="true"></span>`;
}

function setDebateStatus(status) {
  currentDebateStatus = status;
  const tone = DEBATE_STATUS_TONES[status] || "unavailable";
  const badge = debateStatus.querySelector(".badge");
  badge.className = `badge badge--${tone}`;
  badge.setAttribute("data-tone", tone);
  debateStatus.querySelector(".debate-status__label").textContent =
    t(`status.${status}`) || t("status.ready");
  debateStatus.classList.remove("is-ready", "is-starting", "is-running", "is-done", "is-error");
  debateStatus.classList.add(`is-${status}`);
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

function workflowIndicator(state) {
  if (state === "running") {
    return `
      <span class="list__item-icon workflow-indicator is-running">
        <span class="spinner" role="status" data-size="14" data-label-hidden>
          <span class="spinner__icon" aria-hidden="true"></span>
          <span class="spinner__label">${escapeHtml(t("workflow.running"))}</span>
        </span>
      </span>
    `;
  }
  const glyph = state === "complete" ? "check_circle" : "circle";
  return `<span class="list__item-icon icon workflow-indicator is-${state}" aria-hidden="true">${glyph}</span>`;
}

function renderWorkflow() {
  const locked = isDebateLocked();
  if (addWorkflowStepButton) {
    addWorkflowStepButton.disabled = locked;
  }
  workflowList.innerHTML = workflowSteps
    .map((step, index) => {
      const stepNumber = index + 1;
      const state = workflowStepState(index);
      const stateLabel = workflowStateLabel(state);

      if (editingWorkflowIndex === index) {
        return `
          <div class="list__item workflow-step workflow-step--editing is-${state}" role="listitem" data-workflow-index="${index}" aria-current="${state === "running" ? "step" : "false"}">
            ${workflowIndicator(state)}
            <form class="workflow-edit-form" data-workflow-index="${index}">
              <label class="textarea-field workflow-edit-field" for="workflowStep${stepNumber}">
                <span class="textarea-label visually-hidden">${escapeHtml(t("workflow.stepField", { step: stepNumber }))}</span>
                <textarea id="workflowStep${stepNumber}" class="textarea workflow-edit-input" name="step" rows="3" maxlength="700" required>${escapeHtml(step)}</textarea>
              </label>
              <div class="workflow-edit-actions list__item-end">
                <button class="button button--filled button--14 button--round workflow-save-button" type="submit">
                  <span class="button__label">${escapeHtml(t("workflow.save"))}</span>
                </button>
                <button class="button button--outlined button--14 button--round button--destructive workflow-delete-button" type="button" data-workflow-delete="${index}" ${workflowSteps.length <= 1 ? "disabled" : ""}>
                  <span class="button__label">${escapeHtml(t("workflow.delete"))}</span>
                </button>
              </div>
            </form>
          </div>
        `;
      }

      return `
        <div class="list__item workflow-step is-${state}" role="listitem" data-workflow-index="${index}" aria-current="${state === "running" ? "step" : "false"}">
          ${workflowIndicator(state)}
          <div class="title-body workflow-step__text" data-title-size="14">
            <strong class="title-body__title">${escapeHtml(t("workflow.stepLabel", { step: stepNumber }))}</strong>
            <span class="title-body__body">${escapeHtml(step)}</span>
            <span class="visually-hidden">${escapeHtml(stateLabel)}</span>
          </div>
          <button class="button button--plain button--14 button--circle button--icon-only workflow-icon-button list__item-end" type="button" data-workflow-edit="${index}" aria-label="${escapeHtml(t("workflow.edit", { step: stepNumber }))}" ${locked ? "disabled" : ""}>
            <span class="button__icon" aria-hidden="true"><span class="icon icon--symbol icon--style-outlined">edit</span></span>
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
  if (!agent.enabled) {
    return { className: "is-disabled", tone: "unavailable", label: t("agents.status.disabled") };
  }
  if (agent.connected) {
    return { className: "is-ready", tone: "available", label: t("agents.status.ready") };
  }
  return { className: "is-missing", tone: "alarm", label: t("agents.status.missing") };
}

function emptyState(title, icon = "inbox") {
  return `
    <section class="empty">
      <div class="empty__header">
        <div class="empty__media" data-variant="icon" aria-hidden="true"><span class="icon">${icon}</span></div>
        <div class="empty__title">${escapeHtml(title)}</div>
      </div>
    </section>
  `;
}

function apiAgentInlineFormHtml(agent, agentId) {
  const isEnabled = agent ? agent.enabled !== false : true;
  const checkedAttr = isEnabled ? 'data-checked aria-checked="true"' : 'aria-checked="false"';
  const checkedTrack = isEnabled ? 'data-checked' : '';
  const checkedThumb = isEnabled ? 'data-checked' : '';
  const checkedField = isEnabled ? 'data-checked' : '';

  const field = (labelKey, tooltipKey, inputHtml) => `
    <label class="input-field">
      <span class="input-label-row">
        <span class="input-label">${escapeHtml(t(labelKey))}</span>
        <span class="hover-card field-hint-card" data-side="right" data-motion="quick">
          <button class="hover-card__trigger button button--outlined button--16 button--round" type="button" aria-label="${escapeHtml(t(labelKey))}">
            <span class="button__label">!</span>
          </button>
          <span class="hover-card__positioner" data-side="right">
            <span class="hover-card__popup" data-surface>
              <span class="title-body" data-title-size="14">
                <strong class="title-body__title">${escapeHtml(t(labelKey))}</strong>
                <span class="title-body__body">${escapeHtml(t(tooltipKey))}</span>
              </span>
            </span>
          </span>
        </span>
      </span>
      ${inputHtml}
    </label>
  `;

  return `
    <form class="agent-inline-form" data-agent-id="${escapeHtml(agentId)}">
      <input name="id" type="hidden" value="${escapeHtml(agentId)}" />
      <input name="type" type="hidden" value="api" />
      ${field('agents.name', 'agents.nameTooltip', `<input class="input" data-density="12" name="name" type="text" placeholder="${escapeHtml(t('agents.namePlaceholder'))}" value="${escapeHtml(agent?.name || '')}" required />`)}
      ${field('agents.baseUrl', 'agents.baseUrlTooltip', `<input class="input" data-density="12" name="baseUrl" type="url" placeholder="${escapeHtml(t('agents.baseUrlPlaceholder'))}" value="${escapeHtml(agent?.baseUrl || '')}" required />`)}
      ${field('agents.model', 'agents.modelTooltip', `<input class="input" data-density="12" name="model" type="text" placeholder="${escapeHtml(t('agents.modelPlaceholder'))}" value="${escapeHtml(agent?.model || '')}" required />`)}
      ${field('agents.apiKeyEnv', 'agents.apiKeyEnvTooltip', `<input class="input" data-density="12" name="apiKeyEnv" type="text" placeholder="${escapeHtml(t('agents.apiKeyEnvPlaceholder'))}" value="${escapeHtml(agent?.apiKeyEnv || '')}" />`)}
      <label class="switch-field" ${checkedField}>
        <button class="switch agent-inline-switch" type="button" role="switch" ${checkedAttr} data-size="md">
          <span class="switch__track" aria-hidden="true" ${checkedTrack}>
            <span class="switch__thumb" ${checkedThumb}></span>
          </span>
        </button>
        <span class="switch-label">${escapeHtml(t('agents.enabled'))}</span>
      </label>
      <div class="agent-inline-actions">
        <button class="button button--filled button--14 button--round" type="submit">
          <span class="button__label">${escapeHtml(t('agents.save'))}</span>
        </button>
        <button class="button button--outlined button--14 button--round agent-inline-cancel" type="button" data-agent-id="${escapeHtml(agentId)}">
          <span class="button__label">${escapeHtml(t('common.cancel'))}</span>
        </button>
      </div>
    </form>
  `;
}

function agentInlineFormHtml(agent, agentId) {
  if (agent?.type === "api") return apiAgentInlineFormHtml(agent, agentId);

  const args = Array.isArray(agent?.args) ? agent.args : [];
  const inputMode = agent?.input || "stdin";
  const isEnabled = agent ? agent.enabled !== false : true;
  const checkedAttr = isEnabled ? 'data-checked aria-checked="true"' : 'aria-checked="false"';
  const checkedTrack = isEnabled ? 'data-checked' : '';
  const checkedThumb = isEnabled ? 'data-checked' : '';
  const checkedField = isEnabled ? 'data-checked' : '';

  const inputOptions = [
    { value: 'stdin', label: 'stdin' },
    { value: 'stdin-last-message-file', label: 'stdin + last message file' },
    { value: 'none', label: 'none' },
  ];
  const selectedLabel = inputOptions.find(o => o.value === inputMode)?.label || inputMode;
  const selectItemsHtml = inputOptions
    .map(opt => {
      const isSel = opt.value === inputMode;
      return `<button class="select__item" type="button" role="option" aria-selected="${isSel}" ${isSel ? 'data-selected' : ''} data-value="${escapeHtml(opt.value)}">
        <span class="select__item-text">${escapeHtml(opt.label)}</span>
        ${isSel ? '<span class="icon select__item-indicator" aria-hidden="true">check</span>' : ''}
      </button>`;
    })
    .join('');
  const selectTriggerId = `inline-input-trigger-${escapeHtml(agentId)}`;
  const selectListId = `inline-input-list-${escapeHtml(agentId)}`;

  return `
    <form class="agent-inline-form" data-agent-id="${escapeHtml(agentId)}">
      <input name="id" type="hidden" value="${escapeHtml(agentId)}" />
      <input name="type" type="hidden" value="cli" />
      <input name="input" type="hidden" value="${escapeHtml(inputMode)}" />
      <label class="input-field">
        <span class="input-label-row">
          <span class="input-label" data-i18n="agents.name">${escapeHtml(t('agents.name'))}</span>
          <span class="hover-card field-hint-card" data-side="right" data-motion="quick">
            <button class="hover-card__trigger button button--outlined button--16 button--round" type="button" aria-label="${escapeHtml(t('agents.name'))}">
              <span class="button__label">!</span>
            </button>
            <span class="hover-card__positioner" data-side="right">
              <span class="hover-card__popup" data-surface>
                <span class="title-body" data-title-size="14">
                  <strong class="title-body__title">${escapeHtml(t('agents.name'))}</strong>
                  <span class="title-body__body">${escapeHtml(t('agents.nameTooltip'))}</span>
                </span>
              </span>
            </span>
          </span>
        </span>
        <input class="input" data-density="12" name="name" type="text" placeholder="Codex" value="${escapeHtml(agent?.name || '')}" required />
      </label>
      <label class="input-field">
        <span class="input-label-row">
          <span class="input-label" data-i18n="agents.command">${escapeHtml(t('agents.command'))}</span>
          <span class="hover-card field-hint-card" data-side="right" data-motion="quick">
            <button class="hover-card__trigger button button--outlined button--16 button--round" type="button" aria-label="${escapeHtml(t('agents.command'))}">
              <span class="button__label">!</span>
            </button>
            <span class="hover-card__positioner" data-side="right">
              <span class="hover-card__popup" data-surface>
                <span class="title-body" data-title-size="14">
                  <strong class="title-body__title">${escapeHtml(t('agents.command'))}</strong>
                  <span class="title-body__body">${escapeHtml(t('agents.commandTooltip'))}</span>
                </span>
              </span>
            </span>
          </span>
        </span>
        <input class="input" data-density="12" name="command" type="text" placeholder="codex" value="${escapeHtml(agent?.command || '')}" required />
      </label>
      <label class="textarea-field agent-args-field">
        <span class="input-label-row">
          <span class="textarea-label" data-i18n="agents.args">${escapeHtml(t('agents.args'))}</span>
          <span class="hover-card field-hint-card" data-side="right" data-motion="quick">
            <button class="hover-card__trigger button button--outlined button--16 button--round" type="button" aria-label="${escapeHtml(t('agents.args'))}">
              <span class="button__label">!</span>
            </button>
            <span class="hover-card__positioner" data-side="right">
              <span class="hover-card__popup" data-surface>
                <span class="title-body" data-title-size="14">
                  <strong class="title-body__title">${escapeHtml(t('agents.args'))}</strong>
                  <span class="title-body__body">${escapeHtml(t('agents.argsTooltip'))}</span>
                </span>
              </span>
            </span>
          </span>
        </span>
        <textarea class="textarea" name="args" rows="4" spellcheck="false">${escapeHtml(JSON.stringify(args, null, 2))}</textarea>
      </label>
      <div class="select agent-inline-select">
        <div class="agent-inline-select-trigger-column">
          <span class="select__label" data-i18n="agents.inputMode">${escapeHtml(t('agents.inputMode'))}</span>
          <button
            id="${selectTriggerId}"
            class="select__trigger"
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-controls="${selectListId}"
          >
            <span class="select__value" id="${selectTriggerId}-value">${escapeHtml(selectedLabel)}</span>
            <span class="icon select__indicator" aria-hidden="true">chevron_right</span>
          </button>
        </div>
        <div class="select__positioner">
          <div class="select__popup" data-surface>
            <div class="select__listbox" id="${selectListId}" role="listbox">${selectItemsHtml}</div>
          </div>
        </div>
        <label class="switch-field" ${checkedField}>
          <button class="switch agent-inline-switch" type="button" role="switch" ${checkedAttr} data-size="md">
            <span class="switch__track" aria-hidden="true" ${checkedTrack}>
              <span class="switch__thumb" ${checkedThumb}></span>
            </span>
          </button>
          <span class="switch-label" data-i18n="agents.enabled">${escapeHtml(t('agents.enabled'))}</span>
        </label>
      </div>
      <div class="agent-inline-actions">
        <button class="button button--filled button--14 button--round" type="submit">
          <span class="button__label" data-i18n="agents.save">${escapeHtml(t('agents.save'))}</span>
        </button>
        <button class="button button--outlined button--14 button--round agent-inline-cancel" type="button" data-agent-id="${escapeHtml(agentId)}">
          <span class="button__label" data-i18n="common.cancel">${escapeHtml(t('common.cancel'))}</span>
        </button>
      </div>
    </form>
  `;
}

function renderAgents(nextAgents) {
  agents = nextAgents;
  agentList.innerHTML = agents.length
    ? agents
        .map((agent) => {
          const status = agentStatus(agent);
          const agentId = agent.id || agent.name || agent.command || "";
          const agentName = agent.name || agentId || "Agent";
          const isEditing = editingAgentId === agentId;

          if (isEditing) {
            return `
              <article class="card card--outlined agent-card agent-card--editing ${status.className}" data-density="12" data-surface>
                ${agentInlineFormHtml(agent, agentId)}
              </article>
            `;
          }

          return `
            <article class="card card--outlined agent-card ${status.className}" data-density="12" data-surface>
              <span class="agent-card__identity">
                <span class="agent-status">${statusBadge(status.tone)}</span>
                <strong class="agent-card__name">${escapeHtml(agentName)}</strong>
                ${agent.type === "api" ? '<span class="tag tag--12 tag--rectangle">API</span>' : ""}
              </span>
              <button class="button button--plain button--14 button--circle button--icon-only agent-edit" type="button" data-agent-id="${escapeHtml(agentId)}" aria-label="${escapeHtml(t('agents.edit'))}">
                <span class="button__icon" aria-hidden="true"><span class="icon icon--symbol icon--style-outlined">edit</span></span>
              </button>
            </article>
          `;
        })
        .join("")
    : emptyState(t("agents.empty"));
}

function renderRuns(nextRuns) {
  if (Array.isArray(nextRuns)) {
    runs = nextRuns;
  }

  const visibleRuns = filteredRuns();
  runList.innerHTML = visibleRuns.length
    ? `<div class="list" data-anatomy="label" data-size="14" data-density="12" data-icon="none" data-width="full" data-frame="outlined" data-divider="visible" data-emphasis="base" data-border-radius="0" aria-label="${escapeHtml(t("runs.title"))}">` +
      visibleRuns
        .map(
          (run) => `
            <a class="list__item run-link" href="/view/${encodeURIComponent(run.file)}" target="_blank" rel="noreferrer">
              <span class="list__item-label">${escapeHtml(run.file)}</span>
            </a>
          `,
        )
        .join("") +
      `</div>`
    : emptyState(t(runSearchInput.value ? "runs.noMatches" : "runs.empty"), "search");
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
  item.setAttribute("data-surface", "");
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

function syncAgentFormType() {
  const isApi = agentTypeSelect.value === "api";
  agentForm.querySelectorAll("[data-agent-field]").forEach((field) => {
    field.hidden = (field.dataset.agentField === "api") !== isApi;
  });
  // Required must follow visibility: a hidden required input blocks submit.
  agentCommandInput.required = !isApi;
  agentBaseUrlInput.required = isApi;
  agentModelInput.required = isApi;
  setAgentNote(isApi ? "agents.usageApi" : "agents.usage");
}

function openAgentForm(agent = null) {
  if (agent) {
    // Inline edit inside the agent card
    editingAgentId = agent.id || agent.name || agent.command || "";
    renderAgents(agents);
    // Focus the first input in the expanded card
    const card = agentList.querySelector(".agent-card--editing");
    card?.querySelector(".input, .textarea")?.focus();
  } else {
    // "Add" mode: open the standalone form below the list
    editingAgentId = "__new__";
    agentForm.hidden = false;
    agentIdInput.value = "";
    agentNameInput.value = "";
    agentCommandInput.value = "";
    agentArgsInput.value = JSON.stringify([], null, 2);
    agentInputMode.value = "stdin";
    agentTypeSelect.value = "cli";
    agentBaseUrlInput.value = "";
    agentModelInput.value = "";
    agentApiKeyEnvInput.value = "";
    setSwitchChecked(agentEnabledInput, true);
    syncAgentFormType();
    agentNameInput.focus();
  }
}

function closeAgentForm() {
  editingAgentId = null;
  agentForm.hidden = true;
  agentForm.reset();
  agentIdInput.value = "";
  setSwitchChecked(agentEnabledInput, true);
  syncAgentFormType();
  renderAgents(agents);
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
    const type = agentTypeSelect.value === "api" ? "api" : "cli";
    const id = agentIdInput.value || agentNameInput.value;
    const name = agentNameInput.value.trim();
    const enabled = isSwitchChecked(agentEnabledInput);
    let nextAgent;

    if (type === "api") {
      nextAgent = {
        id,
        name,
        type,
        baseUrl: agentBaseUrlInput.value.trim(),
        model: agentModelInput.value.trim(),
        apiKeyEnv: agentApiKeyEnvInput.value.trim(),
        enabled,
      };

      if (!nextAgent.name || !nextAgent.baseUrl || !nextAgent.model) {
        throw new Error(t("agents.requiredApi"));
      }
    } else {
      nextAgent = {
        id,
        name,
        type,
        command: agentCommandInput.value.trim(),
        args: parseAgentArgs(),
        input: agentInputMode.value,
        enabled,
      };

      if (!nextAgent.name || !nextAgent.command) {
        throw new Error(t("agents.required"));
      }
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

async function saveInlineAgent(form) {
  const data = new FormData(form);
  const typeVal = (data.get('type') || 'cli').toString() === 'api' ? 'api' : 'cli';
  const nameVal = (data.get('name') || '').toString().trim();
  const originalId = (data.get('id') || '').toString();

  // Read switch state from the rendered DOM
  const switchBtn = form.querySelector('.agent-inline-switch');
  const enabledVal = switchBtn ? switchBtn.getAttribute('aria-checked') !== 'false' : true;

  let nextAgent;
  if (typeVal === 'api') {
    const baseUrlVal = (data.get('baseUrl') || '').toString().trim();
    const modelVal = (data.get('model') || '').toString().trim();

    if (!nameVal || !baseUrlVal || !modelVal) {
      setAgentNoteText(t('agents.requiredApi'));
      return;
    }

    nextAgent = {
      id: originalId || nameVal,
      name: nameVal,
      type: 'api',
      baseUrl: baseUrlVal,
      model: modelVal,
      apiKeyEnv: (data.get('apiKeyEnv') || '').toString().trim(),
      enabled: enabledVal,
    };
  } else {
    const commandVal = (data.get('command') || '').toString().trim();
    const argsRaw = (data.get('args') || '[]').toString().trim();
    // input value is stored in a hidden input that is updated by the inline select
    const inputVal = (data.get('input') || 'stdin').toString();

    let args;
    try {
      const parsed = JSON.parse(argsRaw || '[]');
      if (!Array.isArray(parsed)) throw new Error();
      args = parsed.map(String);
    } catch {
      setAgentNoteText(t('agents.argsInvalid'));
      return;
    }

    if (!nameVal || !commandVal) {
      setAgentNoteText(t('agents.required'));
      return;
    }

    nextAgent = {
      id: originalId || nameVal,
      name: nameVal,
      type: 'cli',
      command: commandVal,
      args,
      input: inputVal,
      enabled: enabledVal,
    };
  }

  setAgentNote('agents.saving');

  try {
    const existingIndex = agents.findIndex((a) => (a.id || a.name || a.command || '') === originalId);
    const nextAgents = existingIndex >= 0 ? [...agents] : [...agents, nextAgent];
    if (existingIndex >= 0) nextAgents[existingIndex] = nextAgent;

    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agents: nextAgents }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || t('agents.couldNotSave'));
    }

    editingAgentId = null;
    renderAgents(result.agents);
    setAgentNote('agents.usage');
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

/* Settings dialog: design-system Dialog (data-open presence on viewport,
 * backdrop, and popup together; focus moves into the popup and back). */

let settingsReturnFocus = null;

function settingsDialogLayers() {
  return [settingsDialog, settingsBackdrop, settingsPopup];
}

function isSettingsDialogOpen() {
  return settingsDialog.hasAttribute("data-open");
}

function openSettingsDialog() {
  syncSettingsControls();
  settingsReturnFocus = document.activeElement;
  for (const layer of settingsDialogLayers()) layer.setAttribute("data-open", "");
  openSettings.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  settingsPopup.focus();
}

function closeSettingsDialog() {
  setThemeSelectOpen(false);
  setLanguageOpen(false);
  for (const layer of settingsDialogLayers()) layer.removeAttribute("data-open");
  openSettings.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  if (settingsReturnFocus && typeof settingsReturnFocus.focus === "function") {
    settingsReturnFocus.focus();
  }
  settingsReturnFocus = null;
}

function trapSettingsFocus(event) {
  if (event.key !== "Tab") return;
  const tabbables = Array.from(
    settingsPopup.querySelectorAll("button:not([tabindex='-1']), input, [href], [tabindex='0']"),
  ).filter((element) => !element.disabled && element.offsetParent !== null);
  if (!tabbables.length) return;
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function updateThemeSetting(value) {
  if (!THEME_VALUES.has(value)) return false;
  appSettings.theme = value;
  saveSettings();
  applyTheme();
  syncSettingsControls();
  return true;
}

/* Agent "Enabled" toggle: design-system Switch (button[role=switch] whose
 * data-checked/data-unchecked presence is mirrored on all four layers). */

function isSwitchChecked(switchButton) {
  return switchButton.getAttribute("aria-checked") === "true";
}

function setSwitchChecked(switchButton, checked) {
  const layers = [
    switchButton.closest(".switch-field"),
    switchButton,
    switchButton.querySelector(".switch__track"),
    switchButton.querySelector(".switch__thumb"),
  ];
  switchButton.setAttribute("aria-checked", String(checked));
  for (const layer of layers) {
    if (!layer) continue;
    layer.toggleAttribute("data-checked", checked);
    layer.toggleAttribute("data-unchecked", !checked);
  }
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
  const deleteButton = event.target.closest("[data-workflow-delete]");
  if (deleteButton) {
    deleteWorkflowStep(Number.parseInt(deleteButton.dataset.workflowDelete, 10));
    return;
  }
  const editButton = event.target.closest("[data-workflow-edit]");
  if (!editButton) return;
  editWorkflowStep(Number.parseInt(editButton.dataset.workflowEdit, 10));
}

function addWorkflowStep() {
  if (isDebateLocked()) return;
  const newStep = t("workflow.newStep");
  workflowSteps.push(newStep);
  saveWorkflowSteps();
  editingWorkflowIndex = workflowSteps.length - 1;
  workflowStatus.textContent = t("workflow.saved");
  renderWorkflow();
  window.requestAnimationFrame(() => {
    const input = workflowList.querySelector(`#workflowStep${workflowSteps.length}`);
    input?.focus();
    input?.select();
  });
}

function deleteWorkflowStep(index) {
  if (isDebateLocked() || workflowSteps.length <= 1) return;
  workflowSteps = workflowSteps.filter((_, stepIndex) => stepIndex !== index);
  saveWorkflowSteps();
  editingWorkflowIndex = -1;
  workflowStatus.textContent = t("workflow.deleted");
  renderWorkflow();
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
  scheduleSkillSearch();
});
skillSearchInput.addEventListener("click", () => {
  if (!skillCombobox.hasAttribute("data-open")) {
    scheduleSkillSearch();
  }
});
skillSearchInput.addEventListener("blur", () => {
  window.setTimeout(() => setSkillResultsOpen(false), 140);
});
skillResultsEl.addEventListener("pointerdown", handleSkillOptionSelect);
skillResultsEl.addEventListener("click", handleSkillOptionSelect);
skillTrigger.addEventListener("click", () => {
  if (skillCombobox.hasAttribute("data-open")) {
    setSkillResultsOpen(false);
    return;
  }
  skillSearchInput.focus();
  searchSkillsNow();
});
selectedSkillsEl.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".chip__remove");
  if (!removeButton) return;
  const chip = removeButton.closest("[data-skill-id]");
  if (chip) removeSelectedSkill(chip.dataset.skillId);
});

agentList.addEventListener("click", (event) => {
  // Edit button on collapsed card
  const editBtn = event.target.closest(".agent-edit");
  if (editBtn) {
    const agent = agents.find(
      (item) => (item.id || item.name || item.command || "") === editBtn.dataset.agentId,
    );
    if (agent) openAgentForm(agent);
    return;
  }

  // Cancel button inside inline form
  const cancelBtn = event.target.closest(".agent-inline-cancel");
  if (cancelBtn) {
    editingAgentId = null;
    renderAgents(agents);
    setAgentNote("agents.usage");
    return;
  }

  // Inline switch toggle
  const switchBtn = event.target.closest(".agent-inline-switch");
  if (switchBtn) {
    const isChecked = switchBtn.getAttribute("aria-checked") !== "false";
    const next = !isChecked;
    switchBtn.setAttribute("aria-checked", String(next));
    switchBtn.toggleAttribute("data-checked", next);
    const track = switchBtn.querySelector(".switch__track");
    const thumb = switchBtn.querySelector(".switch__thumb");
    track?.toggleAttribute("data-checked", next);
    thumb?.toggleAttribute("data-checked", next);
    const field = switchBtn.closest(".switch-field");
    field?.toggleAttribute("data-checked", next);
    return;
  }

  // Inline DS select: trigger button opens/closes popup
  const selectTrigger = event.target.closest(".agent-inline-select .select__trigger");
  if (selectTrigger) {
    const selectEl = selectTrigger.closest(".agent-inline-select");
    const positioner = selectEl.querySelector(".select__positioner");
    const isOpen = positioner.hasAttribute("data-open");
    // Close all other open inline selects first
    agentList.querySelectorAll(".agent-inline-select .select__positioner[data-open]").forEach(p => {
      p.removeAttribute("data-open");
      p.closest(".agent-inline-select")?.querySelector(".select__trigger")?.removeAttribute("data-popup-open");
      p.closest(".agent-inline-select")?.querySelector(".select__trigger")?.setAttribute("aria-expanded", "false");
    });
    if (!isOpen) {
      positioner.setAttribute("data-open", "");
      selectTrigger.setAttribute("data-popup-open", "");
      selectTrigger.setAttribute("aria-expanded", "true");
    }
    return;
  }

  // Inline DS select: item selection
  const selectItem = event.target.closest(".agent-inline-select .select__item");
  if (selectItem) {
    const selectEl = selectItem.closest(".agent-inline-select");
    const form = selectItem.closest(".agent-inline-form");
    if (!selectEl || !form) return;
    const value = selectItem.dataset.value || "stdin";
    const label = selectItem.querySelector(".select__item-text")?.textContent || value;
    // Update hidden input
    const hiddenInput = form.querySelector('input[name="input"]');
    if (hiddenInput) hiddenInput.value = value;
    // Update trigger label
    const valueSpan = selectEl.querySelector(".select__value");
    if (valueSpan) valueSpan.textContent = label;
    // Update item selected states
    selectEl.querySelectorAll(".select__item").forEach(item => {
      const isSel = item === selectItem;
      item.setAttribute("aria-selected", String(isSel));
      item.toggleAttribute("data-selected", isSel);
      const existingCheck = item.querySelector(".select__item-indicator");
      if (isSel && !existingCheck) {
        const check = document.createElement("span");
        check.className = "icon select__item-indicator";
        check.setAttribute("aria-hidden", "true");
        check.textContent = "check";
        item.appendChild(check);
      } else if (!isSel && existingCheck) {
        existingCheck.remove();
      }
    });
    // Close popup
    const positioner = selectEl.querySelector(".select__positioner");
    positioner?.removeAttribute("data-open");
    const trigger = selectEl.querySelector(".select__trigger");
    trigger?.removeAttribute("data-popup-open");
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.focus();
    return;
  }

  // Close any open inline select when clicking outside
  agentList.querySelectorAll(".agent-inline-select .select__positioner[data-open]").forEach(p => {
    if (!p.closest(".agent-inline-select").contains(event.target)) {
      p.removeAttribute("data-open");
      p.closest(".agent-inline-select")?.querySelector(".select__trigger")?.removeAttribute("data-popup-open");
      p.closest(".agent-inline-select")?.querySelector(".select__trigger")?.setAttribute("aria-expanded", "false");
    }
  });
});

agentList.addEventListener("submit", (event) => {
  const form = event.target.closest(".agent-inline-form");
  if (!form) return;
  event.preventDefault();
  saveInlineAgent(form);
});

refreshStatus.addEventListener("click", loadStatus);
useProjectButton.addEventListener("click", validateProjectPath);
openSettings.addEventListener("click", openSettingsDialog);
settingsBackdrop.addEventListener("click", closeSettingsDialog);
settingsClose.addEventListener("click", closeSettingsDialog);
settingsDone.addEventListener("click", closeSettingsDialog);
settingsPopup.addEventListener("keydown", trapSettingsFocus);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !isSettingsDialogOpen()) return;
  if (themeSelect.hasAttribute("data-open")) {
    setThemeSelectOpen(false);
    settingsThemeTrigger.focus();
    return;
  }
  if (languageCombobox.hasAttribute("data-open")) {
    setLanguageOpen(false);
    settingsLanguageInput.focus();
    return;
  }
  closeSettingsDialog();
});
document.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (themeSelect.hasAttribute("data-open") && !themeSelect.contains(target)) {
    setThemeSelectOpen(false);
  }
  if (languageCombobox.hasAttribute("data-open") && !languageCombobox.contains(target)) {
    setLanguageOpen(false);
  }
});

settingsThemeTrigger.addEventListener("click", () => {
  setThemeSelectOpen(!themeSelect.hasAttribute("data-open"));
});
themeSelect.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  if (!themeSelect.hasAttribute("data-open")) setThemeSelectOpen(true);
  focusThemeOption(event.key === "ArrowDown" ? 1 : -1);
});
settingsThemeList.addEventListener("click", (event) => {
  const item = event.target.closest(".select__item");
  if (!item) return;
  updateThemeSetting(item.dataset.value);
  setThemeSelectOpen(false);
  settingsThemeTrigger.focus();
});

settingsLanguageInput.addEventListener("input", () => {
  renderLanguageOptions(settingsLanguageInput.value);
  setComboboxOpen(languageCombobox, settingsLanguageInput, settingsLanguageTrigger, true);
});
settingsLanguageInput.addEventListener("keydown", (event) => {
  const isOpen = languageCombobox.hasAttribute("data-open");
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!isOpen) {
      renderLanguageOptions("");
      setComboboxOpen(languageCombobox, settingsLanguageInput, settingsLanguageTrigger, true);
    }
    moveLanguageHighlight(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Enter") {
    if (!isOpen) return;
    event.preventDefault();
    const option =
      settingsLanguageList.querySelector(".combobox__option[data-highlighted]") ||
      settingsLanguageList.querySelector(".combobox__option");
    if (option) {
      selectLanguage(option.dataset.value);
      setLanguageOpen(false);
    }
    return;
  }
  if (event.key === "Escape" && isOpen) {
    event.stopPropagation();
    setLanguageOpen(false);
  }
});
settingsLanguageInput.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (!languageCombobox.contains(document.activeElement)) setLanguageOpen(false);
  }, 140);
});
settingsLanguageTrigger.addEventListener("click", () => {
  const willOpen = !languageCombobox.hasAttribute("data-open");
  if (willOpen) {
    renderLanguageOptions("");
    settingsLanguageInput.focus();
  }
  setLanguageOpen(willOpen);
});
settingsLanguageList.addEventListener("pointerdown", handleLanguageOptionSelect);
settingsLanguageList.addEventListener("click", handleLanguageOptionSelect);

agentEnabledInput.addEventListener("click", () => {
  setSwitchChecked(agentEnabledInput, !isSwitchChecked(agentEnabledInput));
});

addAgentButton.addEventListener("click", () => openAgentForm());

agentTypeSelect.addEventListener("change", syncAgentFormType);

agentForm.addEventListener("click", (event) => {
  const presetButton = event.target.closest("[data-agent-preset]");
  if (!presetButton) return;
  const preset = API_AGENT_PRESETS[presetButton.dataset.agentPreset];
  if (!preset) return;
  if (!agentNameInput.value.trim()) agentNameInput.value = preset.name;
  agentBaseUrlInput.value = preset.baseUrl;
  agentApiKeyEnvInput.value = preset.apiKeyEnv;
  agentModelInput.focus();
});
cancelAgentButton.addEventListener("click", closeAgentForm);
agentForm.addEventListener("submit", saveAgent);
debateForm.addEventListener("submit", startDebate);
runAppButton.addEventListener("click", toggleAppRun);
runSearchForm.addEventListener("submit", (event) => event.preventDefault());
runSearchInput.addEventListener("input", () => renderRuns());
workflowList.addEventListener("click", handleWorkflowClick);
workflowList.addEventListener("input", handleWorkflowInput);
workflowList.addEventListener("submit", saveWorkflowStep);
if (addWorkflowStepButton) {
  addWorkflowStepButton.addEventListener("click", addWorkflowStep);
}

applySettings();
renderWorkflow();
loadStatus();
loadRuns();
loadAppStatus().then((status) => {
  if (status.state === "running" || status.state === "starting" || status.state === "stopping") {
    watchAppStatus();
  }
});

/* ------------------------------------------------------------------ Field-hint Hover Cards
 * Mirrors the n-hover-card Stencil component behaviour for the static
 * .hover-card.field-hint-card markup in the agent form.
 *
 * States managed:
 *   .hover-card             [data-open]
 *   .hover-card__trigger    [data-popup-open]
 *   .hover-card__positioner [data-open] [data-starting-style] [data-ending-style]
 *   .hover-card__popup      [data-open]
 */

const HINT_OPEN_DELAY = 200;
const HINT_CLOSE_DELAY = 150;

// Pending close cleanups per card, cancelled when the card reopens so a quick
// re-hover does not get its popup yanked away by the stale close timer.
const hintCloseCleanups = new WeakMap();

// The rails scroll (overflow:auto), which clips position:absolute descendants.
// When the Popover API is available the positioner is hoisted to the top layer
// and positioned fixed against its trigger; without it the card keeps the
// absolute in-rail placement (clipped at the rail edge, but functional).
const supportsHintPopover = typeof HTMLElement.prototype.showPopover === "function";
const openHintCards = new Set();

function positionFieldHintCard(card) {
  const trigger = card.querySelector(".hover-card__trigger");
  const positioner = card.querySelector(".hover-card__positioner");
  if (!trigger || !positioner || !positioner.matches(":popover-open")) return;

  const gutter = 8;
  const rect = trigger.getBoundingClientRect();
  const width = positioner.offsetWidth;
  const height = positioner.offsetHeight;
  const side = positioner.getAttribute("data-side") || "bottom";
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  let left;
  let top;

  if (side === "right" || side === "left") {
    left = clamp(side === "right" ? rect.right : rect.left - width, gutter, window.innerWidth - width - gutter);
    // The recipe's translate centres the card vertically on `top`.
    top = clamp(rect.top + rect.height / 2, gutter + height / 2, window.innerHeight - height / 2 - gutter);
  } else {
    // The recipe's translate centres the card horizontally on `left`.
    left = clamp(rect.left + rect.width / 2, gutter + width / 2, window.innerWidth - width / 2 - gutter);
    top = clamp(side === "top" ? rect.top - height : rect.bottom, gutter, window.innerHeight - height - gutter);
  }

  positioner.style.left = `${Math.round(left)}px`;
  positioner.style.top = `${Math.round(top)}px`;
}

function repositionOpenHintCards() {
  openHintCards.forEach((card) => {
    if (!card.isConnected) {
      openHintCards.delete(card);
      return;
    }
    positionFieldHintCard(card);
  });
}

// Fixed positioning detaches the card from rail scrolling; track the trigger.
window.addEventListener("scroll", repositionOpenHintCards, { capture: true, passive: true });
window.addEventListener("resize", repositionOpenHintCards);

function fieldHintOpen(card) {
  const trigger = card.querySelector(".hover-card__trigger");
  const positioner = card.querySelector(".hover-card__positioner");
  const popup = card.querySelector(".hover-card__popup");
  if (!positioner || !popup) return;

  hintCloseCleanups.get(card)?.();
  hintCloseCleanups.delete(card);

  card.toggleAttribute("data-open", true);
  trigger?.toggleAttribute("data-popup-open", true);

  // Start-style frame for entrance animation. Set before showPopover() so the
  // first painted frame is already at the transition's start opacity.
  positioner.setAttribute("data-starting-style", "");
  positioner.removeAttribute("data-ending-style");

  if (supportsHintPopover) {
    if (!positioner.hasAttribute("popover")) positioner.setAttribute("popover", "manual");
    if (!positioner.matches(":popover-open")) positioner.showPopover();
    positionFieldHintCard(card);
    openHintCards.add(card);
  }

  positioner.toggleAttribute("data-open", true);
  popup.toggleAttribute("data-open", true);

  // Remove starting-style after one rAF so transition fires.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => positioner.removeAttribute("data-starting-style"));
  });
}

function fieldHintClose(card) {
  const trigger = card.querySelector(".hover-card__trigger");
  const positioner = card.querySelector(".hover-card__positioner");
  const popup = card.querySelector(".hover-card__popup");
  if (!positioner || !popup) return;

  card.removeAttribute("data-open");
  trigger?.removeAttribute("data-popup-open");
  positioner.setAttribute("data-ending-style", "");

  const finish = () => {
    hintCloseCleanups.delete(card);
    openHintCards.delete(card);
    clearTimeout(fallbackTimer);
    popup.removeEventListener("transitionend", onEnd);
    positioner.removeAttribute("data-open");
    positioner.removeAttribute("data-ending-style");
    popup.removeAttribute("data-open");
    if (supportsHintPopover && positioner.matches(":popover-open")) positioner.hidePopover();
  };
  const onEnd = (event) => {
    if (event.target !== popup) return;
    if (event.propertyName !== "opacity" && event.propertyName !== "transform") return;
    finish();
  };
  // The popup owns the exit transition, so transitionend fires there.
  popup.addEventListener("transitionend", onEnd);

  // Fallback: if the transition never fires (reduced-motion etc.) clean up after 400ms.
  const fallbackTimer = setTimeout(finish, 400);

  hintCloseCleanups.set(card, () => {
    clearTimeout(fallbackTimer);
    popup.removeEventListener("transitionend", onEnd);
  });
}

function setupFieldHintCards(root) {
  const timers = new WeakMap();

  function scheduleOpen(card) {
    clearTimeout(timers.get(card));
    timers.set(card, setTimeout(() => fieldHintOpen(card), HINT_OPEN_DELAY));
  }

  function scheduleClose(card) {
    clearTimeout(timers.get(card));
    timers.set(card, setTimeout(() => fieldHintClose(card), HINT_CLOSE_DELAY));
  }

  root.addEventListener("mouseenter", (event) => {
    const card = event.target.closest(".field-hint-card");
    if (!card || !root.contains(card)) return;
    scheduleOpen(card);
  }, true);

  root.addEventListener("mouseleave", (event) => {
    const card = event.target.closest(".field-hint-card");
    if (!card || !root.contains(card)) return;
    // Keep open if moving into the positioner/popup.
    if (card.contains(event.relatedTarget)) return;
    scheduleClose(card);
  }, true);

  root.addEventListener("focusin", (event) => {
    const card = event.target.closest(".field-hint-card");
    if (!card || !root.contains(card)) return;
    scheduleOpen(card);
  });

  root.addEventListener("focusout", (event) => {
    const card = event.target.closest(".field-hint-card");
    if (!card || !root.contains(card)) return;
    if (card.contains(event.relatedTarget)) return;
    scheduleClose(card);
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const card = event.target.closest(".field-hint-card");
    if (!card || !root.contains(card)) return;
    clearTimeout(timers.get(card));
    fieldHintClose(card);
  });
}

// Cover both the static #agentForm and dynamically-rendered inline cards in #agentList.
[agentForm, agentList].filter(Boolean).forEach(setupFieldHintCards);


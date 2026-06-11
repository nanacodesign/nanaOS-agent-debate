# Connecting Custom Agents to Agent Debate

Agent Debate supports two connection types. Pick the first one that fits:

1. **API endpoint (recommended)** — the app calls any OpenAI-compatible chat completions endpoint directly. No code, no wrapper script, no extra install. This covers Ollama, LM Studio, OpenAI, OpenRouter, Groq, vLLM, and most other providers.
2. **CLI wrapper (escape hatch)** — a small script you write for services that do not expose an OpenAI-compatible endpoint.

> **Already using Claude, ChatGPT, or Gemini?** You don't need an API key at all: the official `claude`, `codex`, and `gemini` CLIs run on the plan you already have — a paid subscription or, for Gemini CLI, the free personal tier. Connect them with the **CLI command** type (see the README) and save the API route for local or unsupported models.

---

## Option 1: API Endpoint (Built In)

Open **Agent Connections** in the app, click **Add**, and set **Connection type** to **API endpoint**. Pick a preset (Ollama, OpenAI, OpenRouter) or fill the fields manually:

| Field | Meaning |
| --- | --- |
| `Name` | Label shown in the debate UI. |
| `Base URL` | OpenAI-compatible base URL, usually ending in `/v1`. Agent Debate appends `/chat/completions`. |
| `Model` | Model name the endpoint serves, for example a model you pulled in Ollama (`ollama list`) or a provider model ID. |
| `API key env var` | Name of the environment variable that holds the API key. Leave empty for local endpoints. |
| `Enabled` | Whether this agent participates in debates. |

Common base URLs:

| Service | Base URL | API key env var |
| --- | --- | --- |
| Ollama (local) | `http://127.0.0.1:11434/v1` | none |
| LM Studio (local) | `http://127.0.0.1:1234/v1` | none |
| OpenAI | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| OpenRouter | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |

Any other service works as long as it accepts `POST {baseUrl}/chat/completions` with the standard OpenAI request shape. The model field is always free text, so you are never limited to a hardcoded model list.

### API keys

Agent Debate never stores API keys. The config file keeps only the **name** of an environment variable; the key itself is read from the server process environment when a debate runs. Export it in the same shell before starting the app:

```bash
export OPENAI_API_KEY="sk-..."
npm run dev
```

If the named variable is not set, the agent shows as **Missing** in Agent Connections — fix it by exporting the variable and restarting the app.

### Example config

API agents can also be added directly to `agent-debate.config.json`:

```json
{
  "agents": [
    {
      "id": "ollama",
      "name": "Ollama",
      "type": "api",
      "baseUrl": "http://127.0.0.1:11434/v1",
      "model": "llama3.3",
      "apiKeyEnv": "",
      "enabled": true
    }
  ]
}
```

### Privacy note

A debate sends the topic, imported context, and the running transcript to the configured endpoint. With local endpoints such as Ollama everything stays on your machine; with cloud providers the prompt leaves your machine under that provider's terms.

---

## Option 2: CLI Wrapper (Escape Hatch)

Use a wrapper script only when the service has no OpenAI-compatible endpoint. The wrapper is an ordinary executable that follows the same contract as any CLI agent.

### The contract

Agent Debate runs each CLI agent as a child process:

1. **Input**: the generated debate prompt is written to the command's standard input (`stdin`).
2. **Output**: the response must be printed to standard output (`stdout`). If the script prints in chunks, the UI streams them in real time.
3. **Exit status**: exit with code `0` on success. On failure, print the error to `stderr` and exit non-zero.
4. **Working directory**: the command runs with its working directory set to the **debate project path**, not the Agent Debate folder. Always reference wrapper scripts by **absolute path** (a literal `~` is not expanded).
5. **File extension**: save Node.js wrappers with the **`.mjs`** extension so `import` syntax works regardless of the nearest `package.json`.
6. **Environment**: the child process inherits the server's environment, so export API keys before `npm run dev`, exactly as for API agents.

Argument placeholders for the `Arguments JSON` field:

- `{prompt}` is replaced with the generated debate prompt.
- `{outputFile}` is replaced with a temporary file path the agent may write its final message to.

Supported input modes: `stdin` (default), `stdin-last-message-file` (stdin plus the output file path appended), and `none` (prompt passed only through argument placeholders).

### Minimal wrapper template (zero-dependency, Node 20+)

```javascript
#!/usr/bin/env node
// Agent Debate wrapper: reads the prompt from stdin, calls an API, and
// streams the reply to stdout. Save as my-agent.mjs and reference it by
// absolute path in the agent's Arguments JSON.

let prompt = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) prompt += chunk;

try {
  // Replace this block with your API call. Write chunks to process.stdout
  // as they arrive to stream into the debate UI.
  const response = await fetch("https://api.example.com/v1/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.EXAMPLE_API_KEY || ""}`,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`API returned status ${response.status}`);
  }

  process.stdout.write(await response.text());
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}
```

Avoid calling `process.exit(0)` after writing output: when stdout is a pipe, exiting early can drop buffered text. Let the script end naturally and use `process.exitCode = 1` on errors.

### UI configuration

- **Connection type**: `CLI command`
- **Command**: `node`
- **Arguments JSON**: `["/absolute/path/to/my-agent.mjs"]`
- **Input mode**: `stdin`

---

## Generate a Wrapper with an LLM (Copy-Paste Prompt)

To have ChatGPT, Claude, or Gemini write a wrapper for an API not covered above, paste this prompt and fill in the bracketed parts:

```text
I am using a local tool called "Agent Debate" that runs AI agents as child
processes for comparative debates. Write a zero-dependency Node.js wrapper
script for the [API name] API that follows this exact contract:

1. Read the debate prompt from standard input (stdin) until EOF.
2. Call the [API name] API with that prompt, reading the API key from the
   [ENV_VAR_NAME] environment variable.
3. Stream the response chunks to standard output (stdout) as they arrive.
4. On failure, print the error to stderr and set process.exitCode = 1.
   Do not call process.exit(0) on success - let the script end naturally
   so buffered stdout is flushed.

Constraints:
- Node.js 20+, ES modules, native fetch only, no npm dependencies.
- The file will be saved with an .mjs extension.
- The script runs with an arbitrary working directory, so it must not rely
  on relative paths.

Also tell me how to register it in Agent Debate's Agent Connections UI:
- Connection type: CLI command
- Command: node
- Arguments JSON: ["/absolute/path/to/<filename>.mjs"]
- Input mode: stdin
- Reminder that the API key must be exported in the same shell before
  starting Agent Debate with npm run dev.
```

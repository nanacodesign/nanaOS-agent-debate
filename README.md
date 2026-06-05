# Agent Debate

Agent Debate is a local-first debate room for comparing answers from multiple AI coding agents. It runs installed CLI agents such as Gemini, Claude, and Codex from the same project folder, streams the debate into a browser UI, and saves each transcript as Markdown.

The app is designed for maintainers who want a fast second opinion before changing code, APIs, design-system contracts, or project direction.

![Agent Debate mark](public/assets/debate.png)

## Highlights

- Run a structured 3-round debate across enabled agents.
- Connect your own CLI agents from the UI or `agent-debate.config.json`.
- Keep provider authentication inside each official CLI.
- Save local Markdown transcripts under `runs/`.
- Use a nanaOS-inspired app shell built with plain HTML, CSS, and Node.js.

## Requirements

- Node.js 20 or newer.
- At least one authenticated agent CLI available on your `PATH`.
- macOS, Linux, or another environment that can run Node child processes.

Agent Debate does not call vendor SDKs directly and does not ask for API keys in the app. Install and authenticate each CLI with its own official setup flow.

## Quick Start

```bash
git clone https://github.com/nanacodesign/agent-debate.git
cd agent-debate
cp agent-debate.config.example.json agent-debate.config.json
npm run dev
```

Then open:

```text
http://127.0.0.1:4177
```

You can also run without a copied config file. In that case, the app starts with default Gemini, Claude, and Codex CLI definitions.

## Connect Agents

Open **Agent Connections** in the app and add or edit each agent:

- `Name`: label shown in the debate UI.
- `Command`: executable name, for example `codex`, `claude`, or `gemini`.
- `Arguments JSON`: JSON array of CLI arguments.
- `Input mode`: how the debate prompt is passed to the command.
- `Enabled`: whether this agent should participate.

Supported input modes:

- `stdin`: send the prompt to standard input.
- `stdin-last-message-file`: send the prompt to standard input and append the last agent output file path.
- `none`: do not send stdin. Use `{prompt}` or `{outputFile}` placeholders in arguments instead.

Argument placeholders:

- `{prompt}` is replaced with the generated debate prompt.
- `{outputFile}` is replaced with the temporary file path where the agent output should be written.

Example:

```json
{
  "agents": [
    {
      "id": "codex",
      "name": "Codex",
      "command": "codex",
      "args": ["exec", "--skip-git-repo-check", "--ephemeral", "--color", "never", "-"],
      "input": "stdin",
      "enabled": true
    }
  ]
}
```

## Environment

Optional environment variables:

```bash
AGENT_DEBATE_HOST=127.0.0.1
AGENT_DEBATE_PORT=4177
AGENT_DEBATE_DEFAULT_PROJECT_PATH=/path/to/project
AGENT_DEBATE_EXTRA_PATHS=/custom/bin:/another/bin
```

## Local Files

- `agent-debate.config.json` stores your local agent setup and is ignored by Git.
- `runs/*.md` stores local debate transcripts and is ignored by Git.
- `public/assets/debate.png` is the app mark.

## Safety Notes

Agent Debate executes local commands that you configure. Only connect CLIs you trust, and review the project path before starting a debate. The app binds to `127.0.0.1` by default so it is not exposed on your network unless you opt into another host.

## OpenAI Codex for OSS

This project is being prepared as an open-source local tool for maintainers and contributors. If you are applying for OpenAI's Codex for OSS support, the public repository URL, maintainer role, OpenAI organization ID, and intended API-credit usage plan are the core details requested in the application form.

## License

MIT

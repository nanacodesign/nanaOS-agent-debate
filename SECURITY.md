# Security

## Supported Versions

Security fixes target the current `main` branch.

## Reporting a Vulnerability

Please open a GitHub security advisory or email the maintainer privately if a repository contact is listed. Do not include private API keys, shell tokens, or sensitive transcripts in public issues.

## Local Command Execution

Agent Debate is a local app that executes CLI commands configured by the user. Treat agent definitions like shell commands:

- Only run CLIs you trust.
- Review `agent-debate.config.json` before using a shared config.
- Keep the default host as `127.0.0.1` unless you intentionally want network access.
- Do not paste secrets into debate topics or context unless you are comfortable sending them to every enabled agent CLI.

The app does not store API keys and does not call provider SDKs directly.

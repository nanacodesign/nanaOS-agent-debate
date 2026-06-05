# Contributing

Thanks for helping improve Agent Debate.

## Development

```bash
npm run dev
```

The app runs at `http://127.0.0.1:4177` by default.

Before sending a change, run:

```bash
npm run check
node --check public/app.js
```

## Pull Requests

- Keep changes scoped and easy to review.
- Avoid committing local transcripts from `runs/`.
- Avoid committing machine-specific `agent-debate.config.json`.
- Include screenshots or short notes for UI changes.
- Document new agent input modes, environment variables, or workflow changes in `README.md`.

## Design Direction

The UI should stay practical and dense enough for repeated maintainer use. Prefer clear workflow surfaces, compact controls, accessible forms, and readable transcripts over marketing-style pages.

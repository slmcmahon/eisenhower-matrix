# Eisenhower Matrix App

A cross-platform desktop app (Windows, macOS, and Linux) for prioritizing your tasks with the
**[Eisenhower Matrix](https://en.wikipedia.org/wiki/Time_management#Eisenhower_method)**.

You add tasks through chat, answer a short question flow, and the app files each task into the
right quadrant and rank.

The same chat input can also detect common task commands such as rename, delete, complete, and
reprioritize.

## What it does

Every task is sorted into one of four quadrants based on whether it's **important** and/or **urgent**:

| Quadrant           | Important? | Urgent? | What to do                        |
| ------------------ | ---------- | ------- | --------------------------------- |
| **Q1 — Do First**  | Yes        | Yes     | Act on these immediately          |
| **Q2 — Schedule**  | Yes        | No      | Designate time to work on these   |
| **Q3 — Delegate**  | No         | Yes     | Find someone else to do these     |
| **Q4 — Eliminate** | No         | No      | Delete or reduce these completely |

Tasks are saved locally in SQLite, so your matrix persists between sessions.

## Prerequisites

- [Node.js](https://nodejs.org/) 22 or later (includes `npm`).
- Azure AI Foundry model deployment details (endpoint, deployment, API version, API key).

## Azure AI Foundry settings

On startup, the app tests the saved Azure AI Foundry settings.

If settings are missing or the connection test fails, the app prompts you to enter:

- endpoint (`https://<resource>.openai.azure.com`)
- deployment name
- API version (default: `2024-06-01`)
- API key (leave blank to keep existing)

Settings are saved to this file:

- macOS: `~/Library/Application Support/eisenhower-matrix/settings.json`
- Windows: `%APPDATA%\eisenhower-matrix\settings.json`
- Linux: `~/.config/eisenhower-matrix/settings.json`

If you cancel or the connection still fails, the app falls back to deterministic comparative questions.

## Run

The same commands work on Windows, macOS, and Linux:

```bash
npm install
npm run setup:foundry
npm start
```

You can also launch directly from GitHub with `npx`:

```bash
npx github:slmcmahon/eisenhower-matrix
```

`npm start` and the `npx` launcher both run a startup bootstrap that ensures the settings file exists.

To install a reusable command locally:

```bash
npm install -g github:slmcmahon/eisenhower-matrix
eisenhower-matrix
```

To install from a non-default branch explicitly, append `#branch-name`:

```bash
npx github:slmcmahon/eisenhower-matrix#my-branch
```

## Usage

1. Type a task in the chat box and press **Enter**.
1. If the text looks like a task command with high confidence, the app executes it and asks at most two follow-up questions only when needed.
1. Answer four **Yes / No** questions: important, urgent, and two contextual comparative questions.
1. The app computes a priority score and auto-inserts the task at the matching rank.
1. Drag and drop can override the auto-order any time.

Hover over a task to complete (✓), edit (✎), or delete (✕).

## Data storage

Tasks are stored in `tasks.db` at Electron's per-user data path:

- **Windows:** `%APPDATA%\eisenhower-matrix\tasks.db`
- **macOS:** `~/Library/Application Support/eisenhower-matrix/tasks.db`
- **Linux:** `~/.config/eisenhower-matrix/tasks.db`

## Project structure

- `src/main.js` — Electron main process, IPC handlers
- `src/preload.js` — context-isolated API bridge
- `src/db.js` — SQLite layer (Node's built-in `node:sqlite`)
- `src/renderer/` — UI (HTML/CSS/JS)

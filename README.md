# Eisenhower Matrix

A cross-platform desktop app (Windows, macOS, and Linux) for prioritizing your tasks with the
**[Eisenhower Matrix](https://en.wikipedia.org/wiki/Time_management#Eisenhower_method)** — the "Urgent–Important" decision grid popularized by Dwight D. Eisenhower.

Instead of filling out forms, you add tasks through a simple chat box: type what you need to do,
answer two quick questions, and the app automatically files the task into the right quadrant with a
priority number.

## What it does

Every task is sorted into one of four quadrants based on whether it's **important** and/or **urgent**:

| Quadrant | Important? | Urgent? | What to do |
| --- | --- | --- | --- |
| **Q1 — Do First** | Yes | Yes | Act on these immediately |
| **Q2 — Schedule** | Yes | No | Designate time to work on these |
| **Q3 — Delegate** | No | Yes | Find someone else to do these |
| **Q4 — Eliminate** | No | No | Delete or reduce these completely |

Tasks are saved locally in a SQLite database, so your matrix persists between sessions.

## Prerequisites

- [Node.js](https://nodejs.org/) 22 or later (includes `npm`). The app relies on Node's built-in
  `node:sqlite` module, so a recent Node.js/Electron runtime is required.

## Run

The same commands work on Windows (PowerShell or Command Prompt), macOS, and Linux:

```bash
npm install
npm start
```

You can also launch the app directly from GitHub with `npx`:

```bash
npx github:slmcmahon/eisenhower-matrix
```

That command installs and runs the app from the repository's default branch (`main`).

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

1. Type a task in the chat box at the bottom and press **Enter**.
2. Answer **"Is this important?"** and **"Is this urgent?"** with the **Yes / No** buttons.
3. The task lands in the matching quadrant with a priority number.

Drag tasks to reorder them within a quadrant or to move them between quadrants. Hover over a task to
reveal actions to complete (✓), edit (✎), and delete (✕). Quadrants scroll when they fill up.

## Data storage

Tasks are stored in a SQLite database file named `tasks.db` at Electron's per-user data path:

- **Windows:** `%APPDATA%\eisenhower-matrix\tasks.db`
- **macOS:** `~/Library/Application Support/eisenhower-matrix/tasks.db`
- **Linux:** `~/.config/eisenhower-matrix/tasks.db`

## Project structure

- `src/main.js` — Electron main process, IPC handlers
- `src/preload.js` — context-isolated API bridge
- `src/db.js` — SQLite layer (Node's built-in `node:sqlite`, no native dependencies): CRUD plus quadrant move/reorder
- `src/renderer/` — UI (HTML/CSS/JS)

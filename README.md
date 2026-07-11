# Eisenhower Matrix

Electron app: four-quadrant Eisenhower Matrix with a chat interface for adding tasks.

## Run

```bash
npm install
npm start
```

## Usage

Type a task in the chat box below the matrix and press Return. Answer "Is this important?" and "Is this urgent?" with the Yes/No buttons — the task lands in the matching quadrant with a priority number.

Drag tasks to reorder within a quadrant or move them between quadrants. Hover a task for complete (✓), edit (✎), and delete (✕) actions. Quadrants scroll when full.

Data is stored in SQLite at Electron's userData path (`tasks.db`).

## Structure

- `src/main.js` — Electron main process, IPC handlers
- `src/preload.js` — context-isolated API bridge
- `src/db.js` — SQLite layer (Node's built-in `node:sqlite`, no native deps): CRUD + quadrant move/reorder
- `src/renderer/` — UI (HTML/CSS/JS)

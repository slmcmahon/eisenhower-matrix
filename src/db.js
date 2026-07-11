const path = require('path');
const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');

let db;

function init() {
  const dbPath = path.join(app.getPath('userData'), 'tasks.db');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      important INTEGER NOT NULL CHECK (important IN (0, 1)),
      urgent INTEGER NOT NULL CHECK (urgent IN (0, 1)),
      position INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Quadrant is derived from (important, urgent). Position orders tasks within a quadrant.

function getAllTasks() {
  return db
    .prepare(
      `SELECT id, text, important, urgent, position, completed
       FROM tasks
       ORDER BY important DESC, urgent DESC, position ASC, id ASC`
    )
    .all();
}

function addTask(text, important, urgent) {
  const imp = important ? 1 : 0;
  const urg = urgent ? 1 : 0;
  const { maxPos } = db
    .prepare(
      'SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE important = ? AND urgent = ?'
    )
    .get(imp, urg);
  const info = db
    .prepare(
      'INSERT INTO tasks (text, important, urgent, position) VALUES (?, ?, ?, ?)'
    )
    .run(text.trim(), imp, urg, Number(maxPos) + 1);
  return Number(info.lastInsertRowid);
}

function updateTaskText(id, text) {
  db.prepare('UPDATE tasks SET text = ? WHERE id = ?').run(text.trim(), id);
}

function setCompleted(id, completed) {
  db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, id);
}

function deleteTask(id) {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

// Move a task to a quadrant at a specific index; re-sequences both quadrants.
function moveTask(id, important, urgent, newIndex) {
  const imp = important ? 1 : 0;
  const urg = urgent ? 1 : 0;
  transaction(() => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) return;

    // Ordered ids in the target quadrant, excluding the moving task
    const ids = db
      .prepare(
        `SELECT id FROM tasks
         WHERE important = ? AND urgent = ? AND id != ?
         ORDER BY position ASC, id ASC`
      )
      .all(imp, urg, id)
      .map((r) => Number(r.id));

    const idx = Math.max(0, Math.min(newIndex, ids.length));
    ids.splice(idx, 0, Number(id));

    const upd = db.prepare(
      'UPDATE tasks SET important = ?, urgent = ?, position = ? WHERE id = ?'
    );
    ids.forEach((taskId, i) => upd.run(imp, urg, i, taskId));

    // Re-sequence the source quadrant if the task changed quadrants
    if (Number(task.important) !== imp || Number(task.urgent) !== urg) {
      const srcIds = db
        .prepare(
          `SELECT id FROM tasks
           WHERE important = ? AND urgent = ?
           ORDER BY position ASC, id ASC`
        )
        .all(task.important, task.urgent)
        .map((r) => Number(r.id));
      const updPos = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
      srcIds.forEach((taskId, i) => updPos.run(i, taskId));
    }
  });
}

module.exports = {
  init,
  getAllTasks,
  addTask,
  updateTaskText,
  setCompleted,
  deleteTask,
  moveTask,
};

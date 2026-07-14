const path = require('path');
const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');

let db;

function hasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

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
      priority_score REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Backward-compatible migration for existing local DBs.
  if (!hasColumn('tasks', 'priority_score')) {
    db.exec('ALTER TABLE tasks ADD COLUMN priority_score REAL NOT NULL DEFAULT 0');
  }

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
      `SELECT id, text, important, urgent, position, priority_score, completed
       FROM tasks
       ORDER BY important DESC, urgent DESC, completed ASC, position ASC, id ASC`
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
      'INSERT INTO tasks (text, important, urgent, position, priority_score) VALUES (?, ?, ?, ?, ?)'
    )
    .run(text.trim(), imp, urg, Number(maxPos) + 1, 0);
  return Number(info.lastInsertRowid);
}

function addTaskRanked(text, important, urgent, priorityScore) {
  const imp = important ? 1 : 0;
  const urg = urgent ? 1 : 0;
  const score = Number.isFinite(Number(priorityScore)) ? Number(priorityScore) : 0;

  let out = { id: null, rank: 1, score };
  transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO tasks (text, important, urgent, position, priority_score) VALUES (?, ?, ?, ?, ?)'
      )
      .run(text.trim(), imp, urg, 0, score);
    const id = Number(info.lastInsertRowid);

    const ordered = db
      .prepare(
        `SELECT id, completed, priority_score
         FROM tasks
         WHERE important = ? AND urgent = ? AND id != ?
         ORDER BY completed ASC, position ASC, id ASC`
      )
      .all(imp, urg, id)
      .map((r) => ({
        id: Number(r.id),
        completed: Number(r.completed),
        priorityScore: Number(r.priority_score) || 0,
      }));

    const incompletes = ordered.filter((t) => t.completed === 0);
    const completes = ordered.filter((t) => t.completed !== 0);

    let insertAt = incompletes.length;
    for (let i = 0; i < incompletes.length; i++) {
      if (score > incompletes[i].priorityScore) {
        insertAt = i;
        break;
      }
    }

    const orderedIds = [
      ...incompletes.slice(0, insertAt).map((t) => t.id),
      id,
      ...incompletes.slice(insertAt).map((t) => t.id),
      ...completes.map((t) => t.id),
    ];

    const upd = db.prepare(
      'UPDATE tasks SET important = ?, urgent = ?, position = ? WHERE id = ?'
    );
    orderedIds.forEach((taskId, i) => upd.run(imp, urg, i, taskId));

    out = {
      id,
      rank: insertAt + 1,
      score,
    };
  });

  return out;
}

function updateTaskText(id, text) {
  db.prepare('UPDATE tasks SET text = ? WHERE id = ?').run(text.trim(), id);
}

function setCompleted(id, completed) {
  const nextCompleted = completed ? 1 : 0;
  transaction(() => {
    const task = db
      .prepare('SELECT id, important, urgent, completed FROM tasks WHERE id = ?')
      .get(id);
    if (!task) return;

    // Move to the end of the current quadrant order whenever completion changes.
    // This keeps newly completed items at the bottom of the visible list.
    const { maxPos } = db
      .prepare(
        'SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE important = ? AND urgent = ? AND id != ?'
      )
      .get(task.important, task.urgent, id);

    db.prepare('UPDATE tasks SET completed = ?, position = ? WHERE id = ?').run(
      nextCompleted,
      Number(maxPos) + 1,
      id
    );
  });
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
         ORDER BY completed ASC, position ASC, id ASC`
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
           ORDER BY completed ASC, position ASC, id ASC`
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
  addTaskRanked,
  updateTaskText,
  setCompleted,
  deleteTask,
  moveTask,
};

/* Eisenhower Matrix renderer: chat entry flow + drag-and-drop matrix */

const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// ---------- Chat flow state machine ----------
// idle -> important -> urgent -> generated q1/q2 -> save ranked -> idle
let pending = null; // { text, important, urgent, comparativeQuestions, comparativeAnswers }

const SCORE_WEIGHTS = {
  important: 0.35,
  urgent: 0.3,
  comparative1: 0.2,
  comparative2: 0.15,
};

function addMsg(text, who) {
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

function addYesNoButtons(onAnswer) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-buttons';
  for (const [label, val] of [['Yes', true], ['No', false]]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      wrap.remove();
      addMsg(label, 'user');
      onAnswer(val);
    });
    wrap.appendChild(btn);
  }
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function configureFoundryOnStartup() {
  let settings = await window.api.getAiSettings();
  let test = await window.api.testAiSettings();

  while (!test.ok) {
    const reasonText = test.reason === 'missing' ? 'missing' : 'not working';
    const shouldUpdate = window.confirm(
      `Azure AI Foundry settings are ${reasonText}. Click OK to enter details, or Cancel to continue with fallback questions.`
    );
    if (!shouldUpdate) {
      addMsg('Azure AI Foundry is unavailable. Using fallback comparative questions.', 'bot');
      return;
    }

    const endpoint = window.prompt(
      'Azure AI Foundry endpoint (https://<resource>.cognitiveservices.azure.com)',
      settings.endpoint || ''
    );
    if (endpoint === null) return;

    const deployment = window.prompt('Deployment name', settings.deployment || '');
    if (deployment === null) return;

    const apiVersion = window.prompt('API version', settings.apiVersion || '2025-01-01-preview');
    if (apiVersion === null) return;

    const apiKey = window.prompt('API key (leave blank to keep existing)', '');
    if (apiKey === null) return;

    settings = await window.api.updateAiSettings({
      endpoint,
      deployment,
      apiVersion,
      apiKey,
    });
    test = await window.api.testAiSettings();
  }

  addMsg('Azure AI Foundry connection verified.', 'bot');
}

function zoneLabel(important, urgent) {
  return important
    ? urgent
      ? 'Q1: Do First'
      : 'Q2: Schedule'
    : urgent
      ? 'Q3: Delegate'
      : 'Q4: Eliminate';
}

function computePriorityScore(important, urgent, comparativeAnswers) {
  const c1 = comparativeAnswers[0] ? 1 : 0;
  const c2 = comparativeAnswers[1] ? 1 : 0;
  const score =
    (important ? 1 : 0) * SCORE_WEIGHTS.important +
    (urgent ? 1 : 0) * SCORE_WEIGHTS.urgent +
    c1 * SCORE_WEIGHTS.comparative1 +
    c2 * SCORE_WEIGHTS.comparative2;
  return Number((score * 100).toFixed(1));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function findTaskByText(tasks, query) {
  const needle = normalizeText(query);
  if (!needle) return null;
  return (
    tasks.find((task) => normalizeText(task.text) === needle) ||
    tasks.find((task) => normalizeText(task.text).includes(needle)) ||
    null
  );
}

function tasksInSameQuadrant(tasks, task) {
  return tasks
    .filter(
      (candidate) =>
        Boolean(candidate.important) === Boolean(task.important) &&
        Boolean(candidate.urgent) === Boolean(task.urgent)
    )
    .sort((a, b) => Number(a.position) - Number(b.position));
}

async function startNewTaskFlow(text, assumed) {
  if (assumed) {
    addMsg('Intent was not confident enough. Assuming this is a new task.', 'bot');
  }
  pending = {
    text,
    important: null,
    urgent: null,
    comparativeQuestions: [],
    comparativeAnswers: [],
  };
  askImportant();
}

async function executeRename(tasks, classification, originalInput) {
  let task = tasks.find((item) => item.id === classification.taskId) || null;
  let followUps = 0;

  if (!task) {
    const answer = window.prompt('Which existing task do you want to rename?');
    if (!answer) return false;
    followUps += 1;
    task = findTaskByText(tasks, answer);
  }
  if (!task) {
    addMsg('Could not find the task to rename. Assuming this is a new task instead.', 'bot');
    await startNewTaskFlow(originalInput, false);
    return true;
  }

  let nextText = classification.newText;
  if (!nextText) {
    const answer = window.prompt(`New title for "${task.text}"?`);
    if (!answer) return false;
    followUps += 1;
    nextText = answer.trim();
  }
  if (!nextText || followUps > 2) return false;

  await window.api.updateTaskText(task.id, nextText);
  addMsg(`Renamed "${task.text}" to "${nextText}".`, 'bot');
  await refresh();
  return true;
}

async function executeDelete(tasks, classification, originalInput) {
  let task = tasks.find((item) => item.id === classification.taskId) || null;
  let followUps = 0;

  if (!task) {
    const answer = window.prompt('Which existing task do you want to delete?');
    if (!answer) return false;
    followUps += 1;
    task = findTaskByText(tasks, answer);
  }
  if (!task) {
    addMsg('Could not find the task to delete. Assuming this is a new task instead.', 'bot');
    await startNewTaskFlow(originalInput, false);
    return true;
  }
  if (followUps < 2 && !window.confirm(`Delete "${task.text}"?`)) return false;

  await window.api.deleteTask(task.id);
  addMsg(`Deleted "${task.text}".`, 'bot');
  await refresh();
  return true;
}

async function executeComplete(tasks, classification, originalInput) {
  let task = tasks.find((item) => item.id === classification.taskId) || null;

  if (!task) {
    const answer = window.prompt('Which task should be marked complete?');
    if (!answer) return false;
    task = findTaskByText(tasks, answer);
  }
  if (!task) {
    addMsg('Could not find the task to complete. Assuming this is a new task instead.', 'bot');
    await startNewTaskFlow(originalInput, false);
    return true;
  }

  await window.api.setCompleted(task.id, true);
  addMsg(`Marked "${task.text}" complete.`, 'bot');
  await refresh();
  return true;
}

async function executeReprioritize(tasks, classification, originalInput) {
  let task = tasks.find((item) => item.id === classification.taskId) || null;
  let followUps = 0;

  if (!task) {
    const answer = window.prompt('Which task should be reprioritized?');
    if (!answer) return false;
    followUps += 1;
    task = findTaskByText(tasks, answer);
  }
  if (!task) {
    addMsg('Could not find the task to reprioritize. Assuming this is a new task instead.', 'bot');
    await startNewTaskFlow(originalInput, false);
    return true;
  }

  let position = classification.position;
  if (position === 'none') {
    const answer = window.prompt('Move it to top, bottom, before, or after?');
    if (!answer) return false;
    followUps += 1;
    position = normalizeText(answer);
  }

  const quadrantTasks = tasksInSameQuadrant(tasks, task);
  let newIndex = quadrantTasks.findIndex((item) => item.id === task.id);
  if (position === 'top') newIndex = 0;
  else if (position === 'bottom') newIndex = quadrantTasks.length - 1;
  else if (position === 'before' || position === 'after') {
    let reference = tasks.find((item) => item.id === classification.referenceTaskId) || null;
    if (!reference) {
      const answer = window.prompt(`Which task should "${task.text}" go ${position}?`);
      if (!answer) return false;
      followUps += 1;
      reference = findTaskByText(quadrantTasks.filter((item) => item.id !== task.id), answer);
    }
    if (!reference) return false;
    const referenceIndex = quadrantTasks.findIndex((item) => item.id === reference.id);
    newIndex = position === 'before' ? referenceIndex : referenceIndex + 1;
  }

  if (followUps > 2) return false;

  await window.api.moveTask(task.id, Boolean(task.important), Boolean(task.urgent), newIndex);
  addMsg(`Reprioritized "${task.text}" within ${zoneLabel(Boolean(task.important), Boolean(task.urgent))}.`, 'bot');
  await refresh();
  return true;
}

async function handleClassifiedInput(text) {
  const tasks = await window.api.getAllTasks();
  const classification = await window.api.classifyTaskInput(text, tasks);

  if (classification.intent === 'add_task') {
    await startNewTaskFlow(text, false);
    return;
  }

  if (classification.confidence <= 80) {
    await startNewTaskFlow(text, true);
    return;
  }

  if (classification.intent === 'rename_task' && (await executeRename(tasks, classification, text))) {
    return;
  }
  if (classification.intent === 'delete_task' && (await executeDelete(tasks, classification, text))) {
    return;
  }
  if (classification.intent === 'complete_task' && (await executeComplete(tasks, classification, text))) {
    return;
  }
  if (
    classification.intent === 'reprioritize_task' &&
    (await executeReprioritize(tasks, classification, text))
  ) {
    return;
  }

  addMsg('Assuming this is a new task.', 'bot');
  await startNewTaskFlow(text, false);
}

function askImportant() {
  addMsg('Is this important?', 'bot');
  addYesNoButtons((important) => {
    pending.important = important;
    askUrgent();
  });
}

function askUrgent() {
  addMsg('Is this urgent?', 'bot');
  addYesNoButtons(async (urgent) => {
    pending.urgent = urgent;
    await askComparativeQuestions();
  });
}

async function askComparativeQuestions() {
  const { text, important, urgent } = pending;
  const tasks = await window.api.getAllTasks();
  const zoneTasks = tasks.filter(
    (t) =>
      Boolean(t.important) === Boolean(important) &&
      Boolean(t.urgent) === Boolean(urgent) &&
      !t.completed
  );

  const questions = await window.api.generateComparativeQuestions(
    text,
    important,
    urgent,
    zoneTasks
  );

  pending.comparativeQuestions = Array.isArray(questions) ? questions.slice(0, 2) : [];
  pending.comparativeAnswers = [];
  askComparativeQuestionAt(0);
}

function askComparativeQuestionAt(index) {
  const questions = pending.comparativeQuestions || [];
  if (index >= 2 || !questions[index]) {
    void finalizeRankedAdd();
    return;
  }

  addMsg(questions[index], 'bot');
  addYesNoButtons((answer) => {
    pending.comparativeAnswers.push(answer);
    askComparativeQuestionAt(index + 1);
  });
}

async function finalizeRankedAdd() {
  const { text, important, urgent, comparativeAnswers } = pending;
  const score = computePriorityScore(important, urgent, comparativeAnswers || []);
  const result = await window.api.addTaskRanked(text, important, urgent, score);
  const q = zoneLabel(important, urgent);

  pending = null;
  addMsg(`Added to ${q} at rank #${result.rank} (score ${score}).`, 'bot');
  chatInput.disabled = false;
  chatInput.focus();
  await refresh();
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || pending) return;
  addMsg(text, 'user');
  chatInput.value = '';
  chatInput.disabled = true;
  void handleClassifiedInput(text).finally(() => {
    if (!pending) {
      chatInput.disabled = false;
      chatInput.focus();
    }
  });
});

// ---------- Matrix rendering ----------

const lists = Array.from(document.querySelectorAll('.task-list'));

function listFor(important, urgent) {
  return lists.find(
    (l) => l.dataset.important === String(important) && l.dataset.urgent === String(urgent)
  );
}

function makeCard(task, index) {
  const li = document.createElement('li');
  li.className = 'task-card' + (task.completed ? ' completed' : '');
  li.draggable = true;
  li.dataset.id = task.id;

  const num = document.createElement('span');
  num.className = 'task-num';
  num.textContent = index + 1;

  const text = document.createElement('span');
  text.className = 'task-text';
  text.textContent = task.text;

  const actions = document.createElement('span');
  actions.className = 'task-actions';

  const doneBtn = document.createElement('button');
  doneBtn.title = task.completed ? 'Mark incomplete' : 'Mark complete';
  doneBtn.textContent = task.completed ? '↩︎' : '✓';
  doneBtn.addEventListener('click', async () => {
    await window.api.setCompleted(task.id, !task.completed);
    await refresh();
  });

  const editBtn = document.createElement('button');
  editBtn.title = 'Edit';
  editBtn.textContent = '✎';
  editBtn.addEventListener('click', () => startEdit(li, text, task));

  const delBtn = document.createElement('button');
  delBtn.title = 'Delete';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', async () => {
    await window.api.deleteTask(task.id);
    await refresh();
  });

  actions.append(doneBtn, editBtn, delBtn);
  li.append(num, text, actions);

  li.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(task.id));
    e.dataTransfer.effectAllowed = 'move';
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));

  return li;
}

function startEdit(li, textSpan, task) {
  if (li.querySelector('input')) return;
  li.draggable = false;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = task.text;
  textSpan.textContent = '';
  textSpan.appendChild(input);
  input.focus();
  input.select();

  const finish = async (save) => {
    const val = input.value.trim();
    if (save && val && val !== task.text) {
      await window.api.updateTaskText(task.id, val);
    }
    await refresh();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function refresh() {
  const tasks = await window.api.getAllTasks();
  for (const list of lists) list.replaceChildren();
  const grouped = new Map();
  for (const t of tasks) {
    const key = `${t.important}-${t.urgent}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(t);
  }
  for (const [key, group] of grouped) {
    const [imp, urg] = key.split('-');
    const list = listFor(imp, urg);
    group.forEach((task, i) => list.appendChild(makeCard(task, i)));
  }
}

// ---------- Drag and drop ----------

function dropIndex(list, y) {
  const cards = Array.from(list.querySelectorAll('.task-card:not(.dragging)'));
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return i;
  }
  return cards.length;
}

for (const list of lists) {
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    list.classList.add('drag-over');
  });
  list.addEventListener('dragleave', (e) => {
    if (!list.contains(e.relatedTarget)) list.classList.remove('drag-over');
  });
  list.addEventListener('drop', async (e) => {
    e.preventDefault();
    list.classList.remove('drag-over');
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (!id) return;
    const important = list.dataset.important === '1';
    const urgent = list.dataset.urgent === '1';
    await window.api.moveTask(id, important, urgent, dropIndex(list, e.clientY));
    await refresh();
  });
}

// Also allow dropping anywhere on a quadrant (not just the list)
for (const quad of document.querySelectorAll('.quadrant')) {
  quad.addEventListener('dragover', (e) => e.preventDefault());
  quad.addEventListener('drop', async (e) => {
    if (e.target.closest('.task-list')) return; // handled above
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (!id) return;
    const important = quad.dataset.important === '1';
    const urgent = quad.dataset.urgent === '1';
    const list = quad.querySelector('.task-list');
    await window.api.moveTask(id, important, urgent, list.children.length);
    await refresh();
  });
}

// ---------- Init ----------
void (async () => {
  await configureFoundryOnStartup();
  addMsg('Type a task below and press Return to get started.', 'bot');
  await refresh();
})();

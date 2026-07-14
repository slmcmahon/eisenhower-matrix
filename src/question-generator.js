const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  azureFoundry: {
    endpoint: 'https://codegen-foundry.cognitiveservices.azure.com',
    deployment: 'gpt-4.1-2',
    apiVersion: '2025-01-01-preview',
    apiKey: '',
    timeoutMs: 5000,
    maxOutputTokens: 250,
  },
};

let aiAvailability = {
  ok: null,
  checkedAt: 0,
};

function zoneName(important, urgent) {
  if (important && urgent) return 'Q1: Do First';
  if (important && !urgent) return 'Q2: Schedule';
  if (!important && urgent) return 'Q3: Delegate';
  return 'Q4: Eliminate';
}

function fallbackQuestions() {
  return [
    'Compared with current tasks in this zone, would delaying this task by one day create more negative impact than most?',
    'Compared with current tasks in this zone, is this task more time-sensitive this week than most?',
  ];
}

function settingsFilePath(app) {
  return path.join(app.getPath('userData'), 'settings.json');
}

function normalizeSettings(raw) {
  const src = raw?.azureFoundry || {};
  return {
    azureFoundry: {
      endpoint: String(src.endpoint || DEFAULT_SETTINGS.azureFoundry.endpoint).trim(),
      deployment: String(src.deployment || DEFAULT_SETTINGS.azureFoundry.deployment).trim(),
      apiVersion: String(src.apiVersion || DEFAULT_SETTINGS.azureFoundry.apiVersion).trim(),
      apiKey: String(src.apiKey || DEFAULT_SETTINGS.azureFoundry.apiKey).trim(),
      timeoutMs: Number(src.timeoutMs) || DEFAULT_SETTINGS.azureFoundry.timeoutMs,
      maxOutputTokens: Number(src.maxOutputTokens) || DEFAULT_SETTINGS.azureFoundry.maxOutputTokens,
    },
  };
}

function loadSettings(app) {
  const filePath = settingsFilePath(app);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(app, settings) {
  fs.writeFileSync(settingsFilePath(app), JSON.stringify(settings, null, 2), 'utf8');
  aiAvailability = {
    ok: null,
    checkedAt: 0,
  };
}

function getAiSettings(app) {
  const settings = loadSettings(app).azureFoundry;
  return {
    endpoint: settings.endpoint,
    deployment: settings.deployment,
    apiVersion: settings.apiVersion,
    timeoutMs: settings.timeoutMs,
    maxOutputTokens: settings.maxOutputTokens,
    hasApiKey: Boolean(settings.apiKey),
    hasRequiredSettings: Boolean(
      settings.endpoint && settings.deployment && settings.apiVersion && settings.apiKey
    ),
  };
}

async function classifyTaskInput(app, payload) {
  const settings = loadSettings(app).azureFoundry;
  const inputText = String(payload?.inputText || '').trim();
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];

  const deterministic = deterministicIntentParse(inputText, tasks);
  if (deterministic) {
    return deterministic;
  }

  if (!settings.endpoint || !settings.deployment || !settings.apiVersion || !settings.apiKey) {
    return {
      intent: 'add_task',
      confidence: 0,
      taskId: null,
      newText: inputText,
      position: 'none',
      referenceTaskId: null,
      needsFollowUp: false,
    };
  }

  const connection = await testAiSettings(app, { force: false });
  if (!connection.ok) {
    return {
      intent: 'add_task',
      confidence: 0,
      taskId: null,
      newText: inputText,
      position: 'none',
      referenceTaskId: null,
      needsFollowUp: false,
    };
  }

  const prompt = [
    'Classify the user input for an Eisenhower Matrix task app.',
    'Choose exactly one intent: add_task, rename_task, delete_task, reprioritize_task, complete_task, unknown.',
    'If confidence is below 80 and it is not clearly a command, prefer unknown.',
    'Q1/Q2/Q3/Q4 refer to quadrants.',
    'first/second/third task in a quadrant refer to quadrantRank in the provided task list.',
    'Return JSON only with keys: intent, confidence, taskId, newText, position, referenceTaskId, needsFollowUp.',
    'position must be one of top, bottom, before, after, none.',
    `User input: ${JSON.stringify(inputText)}`,
    `Tasks: ${JSON.stringify(compactIntentTasks(tasks))}`,
  ].join('\n');

  const text = await askFoundry(
    settings,
    'Return only compact JSON for intent classification. No markdown. No explanation.',
    prompt,
    120
  );

  const parsed = extractJsonObject(text) || {};
  const validIntent = new Set([
    'add_task',
    'rename_task',
    'delete_task',
    'reprioritize_task',
    'complete_task',
    'unknown',
  ]);

  return {
    intent: validIntent.has(parsed.intent) ? parsed.intent : 'unknown',
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
    taskId: Number.isFinite(Number(parsed.taskId)) ? Number(parsed.taskId) : null,
    newText: typeof parsed.newText === 'string' ? parsed.newText.trim() : '',
    position:
      ['top', 'bottom', 'before', 'after', 'none'].includes(parsed.position) ? parsed.position : 'none',
    referenceTaskId: Number.isFinite(Number(parsed.referenceTaskId))
      ? Number(parsed.referenceTaskId)
      : null,
    needsFollowUp: Boolean(parsed.needsFollowUp),
  };
}

function updateAiSettings(app, partial) {
  const current = loadSettings(app);
  const next = normalizeSettings({
    azureFoundry: {
      ...current.azureFoundry,
      ...partial,
    },
  });

  if (!partial || typeof partial.apiKey !== 'string' || partial.apiKey.trim() === '') {
    next.azureFoundry.apiKey = current.azureFoundry.apiKey;
  }

  saveSettings(app, next);
  return getAiSettings(app);
}

function compactTasks(tasks) {
  return tasks.slice(0, 8).map((t, i) => ({
    i: i + 1,
    text: String(t.text || '').slice(0, 120),
    score: Number(t.priority_score) || 0,
  }));
}

function compactIntentTasks(tasks) {
  const ordered = tasks
    .slice()
    .sort((a, b) => {
      if (Number(b.important) !== Number(a.important)) return Number(b.important) - Number(a.important);
      if (Number(b.urgent) !== Number(a.urgent)) return Number(b.urgent) - Number(a.urgent);
      if (Number(a.completed) !== Number(b.completed)) return Number(a.completed) - Number(b.completed);
      if (Number(a.position) !== Number(b.position)) return Number(a.position) - Number(b.position);
      return Number(a.id) - Number(b.id);
    });

  const rankById = new Map();
  const rankState = new Map();
  for (const task of ordered) {
    const quadrant = zoneName(Boolean(task.important), Boolean(task.urgent)).slice(0, 2);
    const current = (rankState.get(quadrant) || 0) + 1;
    rankState.set(quadrant, current);
    rankById.set(Number(task.id), { quadrant, quadrantRank: current });
  }

  return ordered.slice(0, 30).map((t) => {
    const rank = rankById.get(Number(t.id)) || { quadrant: 'Q4', quadrantRank: 1 };
    return {
      id: Number(t.id),
      text: String(t.text || '').slice(0, 100),
      quadrant: rank.quadrant,
      quadrantRank: rank.quadrantRank,
      important: Boolean(t.important),
      urgent: Boolean(t.urgent),
      completed: Boolean(t.completed),
      position: Number(t.position) || 0,
    };
  });
}

function parseOrdinal(word) {
  const normalized = String(word || '').trim().toLowerCase();
  const mapping = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
  };
  if (mapping[normalized]) return mapping[normalized];
  const numeric = Number.parseInt(normalized, 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveQuadrantRankTask(tasks, quadrant, rank) {
  const ordered = compactIntentTasks(tasks)
    .filter((task) => task.quadrant.toLowerCase() === quadrant.toLowerCase())
    .sort((a, b) => a.quadrantRank - b.quadrantRank);
  return ordered.find((task) => task.quadrantRank === rank) || null;
}

function deterministicIntentParse(inputText, tasks) {
  const renameMatch = inputText.match(
    /^rename\s+the\s+(first|second|third|fourth|fifth|\d+)\s+task\s+in\s+(q[1-4])\s+to\s+(.+)$/i
  );
  if (renameMatch) {
    const rank = parseOrdinal(renameMatch[1]);
    const quadrant = renameMatch[2].toUpperCase();
    const newText = renameMatch[3].trim();
    const task = rank ? resolveQuadrantRankTask(tasks, quadrant, rank) : null;
    return {
      intent: 'rename_task',
      confidence: task && newText ? 96 : 70,
      taskId: task ? task.id : null,
      newText,
      position: 'none',
      referenceTaskId: null,
      needsFollowUp: !task || !newText,
    };
  }

  return null;
}

function extractJsonObject(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function askFoundry(settings, systemPrompt, userPrompt, maxTokens = settings.maxOutputTokens) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  const endpoint = settings.endpoint.replace(/\/$/, '');
  const url =
    `${endpoint}/openai/deployments/${encodeURIComponent(settings.deployment)}` +
    `/chat/completions?api-version=${encodeURIComponent(settings.apiVersion)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': settings.apiKey,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const data = await res.json();
    return String(data?.choices?.[0]?.message?.content || '');
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function testAiSettings(app, options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && aiAvailability.ok !== null && now - aiAvailability.checkedAt < 60000) {
    return aiAvailability.ok
      ? {
          ok: true,
          reason: 'ok',
          message: 'Azure AI Foundry connection succeeded.',
        }
      : {
          ok: false,
          reason: 'failed',
          message: 'Azure AI Foundry connection test failed.',
        };
  }

  const settings = loadSettings(app).azureFoundry;
  if (!settings.endpoint || !settings.deployment || !settings.apiVersion || !settings.apiKey) {
    aiAvailability = {
      ok: false,
      checkedAt: now,
    };
    return {
      ok: false,
      reason: 'missing',
      message: 'Azure AI Foundry settings are incomplete.',
    };
  }

  const text = await askFoundry(
    { ...settings, maxOutputTokens: Math.min(settings.maxOutputTokens, 16) },
    'Reply with exactly this JSON and nothing else: {"ok":true}',
    'Reply with exactly this JSON and nothing else: {"ok":true}',
    16
  );

  const parsed = extractJsonObject(text);
  if (parsed?.ok === true) {
    aiAvailability = {
      ok: true,
      checkedAt: now,
    };
    return {
      ok: true,
      reason: 'ok',
      message: 'Azure AI Foundry connection succeeded.',
    };
  }

  aiAvailability = {
    ok: false,
    checkedAt: now,
  };

  return {
    ok: false,
    reason: 'failed',
    message: 'Azure AI Foundry connection test failed.',
  };
}

async function generateComparativeQuestions(app, payload) {
  const { taskText, important, urgent, zoneTasks } = payload;
  const settings = loadSettings(app).azureFoundry;

  if (!settings.endpoint || !settings.deployment || !settings.apiVersion || !settings.apiKey) {
    return fallbackQuestions();
  }

  const context = {
    zone: zoneName(Boolean(important), Boolean(urgent)),
    newTask: String(taskText || '').slice(0, 180),
    peers: compactTasks(Array.isArray(zoneTasks) ? zoneTasks : []),
  };

  const prompt = [
    'Create exactly 2 concise yes/no questions for ranking a new task within the same Eisenhower zone.',
    'Both questions must be comparative against peer tasks in the zone context.',
    'Answering YES must indicate higher priority than peers.',
    'Output JSON only with this shape: {"questions":["q1","q2"]}.',
    'No markdown. No extra keys.',
    `Context: ${JSON.stringify(context)}`,
  ].join('\n');

  const text = await askFoundry(
    settings,
    'Return only JSON. Create exactly two comparative yes/no questions for prioritizing one task against peer tasks in the same Eisenhower zone.',
    prompt,
    settings.maxOutputTokens
  );
  const parsed = extractJsonObject(text);
  const questions = parsed?.questions;
  if (
    Array.isArray(questions) &&
    questions.length === 2 &&
    questions.every((q) => typeof q === 'string' && q.trim())
  ) {
    return questions.map((q) => q.trim());
  }

  return fallbackQuestions();
}

module.exports = {
  classifyTaskInput,
  getAiSettings,
  testAiSettings,
  updateAiSettings,
  generateComparativeQuestions,
};

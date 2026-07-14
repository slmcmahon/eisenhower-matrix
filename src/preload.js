const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAllTasks: () => ipcRenderer.invoke('tasks:getAll'),
  addTask: (text, important, urgent) =>
    ipcRenderer.invoke('tasks:add', { text, important, urgent }),
  addTaskRanked: (text, important, urgent, priorityScore) =>
    ipcRenderer.invoke('tasks:addRanked', { text, important, urgent, priorityScore }),
  generateComparativeQuestions: (taskText, important, urgent, zoneTasks) =>
    ipcRenderer.invoke('tasks:generateQuestions', {
      taskText,
      important,
      urgent,
      zoneTasks,
    }),
  classifyTaskInput: (inputText, tasks) =>
    ipcRenderer.invoke('tasks:classifyInput', { inputText, tasks }),
  getAiSettings: () => ipcRenderer.invoke('settings:getAi'),
  testAiSettings: () => ipcRenderer.invoke('settings:testAi'),
  updateAiSettings: (settings) => ipcRenderer.invoke('settings:updateAi', settings),
  updateTaskText: (id, text) =>
    ipcRenderer.invoke('tasks:updateText', { id, text }),
  setCompleted: (id, completed) =>
    ipcRenderer.invoke('tasks:setCompleted', { id, completed }),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  moveTask: (id, important, urgent, newIndex) =>
    ipcRenderer.invoke('tasks:move', { id, important, urgent, newIndex }),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAllTasks: () => ipcRenderer.invoke('tasks:getAll'),
  addTask: (text, important, urgent) =>
    ipcRenderer.invoke('tasks:add', { text, important, urgent }),
  updateTaskText: (id, text) =>
    ipcRenderer.invoke('tasks:updateText', { id, text }),
  setCompleted: (id, completed) =>
    ipcRenderer.invoke('tasks:setCompleted', { id, completed }),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  moveTask: (id, important, urgent, newIndex) =>
    ipcRenderer.invoke('tasks:move', { id, important, urgent, newIndex }),
});

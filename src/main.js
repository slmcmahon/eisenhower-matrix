const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const db = require('./db');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 800,
    minHeight: 700,
    title: 'Eisenhower Matrix',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  db.init();

  ipcMain.handle('tasks:getAll', () => db.getAllTasks());
  ipcMain.handle('tasks:add', (_e, { text, important, urgent }) =>
    db.addTask(text, important, urgent)
  );
  ipcMain.handle('tasks:updateText', (_e, { id, text }) =>
    db.updateTaskText(id, text)
  );
  ipcMain.handle('tasks:setCompleted', (_e, { id, completed }) =>
    db.setCompleted(id, completed)
  );
  ipcMain.handle('tasks:delete', (_e, id) => db.deleteTask(id));
  ipcMain.handle('tasks:move', (_e, { id, important, urgent, newIndex }) =>
    db.moveTask(id, important, urgent, newIndex)
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

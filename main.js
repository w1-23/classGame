const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');

app.setName('学习闯关乐园');
Menu.setApplicationMenu(null);

const PACK_PATHS = [
  'data/G1-语文-拼音识字.json',
  'data/G3-英语-基础词汇听力.json',
  'data/古诗-常见篇目朗读.json'
];

ipcMain.handle('learning:load-packs', async () => {
  return Promise.all(PACK_PATHS.map(async relativePath => {
    const content = await fs.readFile(path.join(__dirname, relativePath), 'utf8');
    return JSON.parse(content);
  }));
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f7fbff',
    title: '学习闯关乐园',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.maximize();
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

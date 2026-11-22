const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

app.setName('学习闯关乐园');
Menu.setApplicationMenu(null);

const LOG_PATH = path.join(app.getPath('userData'), 'classGame-startup.log');

function log(message) {
  try {
    fsSync.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fsSync.appendFileSync(
      LOG_PATH,
      `${new Date().toISOString()} ${message}\n`,
      'utf8'
    );
  } catch {
    // Diagnostics must never prevent the application from starting.
  }
}

function logError(message, error) {
  log(`${message}: ${error?.stack || error?.message || error}`);
}

process.on('uncaughtException', error => {
  logError('uncaughtException', error);
});
process.on('unhandledRejection', error => {
  logError('unhandledRejection', error);
});

ipcMain.handle('learning:load-packs', async () => {
  const manifest = JSON.parse(
    await fs.readFile(path.join(__dirname, 'data/manifest.json'), 'utf8')
  );
  return Promise.all(manifest.packs.map(async relativePath => {
    const content = await fs.readFile(path.join(__dirname, relativePath), 'utf8');
    return JSON.parse(content);
  }));
});

function createWindow() {
  log('createWindow');
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
  win.webContents.on('render-process-gone', (_event, details) => {
    log(`render-process-gone ${JSON.stringify(details)}`);
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log(`did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    logError(`preload-error ${preloadPath}`, error);
  });
  win.maximize();
  win.loadFile('index.html').catch(error => {
    logError('loadFile failed', error);
    dialog.showErrorBox('学习闯关乐园启动失败', error.message);
  });
}

app.whenReady().then(() => {
  log(`ready electron=${process.versions.electron} chrome=${process.versions.chrome} argv=${process.argv.join(' ')}`);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('child-process-gone', (_event, details) => {
  log(`child-process-gone ${JSON.stringify(details)}`);
});

app.on('before-quit', () => {
  log('before-quit');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

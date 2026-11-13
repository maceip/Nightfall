'use strict';

/**
 * Hardened Electron Main Process for Nightfall Three-Column Desktop Shell.
 * Configures native frameless hiddenInset window controls inline with the custom
 * Nightfall top bar and locks down renderer privileges.
 */
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, Notification, shell } = require('electron');

function createMainWindow() {
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    title: 'Nightfall',
    backgroundColor: '#f6f7f8',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 12 } }
      : {
          titleBarOverlay: {
            color: '#f6f7f8',
            symbolColor: '#111318',
            height: 40,
          },
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Prevent untrusted navigation or unexpected popups inside the security console
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://github.com/')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    const devOrigin = process.env.NIGHTFALL_RENDERER_URL || 'http://localhost:5173';
    if (!targetUrl.startsWith(devOrigin) && !targetUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });

  const devServerUrl = process.env.NIGHTFALL_RENDERER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

ipcMain.handle('nightfall:get-platform-info', () => ({
  isElectron: true,
  platform: process.platform,
  arch: process.arch,
}));

ipcMain.handle('nightfall:pick-local-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Local Repository for Nightfall Scan',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('nightfall:notify', (_event, payload) => {
  if (Notification.isSupported() && payload && typeof payload.title === 'string') {
    new Notification({
      title: payload.title,
      body: typeof payload.body === 'string' ? payload.body : '',
    }).show();
    return true;
  }
  return false;
});

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

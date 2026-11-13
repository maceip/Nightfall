'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nightfallDesktop', {
  isElectron: true,
  getPlatformInfo: () => ipcRenderer.invoke('nightfall:get-platform-info'),
  pickLocalRepository: () => ipcRenderer.invoke('nightfall:pick-local-directory'),
  sendNativeNotification: (title, body) =>
    ipcRenderer.invoke('nightfall:notify', { title, body }),
});

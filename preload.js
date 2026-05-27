const { contextBridge } = require('electron');
const { buildElectronApi } = require('./src/preload');

contextBridge.exposeInMainWorld('electronAPI', buildElectronApi());

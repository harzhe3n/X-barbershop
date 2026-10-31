// XBARBER SHOP - Preload Script for Security

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that Electron can use to replace the remote module
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  dbQuery: (query, params) => ipcRenderer.invoke('db-query', query, params),
  dbRun: (query, params) => ipcRenderer.invoke('db-run', query, params),
  runTransaction: statements => ipcRenderer.invoke('db-transaction', statements),
  clearHistory: (today) => ipcRenderer.invoke('clear-history', today),
  exportSchedulePdf: (appointments, rangeLabel) => ipcRenderer.invoke('export-schedule-pdf', appointments, rangeLabel),
  
  // File operations
  fileRead: (filePath) => ipcRenderer.invoke('file-read', filePath),
  fileWrite: (filePath, content) => ipcRenderer.invoke('file-write', filePath, content),
  dirCreate: (dirPath) => ipcRenderer.invoke('dir-create', dirPath),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  
  // Backup/restore operations
  backupDatabase: (backupPath) => ipcRenderer.invoke('backup-database', backupPath),
  restoreDatabase: (backupPath) => ipcRenderer.invoke('restore-database', backupPath),
  
  // App paths
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  
  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
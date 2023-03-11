'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    return ipcRenderer.send(channel, data)
  },
  onPreferencesLoaded: (callback) => ipcRenderer.on('loadPreferences', callback),
  onAccentColorChanged: (callback) => ipcRenderer.on('updateAccentColor', callback),
  onWindowStateChanged: (callback) => ipcRenderer.on('stateChange', callback)
})

import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI } from '../shared/domain'

const api: DesktopAPI = {
  load: () => ipcRenderer.invoke('workspace:load'),
  save: (data) => ipcRenderer.invoke('workspace:save', data),
  keyStatus: (connection) => ipcRenderer.invoke('key:status', connection),
  setKey: (key, connection) => ipcRenderer.invoke('key:set', key, connection),
  models: (connection) => ipcRenderer.invoke('connection:models', connection),
  evaluate: (request) => ipcRenderer.invoke('decision:run', request),
  cancel: (id) => ipcRenderer.invoke('decision:cancel', id),
  openExternal: (destination) => ipcRenderer.invoke('external:open', destination),
}
contextBridge.exposeInMainWorld('jever', api)

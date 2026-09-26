// Electron preload: the only code that runs with both a DOM and IPC access.
//
// The renderer gets a frozen object with five methods and nothing else. No Node globals,
// no `require`, no `ipcRenderer`, no filesystem paths and no decrypted API keys cross this
// boundary. Provider and URL values are validated again in `createDesktopBridge` so a
// compromised renderer cannot widen the main-process contract.
import { contextBridge, ipcRenderer } from 'electron';
import { PRELOAD_BRIDGE_KEY, createDesktopBridge } from './ipc.mjs';

contextBridge.exposeInMainWorld(PRELOAD_BRIDGE_KEY, createDesktopBridge((channel, payload) => ipcRenderer.invoke(channel, payload)));

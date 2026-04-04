import { ElectronAPI } from "@electron-toolkit/preload";

// Newtab uses the same sidebarAPI shape as sidebar.d.ts
declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}

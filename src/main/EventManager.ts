import { ipcMain, WebContents } from "electron";
import type { CreateTabOptions, Window } from "./Window";

export class EventManager {
  private mainWindow: Window;

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Tab management events
    this.handleTabEvents();

    // Sidebar events
    this.handleSidebarEvents();
    this.handleCompanionEvents();

    // Page content events
    this.handlePageContentEvents();

    // Dark mode events
    this.handleDarkModeEvents();

    // Debug events
    this.handleDebugEvents();
  }

  private handleTabEvents(): void {
    // Create new tab
    ipcMain.handle("create-tab", (_, input?: string | CreateTabOptions) => {
      const newTab = this.mainWindow.createTab(input);
      return { id: newTab.id, title: newTab.title, url: newTab.url };
    });

    // Close tab
    ipcMain.handle("close-tab", (_, id: string) => {
      this.mainWindow.closeTab(id);
    });

    // Switch tab
    ipcMain.handle("switch-tab", (_, id: string) => {
      this.mainWindow.switchActiveTab(id);
    });

    // Get tabs
    ipcMain.handle("get-tabs", () => {
      const activeTabId = this.mainWindow.activeTab?.id;
      return this.mainWindow.allTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isActive: activeTabId === tab.id,
        kind: tab.kind,
        isAgentControlled: tab.isAgentControlled,
      }));
    });

    // Navigation (for compatibility with existing code)
    ipcMain.handle("navigate-to", (_, url: string) => {
      if (this.mainWindow.activeTab) {
        if (this.mainWindow.activeTab.kind === "chat") {
          this.mainWindow.createTab(url);
          return;
        }
        this.mainWindow.activeTab.loadURL(url);
      }
    });

    ipcMain.handle("navigate-tab", async (_, tabId: string, url: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        if (tab.kind === "chat") {
          this.mainWindow.createTab(url);
          return true;
        }
        await tab.loadURL(url);
        return true;
      }
      return false;
    });

    ipcMain.handle("go-back", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goBack();
      }
    });

    ipcMain.handle("go-forward", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goForward();
      }
    });

    ipcMain.handle("reload", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.reload();
      }
    });

    // Tab-specific navigation handlers
    ipcMain.handle("tab-go-back", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goBack();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-go-forward", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goForward();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-reload", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.reload();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-screenshot", async (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        const image = await tab.screenshot();
        return image.toDataURL();
      }
      return null;
    });

    ipcMain.handle("tab-run-js", async (_, tabId: string, code: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        return await tab.runJs(code);
      }
      return null;
    });

    // Tab info
    ipcMain.handle("get-active-tab-info", () => {
      const activeTab = this.mainWindow.activeTab;
      if (activeTab) {
        return {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          canGoBack: activeTab.webContents.canGoBack(),
          canGoForward: activeTab.webContents.canGoForward(),
          kind: activeTab.kind,
          isAgentControlled: activeTab.isAgentControlled,
        };
      }
      return null;
    });
  }

  private handleSidebarEvents(): void {
    // Toggle sidebar
    ipcMain.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

    // Chat message (also serves as "agent-run" — starts the tool-use loop)
    ipcMain.handle("sidebar-chat-message", async (event, request) => {
      await this.mainWindow.sidebar.client.sendChatMessage(event.sender, request);
    });

    // Stop the in-progress agent run
    ipcMain.handle("agent-stop", (event) => {
      this.mainWindow.sidebar.client.stopAgent(event.sender);
      return true;
    });

    // Clear chat
    ipcMain.handle("sidebar-clear-chat", (event) => {
      this.mainWindow.sidebar.client.clearMessages(event.sender);
      return true;
    });

    // Get messages
    ipcMain.handle("sidebar-get-chat-session", (event) => {
      return this.mainWindow.sidebar.client.getSessionState(event.sender);
    });

    ipcMain.handle("sidebar-open-chat-session", (event, sessionId: string) => {
      return this.mainWindow.sidebar.client.openChatSession(event.sender, sessionId);
    });
  }

  private handleCompanionEvents(): void {
    ipcMain.handle("companion-list", async () => {
      return await this.mainWindow.sidebar.client.marketplace.listCompanions();
    });

    ipcMain.handle("companion-search", async (_, query: string) => {
      return await this.mainWindow.sidebar.client.marketplace.searchCompanions(query);
    });

    ipcMain.handle("companion-get", async (_, companionId: string) => {
      return await this.mainWindow.sidebar.client.marketplace.getCompanion(companionId);
    });

    ipcMain.handle("companion-create-draft", async () => {
      return await this.mainWindow.sidebar.client.marketplace.createDraftCompanion();
    });

    ipcMain.handle(
      "companion-update-draft",
      async (_, companionId: string, patch: unknown) => {
        return await this.mainWindow.sidebar.client.marketplace.updateDraftCompanion(
          companionId,
          patch as never,
        );
      },
    );

    ipcMain.handle(
      "companion-builder-chat",
      async (_, companionId: string, message: string) => {
        return await this.mainWindow.sidebar.client.marketplace.chatCompanionBuilder(
          companionId,
          message,
        );
      },
    );

    ipcMain.handle("companion-preview-draft", async (_, input: unknown) => {
      return await this.mainWindow.sidebar.client.marketplace.previewCompanionDraft(
        input as never,
      );
    });

    ipcMain.handle("companion-publish-draft", async (_, companionId: string) => {
      return await this.mainWindow.sidebar.client.marketplace.publishCompanionDraft(
        companionId,
      );
    });
  }

  private handlePageContentEvents(): void {
    // Get page content
    ipcMain.handle("get-page-content", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabHtml();
        } catch (error) {
          console.error("Error getting page content:", error);
          return null;
        }
      }
      return null;
    });

    // Get page text
    ipcMain.handle("get-page-text", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabText();
        } catch (error) {
          console.error("Error getting page text:", error);
          return null;
        }
      }
      return null;
    });

    // Get current URL
    ipcMain.handle("get-current-url", () => {
      if (this.mainWindow.activeTab) {
        return this.mainWindow.activeTab.url;
      }
      return null;
    });
  }

  private handleDarkModeEvents(): void {
    // Dark mode broadcasting
    ipcMain.on("dark-mode-changed", (event, isDarkMode) => {
      this.broadcastDarkMode(event.sender, isDarkMode);
    });
  }

  private handleDebugEvents(): void {
    // Ping test
    ipcMain.on("ping", () => console.log("pong"));
  }

  private broadcastDarkMode(sender: WebContents, isDarkMode: boolean): void {
    // Send to topbar
    if (this.mainWindow.topBar.view.webContents !== sender) {
      this.mainWindow.topBar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode,
      );
    }

    // Send to sidebar
    if (this.mainWindow.sidebar.view.webContents !== sender) {
      this.mainWindow.sidebar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode,
      );
    }

    // Send to all tabs
    this.mainWindow.allTabs.forEach((tab) => {
      if (tab.webContents !== sender) {
        tab.webContents.send("dark-mode-updated", isDarkMode);
      }
    });
  }

  // Clean up event listeners
  public cleanup(): void {
    ipcMain.removeAllListeners();
  }
}

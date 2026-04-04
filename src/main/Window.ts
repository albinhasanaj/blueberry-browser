import { BaseWindow, nativeImage } from "electron";
import { join } from "path";
import { Tab, type TabOptions } from "./Tab";
import { TopBar } from "./TopBar";
import { SideBar } from "./SideBar";
import { DEFAULT_WINDOW_TITLE, getTabBounds } from "./layout";

export interface CreateTabOptions extends TabOptions {
  activate?: boolean;
  sessionId?: string;
}

export class Window {
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter: number = 0;
  private _topBar: TopBar;
  private _sideBar: SideBar;

  constructor() {
    // Create the browser window.
    this._baseWindow = new BaseWindow({
      width: 1000,
      height: 800,
      show: true,
      autoHideMenuBar: false,
      titleBarStyle: "hidden",
      icon: nativeImage.createFromPath(join(__dirname, "../../resources/icon.png")),
      ...(process.platform !== "darwin" ? { titleBarOverlay: true } : {}),
      trafficLightPosition: { x: 15, y: 13 },
    });

    this._baseWindow.setMinimumSize(1000, 800);

    this._topBar = new TopBar(this._baseWindow);
    this._sideBar = new SideBar(this._baseWindow);

    // Set the window reference on the LLM client to avoid circular dependency
    this._sideBar.client.setWindow(this);

    // Create the first tab
    this.createTab();

    // Set up window resize handler
    this._baseWindow.on("resize", () => {
      this.updateTabBounds();
      this._topBar.updateBounds();
      this._sideBar.updateBounds();
      // Notify renderer of resize through active tab
      const bounds = this._baseWindow.getBounds();
      if (this.activeTab) {
        this.activeTab.webContents.send("window-resized", {
          width: bounds.width,
          height: bounds.height,
        });
      }
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this._baseWindow.on("closed", () => {
      // Clean up all tabs when window is closed
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
    });
  }

  // Getters
  get window(): BaseWindow {
    return this._baseWindow;
  }

  get activeTab(): Tab | null {
    if (this.activeTabId) {
      return this.tabsMap.get(this.activeTabId) || null;
    }
    return null;
  }

  get allTabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  // Tab management methods
  createTab(input?: string | CreateTabOptions): Tab {
    const options = this.normalizeCreateTabOptions(input);
    const tabId = `tab-${++this.tabCounter}`;
    const tab = new Tab(tabId, {
      kind: options.kind,
      url: options.url,
      isAgentControlled: options.isAgentControlled,
    });

    // Add the tab's WebContentsView to the window
    this._baseWindow.contentView.addChildView(tab.view);

    tab.view.setBounds(
      getTabBounds(this._baseWindow.getBounds(), this._sideBar.getIsVisible()),
    );

    // Store the tab
    this.tabsMap.set(tabId, tab);

    if (tab.isNewTab) {
      this._sideBar.client.attachChatTab(tab, options.sessionId);
    }

    // Handle view swap when newtab transitions to web mode
    tab.onViewSwapped = (oldView, newView) => {
      this._baseWindow.contentView.removeChildView(oldView);
      this._baseWindow.contentView.addChildView(newView);

      this._sideBar.client.detachChatTab(tab.id, oldView.webContents);

      // Set up window open handler on the new web view
      newView.webContents.setWindowOpenHandler((details) => {
        this.createTab(details.url);
        return { action: "deny" };
      });
    };

    // Open links that would create new windows in a new Blueberry tab instead
    tab.webContents.setWindowOpenHandler((details) => {
      this.createTab(details.url);
      return { action: "deny" };
    });

    if (options.activate ?? true) {
      this.switchActiveTab(tabId);
    } else {
      tab.hide();
    }

    return tab;
  }

  closeTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    if (tab.isNewTab) {
      this._sideBar.client.detachChatTab(tab.id, tab.webContents);
    }

    // Remove the WebContentsView from the window
    this._baseWindow.contentView.removeChildView(tab.view);

    // Destroy the tab
    tab.destroy();

    // Remove from our tabs map
    this.tabsMap.delete(tabId);
    this._sideBar.client.onTabClosed(tabId);

    // If this was the active tab, switch to another tab
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      const remainingTabs = Array.from(this.tabsMap.keys());
      if (remainingTabs.length > 0) {
        this.switchActiveTab(remainingTabs[0]);
      }
    }

    // If no tabs left, close the window
    if (this.tabsMap.size === 0) {
      this._baseWindow.close();
    }

    return true;
  }

  switchActiveTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    // Hide the currently active tab
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabsMap.get(this.activeTabId);
      if (currentTab) {
        currentTab.hide();
      }
    }

    // Show the new active tab
    tab.show();
    this.activeTabId = tabId;

    // Update the window title to match the tab title
    this.refreshWindowTitle();
    this._sideBar.client.handleTabActivated(tab);

    return true;
  }

  getTab(tabId: string): Tab | null {
    return this.tabsMap.get(tabId) || null;
  }

  // Window methods
  show(): void {
    this._baseWindow.show();
  }

  hide(): void {
    this._baseWindow.hide();
  }

  close(): void {
    this._baseWindow.close();
  }

  focus(): void {
    this._baseWindow.focus();
  }

  minimize(): void {
    this._baseWindow.minimize();
  }

  maximize(): void {
    this._baseWindow.maximize();
  }

  unmaximize(): void {
    this._baseWindow.unmaximize();
  }

  isMaximized(): boolean {
    return this._baseWindow.isMaximized();
  }

  setTitle(title: string): void {
    this._baseWindow.setTitle(title);
  }

  setBounds(bounds: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): void {
    this._baseWindow.setBounds(bounds);
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return this._baseWindow.getBounds();
  }

  // Handle window resize to update tab bounds
  private updateTabBounds(): void {
    const tabBounds = getTabBounds(
      this._baseWindow.getBounds(),
      this._sideBar.getIsVisible(),
    );

    this.tabsMap.forEach((tab) => {
      tab.view.setBounds(tabBounds);
    });
  }

  // Public method to update all bounds when sidebar is toggled
  updateAllBounds(): void {
    this.updateTabBounds();
    this._sideBar.updateBounds();
  }

  // Getter for sidebar to access from main process
  get sidebar(): SideBar {
    return this._sideBar;
  }

  // Getter for topBar to access from main process
  get topBar(): TopBar {
    return this._topBar;
  }

  // Getter for all tabs as array
  get tabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  // Getter for baseWindow to access from Menu
  get baseWindow(): BaseWindow {
    return this._baseWindow;
  }

  setTabAgentControlled(tabId: string, isAgentControlled: boolean): void {
    const tab = this.tabsMap.get(tabId);
    if (!tab) return;
    tab.setAgentControlled(isAgentControlled);
  }

  setTabTitle(tabId: string, title: string): void {
    const tab = this.tabsMap.get(tabId);
    if (!tab) return;
    tab.setTitle(title);
    if (this.activeTabId === tabId) {
      this.refreshWindowTitle();
    }
  }

  private refreshWindowTitle(): void {
    this._baseWindow.setTitle(this.activeTab?.title || DEFAULT_WINDOW_TITLE);
  }

  private normalizeCreateTabOptions(
    input?: string | CreateTabOptions,
  ): CreateTabOptions {
    if (typeof input === "string") {
      return {
        kind: "web",
        url: input,
        activate: true,
      };
    }

    return {
      kind: input?.kind ?? "chat",
      url: input?.url,
      isAgentControlled: input?.isAgentControlled ?? false,
      activate: input?.activate ?? true,
      sessionId: input?.sessionId,
    };
  }
}

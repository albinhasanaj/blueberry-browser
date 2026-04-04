import type { Tab } from "../Tab";
import type { Window } from "../Window";
import type { ChatSourcePage } from "../agent/types";

export class TabTracker {
  private _window: Window | null = null;
  currentWorkTabId: string | null = null;
  readonly agentTabIds = new Set<string>();

  get window(): Window | null {
    return this._window;
  }

  setWindow(window: Window): void {
    this._window = window;
  }

  getCurrentWorkTab(): Tab | null {
    if (!this.currentWorkTabId) return null;
    return this._window?.getTab(this.currentWorkTabId) ?? null;
  }

  getCurrentWorkTabOrThrow(): Tab {
    const tab = this.getCurrentWorkTab();
    if (!tab) throw new Error("No work tab available");
    return tab;
  }

  openAgentTab(url?: string): Tab {
    if (!this._window) throw new Error("No window available");

    const tab = this._window.createTab({
      kind: "web",
      url,
      activate: false,
      isAgentControlled: true,
    });
    this.markAsAgentControlled(tab.id);
    this.currentWorkTabId = tab.id;
    return tab;
  }

  markAsAgentControlled(tabId: string): void {
    this.agentTabIds.add(tabId);
    this._window?.setTabAgentControlled(tabId, true);
  }

  handleTabClosed(
    tabId: string,
    sourcePage: ChatSourcePage | null,
  ): ChatSourcePage | null {
    const hadAgentTab = this.agentTabIds.delete(tabId);
    if (hadAgentTab) {
      this._window?.setTabAgentControlled(tabId, false);
    }

    let updatedSourcePage = sourcePage;
    if (sourcePage?.tabId === tabId) {
      updatedSourcePage = { ...sourcePage, tabId: null };
    }

    if (this.currentWorkTabId === tabId) {
      this.currentWorkTabId =
        this.getLastTrackedAgentTabId() ?? updatedSourcePage?.tabId ?? null;
    }

    return updatedSourcePage;
  }

  getLastTrackedAgentTabId(): string | null {
    const ids = Array.from(this.agentTabIds);
    for (let i = ids.length - 1; i >= 0; i--) {
      if (this._window?.getTab(ids[i])) return ids[i];
    }
    return null;
  }

  clearAll(): void {
    for (const tabId of this.agentTabIds) {
      this._window?.setTabAgentControlled(tabId, false);
    }
    this.agentTabIds.clear();
    this.currentWorkTabId = null;
  }
}

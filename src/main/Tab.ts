import { NativeImage, WebContents, WebContentsView } from "electron";
import { is } from "@electron-toolkit/utils";
import { join } from "path";
import { serializePageScript, type PageScript } from "./pageScripts";

export const NEWTAB_URL = "blueberry://newtab";
export type TabKind = "chat" | "web";

export interface TabOptions {
  kind?: TabKind;
  url?: string;
  isAgentControlled?: boolean;
}

export class Tab {
  private webContentsView: WebContentsView;
  private _id: string;
  private _title: string;
  private _url: string;
  private _isVisible: boolean = false;
  private _kind: TabKind;
  private _isAgentControlled: boolean;

  /**
   * Callback invoked when the internal WebContentsView is swapped
   * (newtab → web transition). The parent Window uses this to update
   * its contentView hierarchy.
   */
  onViewSwapped?: (oldView: WebContentsView, newView: WebContentsView) => void;

  constructor(id: string, options: TabOptions = {}) {
    this._id = id;
    this._kind = options.kind ?? (options.url ? "web" : "chat");
    this._isAgentControlled = options.isAgentControlled ?? false;
    this._url = this._kind === "chat" ? NEWTAB_URL : (options.url ?? "about:blank");
    this._title = this._kind === "chat" ? "Untitled" : "New Tab";

    if (this._kind === "chat") {
      // Chat-tab mode: preload with chat IPC access
      this.webContentsView = new WebContentsView({
        webPreferences: {
          preload: join(__dirname, "../preload/newtab.js"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false, // Required for preload
        },
      });
      this.loadNewtabRenderer();
    } else {
      // Web mode: fully sandboxed, no preload
      this.webContentsView = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      this.loadURL(options.url ?? "about:blank");
    }

    this.setupEventListeners();
  }

  private loadNewtabRenderer(): void {
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      const newtabUrl = new URL(
        "/newtab/",
        process.env["ELECTRON_RENDERER_URL"],
      );
      this.webContentsView.webContents.loadURL(newtabUrl.toString());
    } else {
      this.webContentsView.webContents.loadFile(
        join(__dirname, "../renderer/newtab.html"),
      );
    }
  }

  /**
   * Transition from newtab to web mode. Destroys the preloaded newtab view
   * and creates a sandboxed web view, then loads the URL.
   */
  private transitionToWebMode(url: string): void {
    const oldView = this.webContentsView;

    // Create sandboxed web view
    this.webContentsView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    this._kind = "web";
    this._isAgentControlled = false;
    this.setupEventListeners();

    // Preserve bounds from old view
    const bounds = oldView.getBounds();
    this.webContentsView.setBounds(bounds);

    // Notify parent to swap views
    this.onViewSwapped?.(oldView, this.webContentsView);

    // Destroy old newtab view
    oldView.webContents.close();

    // Load the URL in the new view
    this._url = url;
    this.webContentsView.webContents.loadURL(url);
  }

  private setupEventListeners(): void {
    this.webContentsView.webContents.on("page-title-updated", (_, title) => {
      if (this._kind === "chat") return;
      this._title = title;
    });

    this.webContentsView.webContents.on("did-navigate", (_, url) => {
      if (this._kind === "chat") return;
      this._url = url;
    });

    this.webContentsView.webContents.on("did-navigate-in-page", (_, url) => {
      if (this._kind === "chat") return;
      this._url = url;
    });
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get url(): string {
    return this._url;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get kind(): TabKind {
    return this._kind;
  }

  get isNewTab(): boolean {
    return this._kind === "chat";
  }

  get isAgentControlled(): boolean {
    return this._isAgentControlled;
  }

  get webContents(): WebContents {
    return this.webContentsView.webContents;
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  // Public methods
  show(): void {
    this._isVisible = true;
    this.webContentsView.setVisible(true);
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView.setVisible(false);
  }

  async screenshot(): Promise<NativeImage> {
    return await this.webContentsView.webContents.capturePage();
  }

  async runJs<TResult = unknown>(code: string): Promise<TResult> {
    return (await this.webContentsView.webContents.executeJavaScript(
      code,
    )) as TResult;
  }

  async runPageScript<TArgs, TResult>(
    script: PageScript<TArgs, TResult>,
    args: TArgs,
  ): Promise<TResult> {
    return await this.runJs<TResult>(serializePageScript(script, args));
  }

  async getTabHtml(): Promise<string> {
    return await this.runJs("document.documentElement.outerHTML");
  }

  async getTabText(): Promise<string> {
    return await this.runJs("document.documentElement.innerText");
  }

  loadURL(url: string): Promise<void> {
    if (this._kind === "chat") {
      // Transition from newtab to web mode
      this.transitionToWebMode(url);
      return Promise.resolve();
    }
    this._url = url;
    return this.webContentsView.webContents.loadURL(url);
  }

  goBack(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoBack()) {
      this.webContentsView.webContents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoForward()) {
      this.webContentsView.webContents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.webContentsView.webContents.reload();
  }

  stop(): void {
    this.webContentsView.webContents.stop();
  }

  setTitle(title: string): void {
    this._title = title;
  }

  setAgentControlled(isAgentControlled: boolean): void {
    this._isAgentControlled = isAgentControlled;
  }

  destroy(): void {
    this.webContentsView.webContents.close();
  }
}

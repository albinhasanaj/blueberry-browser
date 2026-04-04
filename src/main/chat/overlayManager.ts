import type { WebContents } from "electron";
import { removeOverlay } from "../agent/pageOverlay";

export class OverlayManager {
  private handlers = new Map<WebContents, (...args: unknown[]) => void>();

  setupStopHandler(wc: WebContents, onStop: () => void): void {
    if (this.handlers.has(wc)) return;

    // Electron ≥33 passes an Event<{message}> as the first arg.
    // Using a single-param handler avoids the deprecated positional-args path.
    const handler = (details: Electron.Event & { message?: string }): void => {
      if (details?.message === "__BB_STOP__") onStop();
    };

    this.handlers.set(wc, handler as never);
    (wc as Electron.WebContents).on("console-message" as never, handler as never);
    wc.once("destroyed", () => {
      this.handlers.delete(wc);
    });
  }

  cleanup(): void {
    for (const [wc, handler] of this.handlers) {
      removeOverlay(wc).catch(() => {});
      try {
        wc.removeListener("console-message", handler as never);
      } catch {
        // webContents may already be destroyed
      }
    }
    this.handlers.clear();
  }
}

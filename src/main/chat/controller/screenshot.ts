import type { Tab } from "../../Tab";
import { SCREENSHOT_JPEG_QUALITY } from "../../agent/types";

export async function captureTabScreenshot(
  tab: Tab | null,
): Promise<string | null> {
  if (!tab || tab.isNewTab) return null;

  try {
    const image = await tab.screenshot();
    const jpegBuffer = image.toJPEG(SCREENSHOT_JPEG_QUALITY);
    return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("display surface")) {
      console.warn("[screenshot] Display surface unavailable -- skipping");
    } else {
      console.error("Failed to capture screenshot:", error);
    }

    return null;
  }
}

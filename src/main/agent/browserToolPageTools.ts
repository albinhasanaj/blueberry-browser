import type { BrowserToolContext } from "./browserToolRuntime";
import { createPageInteractionTools as createInteractionTools } from "./browserToolPageInteractionTools";
import { createPageReadTools } from "./browserToolPageReadTools";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createPageInteractionTools(context: BrowserToolContext) {
  return {
    ...createPageReadTools(context),
    ...createInteractionTools(context),
  };
}

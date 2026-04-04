/// <reference lib="dom" />

export interface TypeIntoElementArgs {
  selector: string;
  text: string;
}

export type TypeIntoElementResult =
  | {
      ok: true;
      tag: string;
    }
  | {
      ok: false;
      error: string;
    };

export function typeIntoElementScript({
  selector,
  text,
}: TypeIntoElementArgs): TypeIntoElementResult {
  // Shadow DOM-piercing querySelector
  function deepQS(sel: string, root: ParentNode = document): Element | null {
    const found = root.querySelector(sel);
    if (found) return found;
    const elems = root.querySelectorAll("*");
    for (const el of elems) {
      if (el.shadowRoot) {
        const match = deepQS(sel, el.shadowRoot);
        if (match) return match;
      }
    }
    return null;
  }

  const el = deepQS(selector);
  if (!el) {
    return { ok: false, error: `Element not found: ${selector}` };
  }

  el.scrollIntoView({ block: "center", behavior: "instant" });
  (el as HTMLElement).focus();

  // Use the native setter to bypass React's synthetic value tracking.
  const nativeSetter =
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
      ?.set ||
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;

  if (nativeSetter) {
    nativeSetter.call(el, text);
  } else {
    (el as HTMLInputElement | HTMLTextAreaElement).value = text;
  }

  el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));

  return { ok: true, tag: el.tagName.toLowerCase() };
}

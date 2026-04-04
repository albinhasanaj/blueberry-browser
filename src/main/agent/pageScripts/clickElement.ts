/// <reference lib="dom" />

export interface ClickElementArgs {
  selector: string;
}

export type ClickElementResult =
  | {
      ok: true;
      tag: string;
      text: string;
    }
  | {
      ok: false;
      error: string;
    };

export function clickElementScript({
  selector,
}: ClickElementArgs): ClickElementResult {
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

  // Dispatch a full click sequence so sites listening below `click` still react.
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const shared = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  };

  el.dispatchEvent(
    new PointerEvent("pointerdown", { ...shared, pointerId: 1 }),
  );
  el.dispatchEvent(new MouseEvent("mousedown", shared));
  el.dispatchEvent(new PointerEvent("pointerup", { ...shared, pointerId: 1 }));
  el.dispatchEvent(new MouseEvent("mouseup", shared));
  el.dispatchEvent(new MouseEvent("click", shared));

  if (typeof (el as HTMLElement).focus === "function") {
    (el as HTMLElement).focus();
  }

  return {
    ok: true,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || "").slice(0, 100),
  };
}

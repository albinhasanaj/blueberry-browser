/// <reference lib="dom" />

export interface ExtractElementsArgs {
  selector: string;
  attribute: string;
}

export type ExtractElementsResult =
  | {
      ok: true;
      count: number;
      values: string[];
    }
  | {
      ok: false;
      error: string;
    };

export function extractElementsScript({
  selector,
  attribute,
}: ExtractElementsArgs): ExtractElementsResult {
  // Shadow DOM-piercing querySelectorAll
  function deepQSA(sel: string, root: ParentNode = document): Element[] {
    const results: Element[] = Array.from(root.querySelectorAll(sel));
    const elems = root.querySelectorAll("*");
    for (const el of elems) {
      if (el.shadowRoot) {
        const sr = el.shadowRoot as ParentNode;
        results.push(...sr.querySelectorAll(sel));
        const nested = deepQSA(sel, sr);
        for (const n of nested) {
          if (!results.includes(n)) results.push(n);
        }
      }
    }
    return results;
  }

  const els = deepQSA(selector);
  if (els.length === 0) {
    return { ok: false, error: `No elements found matching: ${selector}` };
  }

  const values = Array.from(els, (el) => {
    if (attribute === "text") return (el as HTMLElement).innerText || "";
    if (attribute === "html") return el.innerHTML || "";
    return el.getAttribute(attribute) || "";
  });

  return { ok: true, count: els.length, values };
}

/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars, no-undef */
function click(ref) {
  var el = getEl(ref);
  if (!el) {
    return {
      ok: false,
      error: "Element ref=" + ref + " not found or removed from page",
    };
  }

  el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });

  var rect = el.getBoundingClientRect();
  var x = rect.left + rect.width / 2;
  var y = rect.top + rect.height / 2;
  var opts = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  };

  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new PointerEvent("pointerup", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.dispatchEvent(new MouseEvent("click", opts));

  if (typeof el.focus === "function") el.focus();

  var tag = el.tagName.toLowerCase();
  var text = (el.innerText || el.textContent || "").trim().substring(0, 60);
  return { ok: true, tag: tag, text: text };
}

function type(ref, text) {
  var el = getEl(ref);
  if (!el) {
    return {
      ok: false,
      error: "Element ref=" + ref + " not found or removed from page",
    };
  }

  var tag = el.tagName.toLowerCase();
  if (!isEditable(el)) {
    return {
      ok: false,
      error:
        "Element ref=" +
        ref +
        " is a <" +
        tag +
        ">, not a typeable field. Use find or read_page to locate an input element.",
    };
  }

  el.scrollIntoView({ behavior: "instant", block: "center" });
  if (typeof el.focus === "function") el.focus();
  el.dispatchEvent(new Event("focus", { bubbles: true }));

  var proto = Object.getPrototypeOf(el);
  var setter = Object.getOwnPropertyDescriptor(proto, "value");
  if (!setter) {
    setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
  }
  if (!setter) {
    setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    );
  }

  if (setter && setter.set) {
    setter.set.call(el, text);
  } else {
    el.value = text;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  return { ok: true, tag: tag, value: el.value };
}

function focusForTyping(ref) {
  var el = getEl(ref);
  if (!el) {
    return {
      ok: false,
      error: "Element ref=" + ref + " not found or removed from page",
    };
  }

  var tag = el.tagName.toLowerCase();
  if (!isEditable(el)) {
    return {
      ok: false,
      error:
        "Element ref=" + ref + " is a <" + tag + ">, not a typeable field.",
    };
  }

  el.scrollIntoView({ behavior: "instant", block: "center" });
  if (typeof el.focus === "function") el.focus();
  el.dispatchEvent(new Event("focus", { bubbles: true }));
  if (el.value !== undefined) el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return { ok: true, tag: tag };
}

function focusBySelector(selector) {
  var el = deepQS(selector);
  if (!el) {
    return {
      ok: false,
      error: "No element found for selector: " + selector,
    };
  }

  var ref = register(el);
  return focusForTyping(ref);
}

function clickBySelector(selector) {
  var el = deepQS(selector);
  if (!el) {
    return {
      ok: false,
      error: "No element found for selector: " + selector,
    };
  }

  var ref = register(el);
  return click(ref);
}

function typeBySelector(selector, text) {
  var el = deepQS(selector);
  if (!el) {
    return {
      ok: false,
      error: "No element found for selector: " + selector,
    };
  }

  var ref = register(el);
  return type(ref, text);
}

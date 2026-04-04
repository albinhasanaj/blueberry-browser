(function () {
  if (window.__blueberry) return;

  // ---- Element registry ------------------------------------------------
  var registry = new Map();
  var nextRef = 1;

  function register(el) {
    for (var entry of registry) {
      if (entry[1] === el) return entry[0];
    }
    var ref = nextRef++;
    registry.set(ref, el);
    return ref;
  }

  function getEl(ref) {
    var el = registry.get(ref);
    if (!el || !el.isConnected) {
      registry.delete(ref);
      return null;
    }
    return el;
  }

  function clearRegistry() {
    registry.clear();
    nextRef = 1;
  }

  // ---- Shadow DOM-piercing queries ------------------------------------
  function deepQS(selector, root) {
    root = root || document;
    try {
      var found = root.querySelector(selector);
      if (found) return found;
    } catch (e) {
      return null;
    }
    var all = root.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) {
        var match = deepQS(selector, all[i].shadowRoot);
        if (match) return match;
      }
    }
    return null;
  }

  function deepQSA(selector, root) {
    root = root || document;
    var results = [];
    try {
      var found = root.querySelectorAll(selector);
      for (var i = 0; i < found.length; i++) results.push(found[i]);
    } catch (e) {
      /* ignore bad selectors */
    }
    var all = root.querySelectorAll("*");
    for (var j = 0; j < all.length; j++) {
      if (all[j].shadowRoot) {
        var nested = deepQSA(selector, all[j].shadowRoot);
        for (var k = 0; k < nested.length; k++) {
          if (results.indexOf(nested[k]) === -1) results.push(nested[k]);
        }
      }
    }
    return results;
  }

  function walkAll(root, visitor) {
    root = root || document;
    var all = root.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      visitor(all[i]);
      if (all[i].shadowRoot) {
        walkAll(all[i].shadowRoot, visitor);
      }
    }
  }

  // ---- Describe an element for the model ------------------------------
  function describeEl(el) {
    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute("role") || "";
    var ariaLabel = el.getAttribute("aria-label") || "";
    var placeholder = el.getAttribute("placeholder") || "";
    var type = el.getAttribute("type") || "";
    var name = el.getAttribute("name") || "";
    var id = el.id || "";
    var text = (el.innerText || el.textContent || "").trim().substring(0, 80);
    var value =
      el.value !== undefined ? String(el.value).substring(0, 40) : "";
    var href = el.getAttribute("href") || "";
    var src = el.getAttribute("src") || "";

    var parts = [tag.toUpperCase()];
    if (role) parts.push('role="' + role + '"');
    if (type && type !== "text") parts.push('type="' + type + '"');
    if (id) parts.push('id="' + id + '"');
    if (name) parts.push('name="' + name + '"');
    if (ariaLabel) parts.push('"' + ariaLabel + '"');
    else if (placeholder) parts.push('placeholder="' + placeholder + '"');
    else if (text) parts.push('"' + text + '"');
    if (value) parts.push('value="' + value + '"');
    if (href) parts.push('href="' + href.substring(0, 80) + '"');
    if (src) parts.push('src="' + src.substring(0, 60) + '"');

    return parts.join(" ");
  }

  // ---- Read page -------------------------------------------------------
  function readPage() {
    clearRegistry();

    var interactiveSelectors = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "[role=button]",
      "[role=link]",
      "[role=tab]",
      "[role=menuitem]",
      "[role=checkbox]",
      "[role=radio]",
      "[role=switch]",
      "[role=searchbox]",
      "[role=textbox]",
      "[role=combobox]",
      "[contenteditable=true]",
      "[tabindex]",
      "summary",
      "details",
    ];

    var interactive = [];
    var seen = new Set();

    for (var s = 0; s < interactiveSelectors.length; s++) {
      var els = deepQSA(interactiveSelectors[s]);
      for (var i = 0; i < els.length; i++) {
        if (seen.has(els[i])) continue;
        seen.add(els[i]);

        var rect = els[i].getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        var style = window.getComputedStyle(els[i]);
        if (style.display === "none" || style.visibility === "hidden") continue;

        var ref = register(els[i]);
        interactive.push("[ref=" + ref + "] " + describeEl(els[i]));
        if (interactive.length >= 150) break;
      }
      if (interactive.length >= 150) break;
    }

    var headings = [];
    var hEls = deepQSA("h1, h2, h3, h4");
    for (var h = 0; h < hEls.length && h < 30; h++) {
      var level = hEls[h].tagName[1];
      var hText = (hEls[h].innerText || "").trim().substring(0, 100);
      if (hText) headings.push("H" + level + ": " + hText);
    }

    var forms = [];
    var formEls = deepQSA("form");
    for (var f = 0; f < formEls.length && f < 10; f++) {
      var formId =
        formEls[f].id ||
        formEls[f].getAttribute("name") ||
        "form-" + (f + 1);
      var inputs = formEls[f].querySelectorAll("input, textarea, select");
      forms.push("FORM#" + formId + " (" + inputs.length + " fields)");
    }

    var output = [];
    output.push("# Page: " + document.title);
    output.push("URL: " + location.href);
    output.push("");

    if (headings.length > 0) {
      output.push("## Page Structure");
      for (var hi = 0; hi < headings.length; hi++) output.push(headings[hi]);
      output.push("");
    }

    if (forms.length > 0) {
      output.push("## Forms");
      for (var fi = 0; fi < forms.length; fi++) output.push(forms[fi]);
      output.push("");
    }

    output.push("## Interactive Elements (" + interactive.length + ")");
    for (var ii = 0; ii < interactive.length; ii++) output.push(interactive[ii]);

    return output.join("\n");
  }

  // ---- Find elements ---------------------------------------------------
  function find(query) {
    var results = [];

    if (query.css) {
      var cssEls = deepQSA(query.css);
      for (var i = 0; i < cssEls.length && i < 20; i++) {
        var ref = register(cssEls[i]);
        results.push({ ref: ref, description: describeEl(cssEls[i]) });
      }
    }

    if (query.text) {
      var searchText = query.text.toLowerCase();
      walkAll(document, function (el) {
        if (results.length >= 20) return;
        var t = (el.innerText || el.textContent || "").trim().toLowerCase();
        if (t.includes(searchText) && t.length < 200) {
          var ref = register(el);
          results.push({ ref: ref, description: describeEl(el) });
        }
      });
    }

    if (query.ariaLabel) {
      var labelText = query.ariaLabel.toLowerCase();
      walkAll(document, function (el) {
        if (results.length >= 20) return;
        var label = (el.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes(labelText)) {
          var ref = register(el);
          results.push({ ref: ref, description: describeEl(el) });
        }
      });
    }

    if (query.role) {
      var roleEls = deepQSA('[role="' + query.role + '"]');
      for (var r = 0; r < roleEls.length && results.length < 20; r++) {
        var rRef = register(roleEls[r]);
        results.push({ ref: rRef, description: describeEl(roleEls[r]) });
      }
    }

    if (query.placeholder) {
      var phText = query.placeholder.toLowerCase();
      var phEls = deepQSA("input, textarea");
      for (var p = 0; p < phEls.length && results.length < 20; p++) {
        var ph = (phEls[p].getAttribute("placeholder") || "").toLowerCase();
        if (ph.includes(phText)) {
          var pRef = register(phEls[p]);
          results.push({ ref: pRef, description: describeEl(phEls[p]) });
        }
      }
    }

    var uniqueRefs = new Set();
    var unique = [];
    for (var u = 0; u < results.length; u++) {
      if (!uniqueRefs.has(results[u].ref)) {
        uniqueRefs.add(results[u].ref);
        unique.push(results[u]);
      }
    }

    return unique;
  }

  // ---- Click -----------------------------------------------------------
  function click(ref) {
    var el = getEl(ref);
    if (!el)
      return {
        ok: false,
        error: "Element ref=" + ref + " not found or removed from page",
      };

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

  // ---- Type ------------------------------------------------------------
  function isEditable(el) {
    var tag = el.tagName.toLowerCase();
    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      el.getAttribute("contenteditable") === "true" ||
      el.getAttribute("role") === "textbox" ||
      el.getAttribute("role") === "searchbox" ||
      el.getAttribute("role") === "combobox"
    );
  }

  function type(ref, text) {
    var el = getEl(ref);
    if (!el)
      return {
        ok: false,
        error: "Element ref=" + ref + " not found or removed from page",
      };

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
    if (!setter)
      setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      );
    if (!setter)
      setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      );

    if (setter && setter.set) {
      setter.set.call(el, text);
    } else {
      el.value = text;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    return { ok: true, tag: tag, value: el.value };
  }

  // ---- Focus for Electron keyboard input ----
  function focusForTyping(ref) {
    var el = getEl(ref);
    if (!el)
      return {
        ok: false,
        error: "Element ref=" + ref + " not found or removed from page",
      };

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
    if (!el)
      return {
        ok: false,
        error: "No element found for selector: " + selector,
      };
    var ref = register(el);
    return focusForTyping(ref);
  }

  // ---- Selector fallbacks ----
  function clickBySelector(selector) {
    var el = deepQS(selector);
    if (!el)
      return {
        ok: false,
        error: "No element found for selector: " + selector,
      };
    var ref = register(el);
    return click(ref);
  }

  function typeBySelector(selector, text) {
    var el = deepQS(selector);
    if (!el)
      return {
        ok: false,
        error: "No element found for selector: " + selector,
      };
    var ref = register(el);
    return type(ref, text);
  }

  // ---- Get page text ---------------------------------------------------
  function getPageText(maxLen) {
    maxLen = maxLen || 8000;
    var text = (document.body.innerText || "").trim();
    if (text.length > maxLen) text = text.substring(0, maxLen) + "...";
    return text;
  }

  // ---- Public API -------------------------------------------------------
  window.__blueberry = {
    readPage: readPage,
    find: find,
    click: click,
    type: type,
    clickBySelector: clickBySelector,
    typeBySelector: typeBySelector,
    focusForTyping: focusForTyping,
    focusBySelector: focusBySelector,
    getPageText: getPageText,
    getEl: getEl,
    register: register,
    clearRegistry: clearRegistry,
    deepQS: deepQS,
    deepQSA: deepQSA,
  };
})();

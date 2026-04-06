/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars */
function deepQS(selector, root) {
  root = root || document;

  try {
    var found = root.querySelector(selector);
    if (found) return found;
  } catch (error) {
    return null;
  }

  var all = root.querySelectorAll("*");
  for (var i = 0; i < all.length; i++) {
    if (!all[i].shadowRoot) continue;

    var match = deepQS(selector, all[i].shadowRoot);
    if (match) return match;
  }

  return null;
}

function deepQSA(selector, root) {
  root = root || document;

  var results = [];
  try {
    var found = root.querySelectorAll(selector);
    for (var i = 0; i < found.length; i++) results.push(found[i]);
  } catch (error) {
    /* ignore bad selectors */
  }

  var all = root.querySelectorAll("*");
  for (var j = 0; j < all.length; j++) {
    if (!all[j].shadowRoot) continue;

    var nested = deepQSA(selector, all[j].shadowRoot);
    for (var k = 0; k < nested.length; k++) {
      if (results.indexOf(nested[k]) === -1) {
        results.push(nested[k]);
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

function describeEl(el) {
  var tag = el.tagName.toLowerCase();
  var role = el.getAttribute("role") || "";
  var ariaLabel = el.getAttribute("aria-label") || "";
  var placeholder = el.getAttribute("placeholder") || "";
  var type = el.getAttribute("type") || "";
  var name = el.getAttribute("name") || "";
  var id = el.id || "";
  var text = (el.innerText || el.textContent || "").trim().substring(0, 80);
  var value = el.value !== undefined ? String(el.value).substring(0, 40) : "";
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

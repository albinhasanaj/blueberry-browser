/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars, no-undef */
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
      var text = (el.innerText || el.textContent || "").trim().toLowerCase();
      if (text.includes(searchText) && text.length < 200) {
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
      var roleRef = register(roleEls[r]);
      results.push({ ref: roleRef, description: describeEl(roleEls[r]) });
    }
  }

  if (query.placeholder) {
    var placeholderText = query.placeholder.toLowerCase();
    var placeholderEls = deepQSA("input, textarea");
    for (var p = 0; p < placeholderEls.length && results.length < 20; p++) {
      var placeholder = (
        placeholderEls[p].getAttribute("placeholder") || ""
      ).toLowerCase();
      if (placeholder.includes(placeholderText)) {
        var placeholderRef = register(placeholderEls[p]);
        results.push({
          ref: placeholderRef,
          description: describeEl(placeholderEls[p]),
        });
      }
    }
  }

  var uniqueRefs = new Set();
  var unique = [];
  for (var u = 0; u < results.length; u++) {
    if (uniqueRefs.has(results[u].ref)) continue;

    uniqueRefs.add(results[u].ref);
    unique.push(results[u]);
  }

  return unique;
}

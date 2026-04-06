/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars, no-undef */
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
  var headingElements = deepQSA("h1, h2, h3, h4");
  for (var h = 0; h < headingElements.length && h < 30; h++) {
    var level = headingElements[h].tagName[1];
    var headingText = (headingElements[h].innerText || "")
      .trim()
      .substring(0, 100);
    if (headingText) headings.push("H" + level + ": " + headingText);
  }

  var forms = [];
  var formElements = deepQSA("form");
  for (var f = 0; f < formElements.length && f < 10; f++) {
    var formId =
      formElements[f].id ||
      formElements[f].getAttribute("name") ||
      "form-" + (f + 1);
    var inputs = formElements[f].querySelectorAll("input, textarea, select");
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

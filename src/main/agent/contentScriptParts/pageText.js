/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars */
function getPageText(maxLen) {
  maxLen = maxLen || 16000;

  var contentRoot =
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.querySelector('[role="main"]') ||
    document.querySelector("#content") ||
    document.querySelector(".content") ||
    document.body;

  var clone = contentRoot.cloneNode(true);

  var noiseSelectors = [
    "nav",
    "footer",
    "header",
    "aside",
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    ".cookie-banner",
    ".cookie-consent",
    "#cookie-banner",
    ".sidebar",
    ".ad",
    ".advertisement",
    ".social-share",
    "script",
    "style",
    "noscript",
    "iframe",
    '[aria-hidden="true"]',
  ];

  for (var n = 0; n < noiseSelectors.length; n++) {
    var noisy = clone.querySelectorAll(noiseSelectors[n]);
    for (var ni = 0; ni < noisy.length; ni++) {
      if (noisy[ni].parentNode) noisy[ni].parentNode.removeChild(noisy[ni]);
    }
  }

  var output = [];
  output.push("# " + document.title);
  output.push("URL: " + location.href);
  output.push("");

  function extractText(node) {
    if (!node) return;

    var children = node.childNodes;
    for (var ci = 0; ci < children.length; ci++) {
      var child = children[ci];

      if (child.nodeType === 3) {
        var text = child.textContent.trim();
        if (text) output.push(text);
        continue;
      }

      if (child.nodeType !== 1) continue;

      var tag = child.tagName;
      if (
        tag === "H1" ||
        tag === "H2" ||
        tag === "H3" ||
        tag === "H4" ||
        tag === "H5" ||
        tag === "H6"
      ) {
        var level = tag[1];
        var headingText = (child.innerText || "").trim();
        if (headingText) {
          output.push("\n" + "#".repeat(Number(level)) + " " + headingText);
        }
        continue;
      }

      if (tag === "LI") {
        var itemText = (child.innerText || "").trim();
        if (itemText) output.push("- " + itemText.substring(0, 200));
        continue;
      }

      if (tag === "TR") {
        var cells = child.querySelectorAll("td, th");
        var row = [];
        for (var ri = 0; ri < cells.length; ri++) {
          row.push((cells[ri].innerText || "").trim().substring(0, 100));
        }
        if (row.length > 0) output.push("| " + row.join(" | ") + " |");
        continue;
      }

      if (tag === "A") {
        var linkText = (child.innerText || "").trim();
        var href = child.getAttribute("href") || "";
        if (linkText && href) {
          output.push(
            "[" +
              linkText.substring(0, 80) +
              "](" +
              href.substring(0, 120) +
              ")",
          );
        } else if (linkText) {
          output.push(linkText);
        }
        continue;
      }

      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
        continue;
      }

      extractText(child);
    }
  }

  extractText(clone);

  var text = output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > maxLen) {
    text = text.substring(0, maxLen) + "\n\n... (truncated)";
  }
  return text;
}

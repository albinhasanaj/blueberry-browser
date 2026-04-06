import type { WebContents } from "electron";

// Element IDs
const STYLE_ID = "__bb_ov_s";
const OUTLINE_ID = "__bb_ov_o";
const ISLAND_ID = "__bb_ov_i";

// ---------------------------------------------------------------------------
// Keyframe CSS for the glow border (injected into page <head>)
// ---------------------------------------------------------------------------
const OUTLINE_CSS = `
@keyframes __bb_glow{
  0%,100%{box-shadow:0 0 8px 2px rgba(91,125,177,0.5),0 0 20px 4px rgba(91,125,177,0.15),inset 0 0 8px 2px rgba(91,125,177,0.5),inset 0 0 20px 4px rgba(91,125,177,0.15)}
  50%{box-shadow:0 0 14px 4px rgba(91,125,177,0.7),0 0 30px 8px rgba(91,125,177,0.25),inset 0 0 14px 4px rgba(91,125,177,0.7),inset 0 0 30px 8px rgba(91,125,177,0.25)}
}`;

// ---------------------------------------------------------------------------
// Full CSS for the island's Shadow DOM — completely isolated from the page.
// ---------------------------------------------------------------------------
const SHADOW_CSS = `
:host{
  position:fixed!important;bottom:16px!important;left:50%!important;
  transform:translateX(-50%)!important;z-index:2147483647!important;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif!important;
  pointer-events:auto!important;display:block!important;
  visibility:visible!important;opacity:1!important;
  animation:bb-fadein .3s ease-out;
}
@keyframes bb-fadein{
  from{opacity:0;transform:translateX(-50%) translateY(16px)}
  to{opacity:1;transform:translateX(-50%) translateY(0)}
}
@keyframes bb-pulse{
  0%,100%{opacity:1}50%{opacity:.35}
}
*{margin:0;padding:0;box-sizing:border-box}
.card{
  border-radius:14px;overflow:hidden;
  box-shadow:0 8px 32px rgba(0,0,0,.45),0 0 0 1px rgba(91,125,177,.25);
  min-width:340px;max-width:540px;
}
.hdr{
  background:rgba(91,125,177,.9);padding:8px 14px;
  display:flex;align-items:center;gap:8px;
}
.hdr-icon{font-size:14px;line-height:1}
.hdr-text{
  color:rgba(255,255,255,.95);font-size:12px;font-weight:600;
  flex:1;line-height:1.3;letter-spacing:.01em;
}
.body{
  background:#1a202c;padding:10px 14px;
  display:flex;align-items:center;gap:10px;
}
.dot{
  width:14px;height:14px;min-width:14px;border-radius:50%;
  background:#5B7DB1;flex-shrink:0;
  animation:bb-pulse 1.5s ease-in-out infinite;
}
.action{
  color:rgba(255,255,255,.92);font-size:13px;font-weight:400;
  flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  line-height:1.3;max-width:280px;
}
.btn{
  padding:5px 14px;border-radius:8px;font-size:12px;font-weight:500;
  cursor:pointer;border:none;white-space:nowrap;line-height:1.3;
  display:inline-flex;align-items:center;
  transition:opacity .15s ease;
}
.btn:hover{opacity:.85}
.btn-tc{background:rgba(255,255,255,.92);color:#1a1a2e}
.btn-stop{background:#e53e3e;color:#fff}
`;

// ---------------------------------------------------------------------------
// Injection script — runs inside the target page
// ---------------------------------------------------------------------------

function buildInjectionScript(actionText: string, companionName = "Blueberry"): string {
  const textVal = JSON.stringify(actionText);
  const nameVal = JSON.stringify(`Controlled by ${companionName}`);
  const cssOutline = JSON.stringify(OUTLINE_CSS);
  const cssShadow = JSON.stringify(SHADOW_CSS);

  return `(function(){
try{
  // Remove previous overlay elements
  ['${STYLE_ID}','${OUTLINE_ID}','${ISLAND_ID}'].forEach(function(id){
    var e=document.getElementById(id);if(e)e.remove();
  });

  // ---- Glow border (page-level, pointer-events:none) ----
  var s=document.createElement('style');
  s.id='${STYLE_ID}';
  s.textContent=${cssOutline};
  (document.head||document.documentElement).appendChild(s);

  var o=document.createElement('div');
  o.id='${OUTLINE_ID}';
  o.setAttribute('style',
    'position:fixed;top:0;left:0;right:0;bottom:0;'+
    'width:100vw;height:100vh;pointer-events:none;'+
    'z-index:2147483646;border:2px solid rgba(91,125,177,0.7);'+
    'box-sizing:border-box;margin:0;padding:0;'+
    'animation:__bb_glow 2.5s ease-in-out infinite'
  );
  document.documentElement.appendChild(o);

  // ---- Floating island (Shadow DOM — fully isolated from page CSS) ----
  var host=document.createElement('div');
  host.id='${ISLAND_ID}';
  // The host needs minimal style just for positioning; the shadow handles the rest
  host.setAttribute('style',
    'all:initial!important;position:fixed!important;bottom:16px!important;'+
    'left:50%!important;transform:translateX(-50%)!important;'+
    'z-index:2147483647!important;display:block!important;'+
    'visibility:visible!important;opacity:1!important;'+
    'pointer-events:auto!important;width:auto!important;height:auto!important;'+
    'margin:0!important;padding:0!important;background:none!important;'+
    'border:none!important;font-size:initial!important;color:initial!important;'
  );
  document.documentElement.appendChild(host);

  var shadow=host.attachShadow({mode:'open'});
  var style=document.createElement('style');
  style.textContent=${cssShadow};
  shadow.appendChild(style);

  var card=document.createElement('div');
  card.className='card';

  // Header
  var hdr=document.createElement('div');
  hdr.className='hdr';
  var icon=document.createElement('span');
  icon.className='hdr-icon';
  icon.textContent='\\u{1FAD0}';
  var title=document.createElement('span');
  title.className='hdr-text';
  title.textContent=${nameVal};
  hdr.appendChild(icon);
  hdr.appendChild(title);
  card.appendChild(hdr);

  // Body
  var body=document.createElement('div');
  body.className='body';
  var dot=document.createElement('div');
  dot.className='dot';
  var act=document.createElement('span');
  act.className='action';
  act.id='__bb_action';
  act.textContent=${textVal};
  var tcBtn=document.createElement('button');
  tcBtn.className='btn btn-tc';
  tcBtn.textContent='Take control';
  tcBtn.onclick=function(){console.log('__BB_STOP__')};
  var stopBtn=document.createElement('button');
  stopBtn.className='btn btn-stop';
  stopBtn.textContent='Stop';
  stopBtn.onclick=function(){console.log('__BB_STOP__')};
  body.appendChild(dot);
  body.appendChild(act);
  body.appendChild(tcBtn);
  body.appendChild(stopBtn);
  card.appendChild(body);

  shadow.appendChild(card);
}catch(e){console.error('__BB_OVERLAY_ERR',e)}
})()`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Inject the blue outline + floating action island into the page. */
export async function injectOverlay(
  wc: WebContents,
  actionText: string,
  companionName?: string,
): Promise<void> {
  try {
    await wc.executeJavaScript(buildInjectionScript(actionText, companionName));
  } catch {
    // Page may not be ready or is navigating
  }
}

/**
 * Update the action text shown in the floating island.
 * Re-injects the full overlay if it was lost (e.g. after a page navigation).
 */
export async function updateOverlayAction(
  wc: WebContents,
  actionText: string,
  companionName?: string,
): Promise<void> {
  const textVal = JSON.stringify(actionText);
  try {
    // Check inside the shadow DOM for the action element
    const exists = await wc.executeJavaScript(
      `(function(){var h=document.getElementById('${ISLAND_ID}');return !!(h&&h.shadowRoot&&h.shadowRoot.getElementById('__bb_action'))})()`,
    );
    if (!exists) {
      await injectOverlay(wc, actionText, companionName);
      return;
    }
    // Update both the action text and the header name
    const nameVal = JSON.stringify(`Controlled by ${companionName ?? "Blueberry"}`);
    await wc.executeJavaScript(
      `(function(){var h=document.getElementById('${ISLAND_ID}');if(h&&h.shadowRoot){var a=h.shadowRoot.getElementById('__bb_action');if(a)a.textContent=${textVal};var t=h.shadowRoot.querySelector('.hdr-text');if(t)t.textContent=${nameVal}}})()`,
    );
  } catch {
    try {
      await injectOverlay(wc, actionText, companionName);
    } catch {
      // silent
    }
  }
}

/** Remove the overlay from the page (outline + island). */
export async function removeOverlay(wc: WebContents): Promise<void> {
  try {
    await wc.executeJavaScript(
      `(function(){['${STYLE_ID}','${OUTLINE_ID}','${ISLAND_ID}'].forEach(function(id){var e=document.getElementById(id);if(e)e.remove()})})()`,
    );
  } catch {
    // Tab may have been destroyed or navigated
  }
}

/** Format a tool call into a concise human-readable action description. */
export function formatToolAction(
  toolName: string,
  input: Record<string, unknown>,
): string {
  switch (toolName) {
    case "navigate":
      try {
        const hostname = new URL(String(input.url || "")).hostname;
        return `Navigating to ${hostname}\u2026`;
      } catch {
        return "Navigating\u2026";
      }
    case "click":
      if (input.ref != null) return "Clicking element\u2026";
      return `Clicking '${String(input.selector || "element").substring(0, 30)}'\u2026`;
    case "type":
      return `Typing "${String(input.text || "").substring(0, 35)}"\u2026`;
    case "press_key":
      return `Pressing ${input.key}\u2026`;
    case "find": {
      if (input.text)
        return `Finding "${String(input.text).substring(0, 30)}"\u2026`;
      if (input.css)
        return `Finding '${String(input.css).substring(0, 30)}'\u2026`;
      return "Finding elements\u2026";
    }
    case "read_page":
      return "Reading page content\u2026";
    case "screenshot":
      return "Taking screenshot\u2026";
    case "javascript":
      return "Running JavaScript\u2026";
    case "open_tab":
      try {
        if (input.url) {
          const hostname = new URL(String(input.url)).hostname;
          return `Opening ${hostname}\u2026`;
        }
      } catch {
        // fall through
      }
      return "Opening new tab\u2026";
    default:
      return `${toolName}\u2026`;
  }
}

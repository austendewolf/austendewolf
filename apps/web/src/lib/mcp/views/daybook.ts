/**
 * The Daybook as an MCP Apps view: the list drawn inside a Claude conversation.
 *
 * Claude reads this HTML through `resources/read` and renders it in a sandboxed
 * frame on its own domain, so the page has no austendewolf.com session and
 * never holds a credential. Everything it reads or writes goes back through the
 * host as a `tools/call`, which Claude makes with the connector's own token, so
 * the checks in `connector.ts` cover the view exactly as they cover the model.
 *
 * It is one self-contained document because that is what the host accepts: no
 * bundle, no external script, nothing fetched. The palette is the /daybook
 * page's, copied as values rather than imported, since the page's stylesheet
 * is scoped to a full-screen shell this frame does not have.
 *
 * The script is plain ES5-ish string concatenation on purpose. It sits inside a
 * TypeScript template literal, so a backtick or a dollar-brace in it would be
 * read by the compiler rather than the browser.
 */

export const DAYBOOK_VIEW_URI = "ui://daybook/list";

export const DAYBOOK_VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daybook</title>
<style>
:root {
  color-scheme: light dark;
  --green: light-dark(#30cf8c, #5ad8a3);
  --green-shade: light-dark(#27a570, #30cf8c);
  --amber: #cf8c30;
  --bg: light-dark(#fbfbfb, #101010);
  --edge: light-dark(rgba(0,0,0,0.11), rgba(255,255,255,0.09));
  --ink: light-dark(#1c1c1c, #f8f8f8);
  --strong: light-dark(#000000, #ffffff);
  --muted: light-dark(#646464, #8f8f8f);
  --na: light-dark(#9c9c9c, #666666);
  --gap: light-dark(color-mix(in srgb, #cf8c30 80%, #000), color-mix(in srgb, #cf8c30 78%, #fff));
  --gap-soft: color-mix(in srgb, #cf8c30 12%, var(--bg));
  --hit-bg: color-mix(in srgb, var(--green-shade) 14%, var(--bg));
  --sans: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif);
  --mono: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); }
body { font-family: var(--sans); font-size: 13px; line-height: 1.5; padding: 14px 16px 16px; }
button { font: inherit; }
.head { display: flex; align-items: baseline; gap: 10px; }
.head h1 { margin: 0; font-size: 15px; font-weight: 600; color: var(--strong); }
.head .date { font-family: var(--mono); font-size: 12px; color: var(--green-shade); }
.head .open { margin-left: auto; padding: 0; border: 0; background: none; color: var(--na); font-family: var(--mono); font-size: 11px; cursor: pointer; }
.head .open:hover { color: var(--green-shade); }
.sect { font-family: var(--mono); font-weight: 700; font-size: 11px; letter-spacing: 1.3px; text-transform: uppercase; color: var(--green-shade); margin: 18px 0 6px; display: flex; gap: 8px; align-items: baseline; }
.sect::before { content: '\\00b7'; }
.sect .n { color: var(--na); font-weight: 500; letter-spacing: 0.4px; }
.sect .n.ok { color: var(--green-shade); }
.sect .n.gap { color: var(--gap); }
.rows { border-top: 1px solid var(--edge); }
.row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 2px 12px; align-items: start; padding: 9px 0; border-bottom: 1px solid var(--edge); transition: opacity 160ms ease; }
.row > * { line-height: 19px; }
.row.is-busy { opacity: 0.45; }
.due { font-family: var(--mono); font-size: 11px; letter-spacing: 0.4px; color: var(--muted); font-variant-numeric: tabular-nums; }
.row.is-over .due { color: var(--gap); font-weight: 700; }
.row.is-near .due { color: var(--amber); }
.row.is-none .due { color: var(--na); }
.item-t { color: var(--ink); font-size: 13.5px; overflow-wrap: anywhere; }
.who { margin-left: 7px; padding: 1px 6px; border: 1px solid color-mix(in srgb, var(--green-shade) 45%, transparent); border-radius: 999px; color: var(--green-shade); font-family: var(--mono); font-size: 10.5px; white-space: nowrap; }
.meta { color: var(--na); font-size: 12px; margin-top: 2px; }
.meta button { padding: 0; border: 0; background: none; color: var(--na); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.meta button:hover { color: var(--green-shade); }
.pills { display: flex; gap: 6px; }
.pill { padding: 1px 9px; border: 1px solid var(--green-shade); border-radius: 999px; background: none; color: var(--green-shade); font-family: var(--mono); font-size: 11px; cursor: pointer; white-space: nowrap; }
.pill:hover:not(:disabled) { background: var(--hit-bg); }
.pill.is-quiet { border-color: var(--edge); color: var(--muted); }
.pill:disabled { cursor: default; opacity: 0.5; }
.pill:focus-visible, .meta button:focus-visible, .head .open:focus-visible { outline: 2px solid var(--green-shade); outline-offset: 2px; }
.empty { color: var(--muted); padding: 10px 0; border-bottom: 1px solid var(--edge); }
.banner { border-left: 2px solid var(--gap); padding: 6px 12px; margin: 12px 0 0; background: var(--gap-soft); }
.loading { color: var(--muted); margin-top: 14px; }
@media (max-width: 460px) {
  .row { grid-template-columns: minmax(0, 1fr) auto; }
  .row .due { grid-column: 1 / -1; }
  .row .due:empty { display: none; }
}
@media (prefers-reduced-motion: reduce) { .row { transition: none; } }
</style>
</head>
<body>
<div id="app"><p class="loading">Loading the list.</p></div>
<script>
(function () {
  var CAP = 3;
  var nextId = 1;
  var pending = {};
  var state = { today: null, items: null, writable: true, busy: {}, error: null, laterShown: false, laterCount: 0 };

  function send(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { send({ jsonrpc: "2.0", method: method, params: params || {} }); }

  window.addEventListener("message", function (event) {
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.method === undefined && m.id !== undefined && pending[m.id]) {
      var p = pending[m.id];
      delete pending[m.id];
      if (m.error) p.reject(new Error(m.error.message || "request failed"));
      else p.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-result") take(m.params);
    else if (m.method === "ui/notifications/host-context-changed") applyContext(m.params || {});
    else if (m.id !== undefined && m.method) send({ jsonrpc: "2.0", id: m.id, result: {} });
  });

  function applyContext(ctx) {
    if (ctx.theme === "light" || ctx.theme === "dark") document.documentElement.setAttribute("data-theme", ctx.theme);
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) {
      ["--font-sans", "--font-mono"].forEach(function (k) {
        if (vars[k]) document.documentElement.style.setProperty(k, vars[k]);
      });
    }
  }

  function textOf(result) {
    var c = (result && result.content) || [];
    for (var i = 0; i < c.length; i++) if (c[i].type === "text") return c[i].text;
    return "";
  }

  function take(result) {
    if (!result) return;
    if (result.isError) { state.error = textOf(result) || "The list did not load."; render(); return; }
    var data = result.structuredContent;
    if (!data) { try { data = JSON.parse(textOf(result)); } catch (e) { data = null; } }
    if (!data || !data.items) return;
    state.today = data.today;
    state.items = data.items;
    state.writable = data.writable !== false;
    // An older server sends every item and no count, which reads as expanded.
    state.laterShown = data.later_shown !== false;
    state.laterCount = typeof data.later_count === "number" ? data.later_count : 0;
    state.error = null;
    render();
  }

  function callTool(name, args) {
    return request("tools/call", { name: name, arguments: args }).then(function (r) {
      if (r && r.isError) throw new Error(textOf(r) || name + " failed");
      return r;
    });
  }

  function refresh() { return callTool("daybook_show", { later: state.laterShown }).then(take); }

  function expand() {
    state.laterShown = true;
    state.expanding = true;
    render();
    refresh().catch(function (err) { state.laterShown = false; state.error = err.message; })
      .then(function () { state.expanding = false; render(); });
  }

  function act(kind, id) {
    var it = find(id);
    if (!it || state.busy[id]) return;
    state.busy[id] = true;
    render();
    var call;
    if (kind === "done") call = callTool("daybook_close", { id: id, updated_at: it.updated_at });
    else if (kind === "drop") call = callTool("daybook_close", { id: id, status: "dropped", updated_at: it.updated_at });
    else call = callTool("daybook_move", { id: id, horizon: kind });
    call.then(refresh).catch(function (err) {
      var message = /updated_at|changed since/i.test(err.message)
        ? "That item changed somewhere else. The list below is current."
        : err.message;
      // The refresh clears any old error, so the new one goes on after it.
      return refresh().catch(function () {}).then(function () { state.error = message; });
    }).catch(function () {}).then(function () { delete state.busy[id]; render(); });
  }

  function find(id) {
    for (var i = 0; i < (state.items || []).length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function mmdd(d) { return d ? d.slice(5, 7) + "/" + d.slice(8, 10) : ""; }
  function weekday(d) {
    var dt = new Date(d + "T12:00:00Z");
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }

  function dueState(it) {
    if (!it.due) return { cls: "is-none", word: "" };
    var d = daysBetween(state.today, it.due);
    if (d < 0) return { cls: "is-over", word: mmdd(it.due) };
    if (d <= 2) return { cls: "is-near", word: d === 0 ? "today" : mmdd(it.due) };
    return { cls: "", word: mmdd(it.due) };
  }

  function row(it, mode) {
    var due = dueState(it);
    var dis = state.writable && !state.busy[it.id] ? "" : " disabled";
    var id = esc(it.id);
    var t = esc(it.title);
    var actions = mode === "today"
      ? '<button class="pill" data-act="done" data-id="' + id + '" aria-label="Done: ' + t + '"' + dis + '>Done</button>' +
        '<button class="pill is-quiet" data-act="later" data-id="' + id + '" aria-label="Move to later: ' + t + '"' + dis + '>Later</button>'
      : '<button class="pill" data-act="today" data-id="' + id + '" aria-label="Move to today: ' + t + '"' + dis + '>Today</button>' +
        '<button class="pill is-quiet" data-act="drop" data-id="' + id + '" aria-label="Drop: ' + t + '"' + dis + '>Drop</button>';
    var who = it.person ? '<span class="who">' + esc(it.person) + '</span>' : "";
    var meta = it.link
      ? '<div class="meta"><button data-link="' + esc(it.link) + '">' + esc(it.source || "Open") + '</button></div>'
      : it.source ? '<div class="meta">' + esc(it.source) + '</div>' : "";
    return '<div class="row ' + due.cls + (state.busy[it.id] ? " is-busy" : "") + '">' +
      '<span class="due">' + due.word + '</span>' +
      '<div><div class="item-t">' + t + who + '</div>' + meta + '</div>' +
      '<div class="pills">' + actions + '</div></div>';
  }

  function render() {
    var app = document.getElementById("app");
    if (!state.items) {
      app.innerHTML = state.error ? '<p class="banner">' + esc(state.error) + '</p>' : '<p class="loading">Loading the list.</p>';
      return;
    }
    var today = state.items.filter(function (i) { return i.horizon === "today"; });
    var later = state.items.filter(function (i) { return i.horizon !== "today"; });
    var n = today.length;
    var tone = n === CAP ? "ok" : n > CAP ? "gap" : "";
    app.innerHTML =
      '<div class="head"><h1>Daybook</h1><span class="date">' + weekday(state.today) + ' ' + mmdd(state.today) + '</span>' +
      '<button class="open" data-link="https://austendewolf.com/daybook">Open the page</button></div>' +
      (state.error ? '<p class="banner" role="status">' + esc(state.error) + '</p>' : "") +
      (state.writable ? "" : '<p class="banner">The server is read-only right now, so the buttons are off.</p>') +
      '<div class="sect">Today <span class="n ' + tone + '">' + n + ' of ' + CAP + '</span></div>' +
      '<div class="rows">' + (today.length ? today.map(function (i) { return row(i, "today"); }).join("") : '<div class="empty">Nothing on today. Pull one up from later.</div>') + '</div>' +
      '<div class="sect">Later <span class="n">' + (state.laterShown ? later.length : state.laterCount) + '</span></div>' +
      '<div class="rows">' + laterRows(later) + '</div>';
  }

  function laterRows(later) {
    if (!state.laterShown || state.expanding) {
      if (!state.laterCount) return '<div class="empty">Later is empty.</div>';
      return '<div class="empty"><button class="pill is-quiet" data-expand="1"' + (state.expanding ? " disabled" : "") + '>' +
        (state.expanding ? "Loading" : "Show all " + state.laterCount) + '</button></div>';
    }
    return later.length ? later.map(function (i) { return row(i, "later"); }).join("") : '<div class="empty">Later is empty.</div>';
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button");
    if (!b) return;
    if (b.dataset.expand) expand();
    else if (b.dataset.act) act(b.dataset.act, b.dataset.id);
    else if (b.dataset.link) request("ui/open-link", { url: b.dataset.link }).catch(function () {});
  });

  var lastHeight = 0;
  function reportSize() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (h === lastHeight) return;
    lastHeight = h;
    notify("ui/notifications/size-changed", { height: h });
  }
  if (window.ResizeObserver) new ResizeObserver(reportSize).observe(document.documentElement);

  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    capabilities: {},
    clientInfo: { name: "Daybook", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] }
  }).then(function (r) {
    applyContext((r && r.hostContext) || {});
    notify("ui/notifications/initialized", {});
    // The host pushes the tool's own result next. If it never does, as when the
    // view is reopened from history, ask for the list directly.
    setTimeout(function () { if (!state.items) refresh().catch(function (err) { state.error = err.message; render(); }); }, 2500);
  }).catch(function (err) { state.error = err.message; render(); });
})();
</script>
</body>
</html>
`;

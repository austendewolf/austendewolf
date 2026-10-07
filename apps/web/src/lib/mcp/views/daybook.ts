import { DAYBOOK_UI_JS } from "./daybook-ui";

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
 * bundle, no external script, nothing fetched. The drawing is the daybook
 * module, `plugins/daybook/ui/daybook.js`, inlined from the copy that
 * `scripts/daybook-ui.ts` generates, so this view and the Claude Code widget
 * draw from one file. What stays here is the bridge to the host.
 *
 * The bridge is plain ES5-ish string concatenation on purpose. It sits inside a
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
:root { color-scheme: light dark; }
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
html, body { margin: 0; background: light-dark(#fbfbfb, #101010); }
body { font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif); padding: 14px 16px 16px; }
</style>
</head>
<body>
<div id="app"></div>
<script>
${DAYBOOK_UI_JS}
</script>
<script>
(function () {
  var app = document.getElementById("app");
  if (!window.Daybook) { app.textContent = "The daybook could not draw."; return; }
  var nextId = 1;
  var pending = {};
  var seen = false;

  function send(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { send({ jsonrpc: "2.0", method: method, params: params || {} }); }

  function textOf(result) {
    var c = (result && result.content) || [];
    for (var i = 0; i < c.length; i++) if (c[i].type === "text") return c[i].text;
    return "";
  }

  function dataOf(result) {
    var data = result && result.structuredContent;
    if (!data) { try { data = JSON.parse(textOf(result)); } catch (e) { data = null; } }
    return data && data.items ? data : null;
  }

  function callTool(name, args) {
    return request("tools/call", { name: name, arguments: args }).then(function (r) {
      if (r && r.isError) throw new Error(textOf(r) || name + " failed");
      return r;
    });
  }

  function load(o) {
    return callTool("daybook_show", { later: Boolean(o && o.later) }).then(function (r) {
      var data = dataOf(r);
      if (!data) throw new Error("The list did not load.");
      return data;
    });
  }

  // Presses call the server at once and the list reloads, since each call
  // here costs no model turn.
  var list = window.Daybook.list(app, null, {
    mode: "call",
    call: callTool,
    load: load,
    openLink: function (url) { request("ui/open-link", { url: url }).catch(function () {}); }
  });

  function take(result) {
    if (!result) return;
    if (result.isError) { seen = true; list.error(textOf(result) || "The list did not load."); return; }
    var data = dataOf(result);
    if (!data) return;
    seen = true;
    list.update(data);
  }

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
    appInfo: { name: "Daybook", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] }
  }).then(function (r) {
    applyContext((r && r.hostContext) || {});
    notify("ui/notifications/initialized", {});
    // The host pushes the tool's own result next. If it never does, as when the
    // view is reopened from history, ask for the list directly.
    setTimeout(function () {
      if (seen) return;
      load({ later: false }).then(function (data) {
        if (!seen) { seen = true; list.update(data); }
      }).catch(function (err) { if (!seen) list.error(err.message); });
    }, 2500);
  }).catch(function (err) { list.error(err.message); });
})();
</script>
</body>
</html>
`;

import { DAYBOOK_VIEW_HTML, DAYBOOK_VIEW_URI } from "./views/daybook";

/**
 * MCP Apps: views Claude draws inside the conversation.
 *
 * A tool names a `ui://` resource in its `_meta.ui.resourceUri`, the host reads
 * that resource here, and renders the HTML in a sandboxed frame beside the
 * tool's result. The frame talks back only through the host, so it holds no
 * credential of its own. Spec: modelcontextprotocol/ext-apps, 2026-01-26.
 */

export const APP_MIME = "text/html;profile=mcp-app";

/** The extension id a server declares in `initialize` to say it serves views. */
export const APPS_EXTENSION = "io.modelcontextprotocol/ui";

interface View {
  uri: string;
  name: string;
  description: string;
  html: string;
}

const VIEWS: View[] = [
  {
    uri: DAYBOOK_VIEW_URI,
    name: "Daybook",
    description: "Today and later, with Done, Later, Today and Drop on each item.",
    html: DAYBOOK_VIEW_HTML,
  },
];

export function listViews() {
  return VIEWS.map(({ uri, name, description }) => ({ uri, name, description, mimeType: APP_MIME }));
}

export function readView(uri: string) {
  const view = VIEWS.find((v) => v.uri === uri);
  if (!view) return null;
  return {
    contents: [
      {
        uri: view.uri,
        mimeType: APP_MIME,
        text: view.html,
        // Nothing is fetched from anywhere: every read and write is a tool call
        // through the host, so the sandbox needs no allowed origins at all.
        _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true } },
      },
    ],
  };
}

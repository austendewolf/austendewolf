import { ADMIN_TOOLS } from "./admin";
import type { Caller } from "./connector";
import { DAYBOOK_TOOLS } from "./daybook";
import { TOOLS, type ToolDefinition } from "./google";

/**
 * Which tools each caller may see.
 *
 * Supabase's OAuth server offers the standard scopes and nothing custom, so
 * least privilege cannot ride on the access token's scope. It is decided here
 * instead, from which credential the request arrived with.
 *
 * `ADMIN_TOOLS` is the line that matters. `accounts_connect_url` and
 * `accounts_disconnect` manage the Google credentials every other tool depends
 * on, so a connector never sees them: they stay on the connections page, which
 * is behind a real sign-in, and on the machine path. A hidden tool answers as an
 * unknown tool rather than as a refusal, because a caller that cannot reach it
 * has no consent to step up to.
 */

/** Everything this server implements itself. */
export const LOCAL_TOOLS: ToolDefinition[] = [...TOOLS, ...DAYBOOK_TOOLS, ...ADMIN_TOOLS];

const CONNECTOR_TOOLS: ToolDefinition[] = [...TOOLS, ...DAYBOOK_TOOLS];

export function toolsFor(caller: Caller): ToolDefinition[] {
  return caller.kind === "machine" ? LOCAL_TOOLS : CONNECTOR_TOOLS;
}

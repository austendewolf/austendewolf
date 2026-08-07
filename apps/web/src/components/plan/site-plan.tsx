import { PlanDrawing } from "@/components/plan/plan-drawing";
import { buildPlan } from "@/lib/plan/manifest";

/**
 * The site plan.
 *
 * Drawn rather than laid out: one datum running left to right, employment and
 * ventures as bars along it, and everything with a single date as a station
 * dropping a leader to the line.
 *
 * SVG rather than canvas, deliberately. The whole aesthetic here is line work,
 * so canvas buys nothing visually while costing the things that matter: these
 * labels stay selectable and crawlable, every node is real focusable markup,
 * and the outlines reuse the same hand-drawn filters as the rest of the site
 * instead of being reimplemented as pixel work.
 *
 * Built on the server so the whole manifest ships as markup, then handed to a
 * client component that owns only the camera and which node is open.
 */

/** Must match what the drawing assumes, or moment labels collide. */
const LABEL_YEARS = 1.9;

export async function SitePlan() {
  const plan = await buildPlan(LABEL_YEARS);
  return <PlanDrawing plan={plan} />;
}

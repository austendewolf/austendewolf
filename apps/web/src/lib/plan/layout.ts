/*
 * Types only. `manifest` reads the filesystem to build the plan, so importing
 * any *value* from it drags `node:fs` into the client bundle through this
 * module — types are erased at compile time and are safe to take.
 */
import type { Plan, PlanNode } from "@/lib/plan/manifest";

/**
 * Where everything on the drawing goes.
 *
 * There is one kind of thing here: a node. It has a box above the datum, a
 * label, and a vertical leader down to its anchor on the line. A node that
 * occupies time also has an extent, and the extent is drawn *below* the datum.
 *
 * That last decision is what makes the whole thing tractable. Leaders live
 * above the line and stop at it; extents live below it. They cannot meet, so a
 * duration never has to be sliced apart to let a leader through. Modelling
 * duration as a second species of shape floating among the boxes is what
 * produced bars chopped into three-pixel fragments.
 *
 * The one rule that remains:
 *
 *   A box may cover the anchors of nodes in LOWER lanes, and never one in its
 *   own lane or above.
 *
 * A leader descends from its node to the datum, so it passes every lane below
 * its owner and none above. The consequence is worth stating because it is the
 * opposite of the obvious guess: the higher the lane, the wider a box is
 * allowed to be. Crowded nodes belong high.
 */

export const W = 1000;
export const MARGIN_X = 44;
export const INNER = W - MARGIN_X * 2;

const BOX_H = 30;
const LINE_H = 13;
const EXTENT_H = 7;

/**
 * How far the drawn outline strays from the rectangle it was given.
 *
 * Not a guess. Every box goes through the graphite filter, three chained
 * `feDisplacementMap` passes at `scale * 2.4`, `scale * 1.4` and `scale * 0.65`.
 * A displacement map moves a pixel by up to half its scale either way, so the
 * worst case for the widest instrument (`box-b`, scale 3.1) is
 * `3.1 * (2.4 + 1.4 + 0.65) / 2`, near enough seven.
 *
 * Every clearance below is measured against this rather than the geometry.
 * Sizing them to the rectangle is what produced a drawing that measured clean
 * and visibly overlapped.
 */
const INK_WANDER = 7;

/** Both edges wander, so a gap absorbs two of them and still has to read. */
const LANE_GUTTER = INK_WANDER * 2 + 8;
const NEIGHBOUR_GUTTER = INK_WANDER * 2 + 8;
/** A leader is unfiltered, so only the box it passes wanders into it. */
const CORRIDOR = INK_WANDER + 10;

/** Below this a node has no room left for a readable label. */
const MIN_WIDTH = 64;

const TOP_PAD = 12;
const DATUM_GAP = 18;
const DATUM_LABELS = 34;

export type Level = 0 | 1;

export interface NodeBox {
  node: PlanNode;
  /** Where the leader meets the datum, and where it leaves the box. */
  anchor: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  lane: number;
  /** Below the datum, for nodes that occupy time. */
  extent: { left: number; right: number; top: number; ongoing: boolean } | null;
}

export interface Layout {
  boxes: NodeBox[];
  datumY: number;
  /** Year labels sit under the extents, not on top of them. */
  labelY: number;
  height: number;
  x: (year: number) => number;
  perYear: number;
}

interface Placed {
  node: PlanNode;
  anchor: number;
  lane: number;
  left: number;
  right: number;
}

/**
 * Two nodes cannot share a lane when their ranges genuinely overlap.
 *
 * Strictly, so that abutting is not overlapping. One job ending the same month
 * the next begins is a handover, not two things held at once, and treating it
 * as concurrency costs a whole lane to say something untrue. A moment still
 * overlaps any range that contains it, which is the case that matters.
 */
function overlaps(a: PlanNode, b: PlanNode): boolean {
  return a.from < b.to && b.from < a.to;
}

/**
 * Nodes whose dates overlap may never share a lane.
 *
 * This is the rule the drawing exists to express. Two things that were true at
 * the same time have to be readable as concurrent, and a lane is the only place
 * that can be said — put them side by side in one lane and the sheet claims
 * they were sequential.
 *
 * Assigned by greedy colouring in start order, which is optimal on intervals:
 * the number of lanes it uses equals the largest number of nodes live at any
 * one instant, and no arrangement can do better than that.
 */
function laneByDate(items: Placed[]) {
  const lanes: Placed[][] = [];

  for (const item of [...items].sort((a, b) => a.node.from - b.node.from)) {
    let lane = lanes.findIndex(
      (members) => !members.some((m) => overlaps(m.node, item.node)),
    );
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push(item);
    item.lane = lane;
  }
}

/** Whether a lane already holds something this node was concurrent with. */
function laneIsFree(item: Placed, lane: number, all: Placed[]) {
  return !all.some(
    (other) =>
      other !== item && other.lane === lane && overlaps(other.node, item.node),
  );
}

/**
 * Bounds on a box, given who shares its lane and who sits above it.
 *
 * Same-lane neighbours need the stronger of the two rules. Excluding a
 * neighbour's anchor is not enough to stay off its box: two boxes can each
 * avoid the other's anchor and still overlap in the stretch between the two. So
 * the boundary between them is the midpoint of their anchors, which is always
 * between the two and therefore always leaves each box covering its own.
 *
 * Returns `null` when the constraints leave no room for the anchor itself,
 * which is the signal to move the node up a lane.
 */
function boundsFor(item: Placed, all: Placed[]) {
  let lo = MARGIN_X;
  let hi = W - MARGIN_X;

  for (const other of all) {
    if (other === item || other.lane < item.lane) continue;

    const sameLane = other.lane === item.lane;
    const bound = sameLane ? (item.anchor + other.anchor) / 2 : other.anchor;
    const clearance = sameLane ? NEIGHBOUR_GUTTER / 2 : CORRIDOR;

    if (other.anchor < item.anchor) lo = Math.max(lo, bound + clearance);
    else if (other.anchor > item.anchor) hi = Math.min(hi, bound - clearance);
  }

  if (lo > item.anchor || hi < item.anchor) return null;
  return { lo, hi };
}

/**
 * Lanes and horizontal extents for every node.
 *
 * Everything starts in lane 0 and rises only when forced. Raising a node
 * strictly shrinks the set it must avoid, since that set is "my lane and
 * above", and a node alone in the top lane is unconstrained and always fits.
 * So this terminates: worst case is every node in its own lane, a staircase.
 */
function solveLanes(items: Placed[], maxWidth: number) {
  // Dates decide the lanes. Width may only push a node further out from here,
  // never back onto something it was concurrent with.
  laneByDate(items);

  const limit = items.length * items.length + items.length;
  for (let pass = 0; pass < limit; pass++) {
    let moved = false;

    for (const item of items) {
      const bounds = boundsFor(item, items);
      if (!bounds || bounds.hi - bounds.lo < MIN_WIDTH) {
        // Skip past any lane holding something concurrent with this node.
        let next = item.lane + 1;
        while (!laneIsFree(item, next, items)) next += 1;
        item.lane = next;
        moved = true;
        break; // One move changes several bounds; re-evaluate everyone.
      }
    }
    if (!moved) break;
  }

  /*
   * Escalation leaves gaps in the numbering. Closing them is safe: it preserves
   * the relative order of every lane, so two nodes that were in different lanes
   * stay in different lanes, and the date rule survives compaction.
   */
  const used = [...new Set(items.map((i) => i.lane))].sort((a, b) => a - b);
  const rank = new Map(used.map((lane, index) => [lane, index]));
  for (const item of items) item.lane = rank.get(item.lane)!;

  for (const item of items) {
    const { lo, hi } = boundsFor(item, items)!;
    const width = Math.min(maxWidth, hi - lo);
    // Centred on the anchor where there is room, shifted off it where there is
    // not, never so far that it stops covering its own leader.
    item.left = Math.min(Math.max(item.anchor - width / 2, lo), hi - width);
    item.right = item.left + width;
  }
}

/** Extents sit below the datum and only have to miss each other. */
function packExtents(items: Array<{ from: number; to: number; lane: number }>) {
  const laneEnds: number[] = [];

  for (const item of [...items].sort((a, b) => a.from - b.from)) {
    let lane = laneEnds.findIndex((end) => end <= item.from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.to);
    } else {
      laneEnds[lane] = item.to;
    }
    item.lane = lane;
  }
}

export function layoutPlan(plan: Plan, level: Level, maxWidth: number): Layout {
  const { nodes, from, to } = plan;

  const perYear = INNER / (to - from);
  const x = (year: number) => MARGIN_X + (year - from) * perYear;

  const boxHeight = BOX_H + (level > 0 ? LINE_H * 2 : 0);

  const placed: Placed[] = nodes.map((node) => ({
    node,
    anchor: x(node.anchor),
    lane: 0,
    left: 0,
    right: 0,
  }));
  solveLanes(placed, maxWidth);

  // Every node has a range now, but only a range with length is worth drawing:
  // a zero-length one is already said by the station on the datum.
  const extents = nodes
    .filter((n) => n.to > n.from)
    .map((n) => ({ node: n, from: x(n.from), to: x(n.to), lane: 0 }));
  packExtents(extents);

  const boxLaneCount = Math.max(...placed.map((p) => p.lane), 0) + 1;
  const extentLaneCount = extents.length
    ? Math.max(...extents.map((e) => e.lane), 0) + 1
    : 0;

  const stack = boxLaneCount * (boxHeight + LANE_GUTTER);
  const datumY = TOP_PAD + stack + DATUM_GAP;

  /* Below the datum, in order: the year ticks, then the extents, then the year
     labels. Each gets its own band so none of them lands on another. */
  const extentTop = datumY + 12;
  const extentStack = extentLaneCount * (EXTENT_H + 6);
  const labelY = extentTop + extentStack + 14;
  const height = labelY + DATUM_LABELS - 20;

  const extentByNode = new Map(extents.map((e) => [e.node.id, e]));

  const boxes: NodeBox[] = placed.map((item) => {
    // Lane 0 nearest the datum, stacking upward.
    const top = datumY - DATUM_GAP - (item.lane + 1) * (boxHeight + LANE_GUTTER);
    const extent = extentByNode.get(item.node.id);

    return {
      node: item.node,
      anchor: item.anchor,
      left: item.left,
      right: item.right,
      top,
      bottom: top + boxHeight,
      lane: item.lane,
      extent: extent
        ? {
            left: extent.from,
            right: Math.max(extent.to, extent.from + 4),
            top: extentTop + extent.lane * (EXTENT_H + 6),
            ongoing: Boolean(item.node.ongoing),
          }
        : null,
    };
  });

  return { boxes, datumY, labelY, height, x, perYear };
}

export type { PlanNode };

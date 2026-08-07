"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  INNER,
  MARGIN_X,
  W,
  layoutPlan,
  type Level,
  type NodeBox,
} from "@/lib/plan/layout";
import type { Plan, PlanNode } from "@/lib/plan/manifest";

/**
 * The drawing, and the camera over it.
 *
 * One kind of thing: a node, with a box above the datum and a leader down to
 * its anchor. Nodes that occupy time also draw an extent below the line, where
 * no leader ever travels, so nothing ever has to be broken to let something
 * else past.
 *
 * Geometry is not computed here. `layoutPlan` solves the whole sheet for a
 * given level of detail and this renders the answer, which is what keeps the
 * no-overlap rule true: one place decides where everything goes, for every node
 * at once.
 */

const LINE_H = 13;
const LABEL_YEARS = 1.9;

/** Past this, every node shows its second line without being asked. */
const LOD_ZOOM = 1.6;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export function PlanDrawing({ plan }: { plan: Plan }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const level: Level = zoom >= LOD_ZOOM ? 1 : 0;
  const maxWidth = (LABEL_YEARS * INNER) / (plan.to - plan.from);

  const layout = useMemo(
    () => layoutPlan(plan, level, maxWidth),
    [plan, level, maxWidth],
  );
  const { datumY, labelY, height: H, x, perYear } = layout;

  const clamp = useCallback(
    (next: { x: number; y: number }, z: number) => ({
      x: Math.min(Math.max(next.x, 0), W - W / z),
      y: Math.min(Math.max(next.y, 0), H - H / z),
    }),
    [H],
  );

  const zoomTo = useCallback(
    (nextZoom: number, focus?: { x: number; y: number }) => {
      const z = Math.min(Math.max(nextZoom, MIN_ZOOM), MAX_ZOOM);
      setZoom(z);
      setPan((current) => {
        const anchor =
          focus ?? { x: current.x + W / zoom / 2, y: current.y + H / zoom / 2 };
        return clamp(
          {
            x: anchor.x - (anchor.x - current.x) * (zoom / z),
            y: anchor.y - (anchor.y - current.y) * (zoom / z),
          },
          z,
        );
      });
    },
    [clamp, zoom, H],
  );

  /*
   * Wheel zoom only with a modifier held. The drawing sits inside a page that
   * scrolls, and a plain wheel handler would eat that scroll. Ctrl or Command
   * is also what a trackpad pinch sends.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const box = svg.getBoundingClientRect();
      zoomTo(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), {
        x: pan.x + ((event.clientX - box.left) / box.width) * (W / zoom),
        y: pan.y + ((event.clientY - box.top) / box.height) * (H / zoom),
      });
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [pan, zoom, zoomTo, H]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const years = Array.from(
    { length: plan.to - plan.from + 1 },
    (_, i) => plan.from + i,
  );
  const opened = layout.boxes.find((b) => b.node.id === open);

  return (
    <div className="plan-frame">
      <svg
        ref={svgRef}
        viewBox={`${pan.x} ${pan.y} ${W / zoom} ${H / zoom}`}
        preserveAspectRatio="xMidYMid meet"
        className="plan"
        aria-label="Site plan: work and ventures on a timeline"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(null);
        }}
      >
        <g className="plan-datum">
          <line x1={MARGIN_X - 14} y1={datumY} x2={W - MARGIN_X + 14} y2={datumY} />
          {years.map((year) => {
            const tx = x(year);
            const labelled = perYear * zoom > 34 || year % 2 === 0;
            return (
              <g key={year}>
                <line x1={tx} y1={datumY} x2={tx} y2={datumY + (labelled ? 7 : 4)} />
                {labelled && (
                  <text x={tx} y={labelY} className="plan-year">
                    {year}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        <g className="plan-nodes">
          {layout.boxes.map((box, i) => (
            <Node
              key={box.node.id}
              box={box}
              i={i}
              level={level}
              datumY={datumY}
              onOpen={() => setOpen(open === box.node.id ? null : box.node.id)}
            />
          ))}
        </g>

        {/* Drawn last: SVG has no z-index, so paint order is the only way to
            raise the open node above the drawing it covers. */}
        {opened && (
          <OpenPanel
            node={opened.node}
            x={opened.anchor}
            y={opened.bottom}
            width={maxWidth}
            onClose={() => setOpen(null)}
          />
        )}
      </svg>

      <div className="plan-scale">
        <span className="plan-scale-label">Scale</span>
        <button type="button" onClick={() => zoomTo(zoom / 1.4)} aria-label="Zoom out">
          −
        </button>
        <span className="plan-scale-value">
          {zoom < 1.01 ? "1:1" : `${zoom.toFixed(1)}:1`}
        </span>
        <button type="button" onClick={() => zoomTo(zoom * 1.4)} aria-label="Zoom in">
          +
        </button>
        {zoom > 1.01 && (
          <button
            type="button"
            className="plan-scale-reset"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Fit
          </button>
        )}
      </div>
    </div>
  );
}

function Node({
  box, i, level, datumY, onOpen,
}: {
  box: NodeBox;
  i: number;
  level: Level;
  datumY: number;
  onOpen: () => void;
}) {
  const { node, anchor, left, right, top, bottom, extent } = box;
  const width = right - left;
  // The box holds its anchor but need not be centred on it, so text centres on
  // the box while the leader still drops from the anchor.
  const mid = (left + right) / 2;

  return (
    <g
      className={`plan-node plan-node-${node.kind}`}
      role="button"
      tabIndex={0}
      aria-expanded={level > 0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {/* Unbroken, always. The layout reserves this corridor and every box is
          placed to keep clear of it. */}
      <line x1={anchor} y1={bottom} x2={anchor} y2={datumY} className="plan-leader" />
      <path
        d={`M ${anchor - 4} ${datumY} h 8 M ${anchor} ${datumY - 4} v 8`}
        className="plan-station"
      />

      <rect
        x={left}
        y={top}
        width={width}
        height={bottom - top}
        filter={`url(#box-${["a", "b", "c"][i % 3]})`}
      />
      <text x={mid} y={top + 19} className="plan-node-label">
        {truncate(node.label, Math.floor(width / 6.6))}
      </text>
      {level > 0 && (
        <>
          {node.detail && (
            <text x={mid} y={top + 19 + LINE_H} className="plan-node-meta">
              {truncate(node.detail, Math.floor(width / 5.4))}
            </text>
          )}
          <text x={mid} y={top + 19 + LINE_H * 2} className="plan-node-meta">
            {node.dates}
          </text>
        </>
      )}

      {/*
        How long it ran, drawn below the datum where no leader travels, so a
        duration never has to be broken to let one past.

        The tick at the middle sits directly under this node's leader, because
        a node with duration is anchored at the middle of it. That vertical
        alignment is what says which extent belongs to which node without
        drawing a line down through everyone else's — and it is what makes two
        overlapping ranges legible as concurrent rather than as one long one.
      */}
      {extent && (
        <g className="plan-extent">
          <path
            d={
              `M ${extent.left} ${extent.top} v 7` +
              ` M ${extent.left} ${extent.top + 3.5} H ${extent.right}` +
              ` M ${extent.right} ${extent.top} v 7`
            }
          />
          <path className="plan-extent-tie" d={`M ${anchor} ${extent.top - 3} v 13`} />
          {extent.ongoing && (
            <path
              d={`M ${extent.right} ${extent.top + 3.5} l 10 0 m -4 -3 l 4 3 l -4 3`}
              className="plan-extent-open"
            />
          )}
        </g>
      )}
    </g>
  );
}

/**
 * The opened node.
 *
 * Filled with the sheet colour, which is the one place a fill is right: a
 * detail balloon on a drawing sits in cleared space, and without it the line
 * work underneath reads straight through the text. It is allowed to cover the
 * drawing, because it is not part of it.
 */
function OpenPanel({
  node, x, y, width, onClose,
}: {
  node: PlanNode;
  x: number;
  y: number;
  width: number;
  onClose: () => void;
}) {
  const panelWidth = Math.min(Math.max(width * 2.1, 220), INNER);
  const chars = Math.floor(panelWidth / 6.4) - 4;
  const body = node.note ? wrap(node.note, chars, 4) : [];

  const height = 26 + 16 + body.length * LINE_H + (node.href ? 22 : 6) + 10;
  const left = Math.min(
    Math.max(x - panelWidth / 2, MARGIN_X),
    W - MARGIN_X - panelWidth,
  );
  const top = Math.max(y - height, 4);

  return (
    <g className="plan-panel">
      <rect x={left} y={top} width={panelWidth} height={height} className="plan-panel-bg" />
      <rect
        x={left}
        y={top}
        width={panelWidth}
        height={height}
        filter="url(#box-b)"
        className="plan-panel-edge"
      />

      <text x={left + 12} y={top + 20} className="plan-panel-title">
        {truncate(node.label, chars)}
      </text>
      <text
        x={left + panelWidth - 12}
        y={top + 20}
        className="plan-panel-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </text>
      <text x={left + 12} y={top + 34} className="plan-panel-meta">
        {truncate([node.detail, node.dates].filter(Boolean).join("  ·  "), chars)}
      </text>

      {body.map((line, i) => (
        <text key={i} x={left + 12} y={top + 52 + i * LINE_H} className="plan-panel-body">
          {line}
        </text>
      ))}

      {node.href && (
        <a
          href={node.href}
          target={node.href.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
        >
          <text x={left + 12} y={top + height - 12} className="plan-panel-link">
            Open sheet →
          </text>
        </a>
      )}
    </g>
  );
}

/** Monospace, so character count is a reliable proxy for width. */
function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1))}…`;
}

/** SVG text does not wrap, so lines are measured out here instead. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      if (lines.length === maxLines) {
        lines[lines.length - 1] = truncate(`${lines[lines.length - 1]} …`, maxChars);
        return lines;
      }
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent print:hidden"
    >
      <Printer size={12} />
      Save as PDF
    </button>
  );
}

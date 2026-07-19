"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import type { ChipDenomination } from "@/lib/types";
import { formatMoney } from "@/lib/ledger";

export function ChipCounter({
  denominations,
  onApply,
  onCancel,
}: {
  denominations?: ChipDenomination[] | null;
  onApply: (total: number) => void;
  onCancel: () => void;
}) {
  const denoms = denominations?.length
    ? denominations
    : [
        { value: 1, label: "⚪" },
        { value: 5, label: "🔴" },
        { value: 25, label: "🟢" },
        { value: 100, label: "⚫" },
      ];

  const sorted = [...denoms].sort((a, b) => b.value - a.value);
  const [counts, setCounts] = useState<Record<number, number>>({});

  const total = sorted.reduce(
    (acc, d) => acc + d.value * (counts[d.value] || 0),
    0
  );

  function adjust(val: number, delta: number) {
    setCounts((prev) => {
      const current = prev[val] || 0;
      return { ...prev, [val]: Math.max(0, current + delta) };
    });
  }

  function setValue(val: number, countStr: string) {
    setCounts((prev) => ({
      ...prev,
      [val]: Math.max(0, parseInt(countStr) || 0),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-sm flex flex-col gap-4 max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Chip Counter</h2>
          <Button variant="ghost" className="px-2" onClick={onCancel}>
            ✕
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {sorted.map((d) => (
            <div
              key={d.value}
              className="flex items-center justify-between gap-3 bg-surface-2 p-2 rounded-xl"
            >
              <div className="flex items-center gap-2 w-20 shrink-0">
                <span className="text-lg">{d.label || "🪙"}</span>
                <span className="font-semibold">{formatMoney(d.value)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="px-3"
                  onClick={() => adjust(d.value, -1)}
                >
                  -
                </Button>
                <Input
                  type="number"
                  min="0"
                  className="w-16 text-center bg-surface"
                  value={counts[d.value] === 0 ? "" : counts[d.value] || ""}
                  onChange={(e) => setValue(d.value, e.target.value)}
                  placeholder="0"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="px-3"
                  onClick={() => adjust(d.value, 1)}
                >
                  +
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-border pt-4 flex items-center justify-between">
          <span className="text-muted">Total:</span>
          <span className="text-2xl font-bold text-accent">
            {formatMoney(total)}
          </span>
        </div>

        <Button type="button" className="w-full mt-2" onClick={() => onApply(total)}>
          Apply {formatMoney(total)}
        </Button>
      </Card>
    </div>
  );
}

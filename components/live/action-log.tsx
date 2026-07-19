"use client";

import { useEffect, useRef } from "react";
import { clsx } from "@/lib/clsx";
import { formatMoney } from "@/lib/ledger";
import { Card } from "@/components/ui";
import type { GamePlayer, HandAction } from "@/lib/types";

export function ActionLog({
  handActions,
  players,
}: {
  handActions: HandAction[];
  players: GamePlayer[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [handActions]);

  if (handActions.length === 0) return null;

  return (
    <Card className="mt-4 flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Action Feed
        </span>
        <span className="text-[10px] text-muted">
          {handActions.length} action{handActions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1 text-xs font-mono scroll-smooth"
      >
        {handActions.map((act) => {
          const p = players.find((pl) => pl.id === act.player_id);
          const name = p?.nickname || "Player";
          const actionUpper = act.action.toUpperCase();

          return (
            <div
              key={act.id}
              className="flex items-center justify-between py-0.5 border-b border-border/20 last:border-0"
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase text-muted font-sans font-medium px-1 rounded bg-surface-2">
                  {act.street}
                </span>
                <span className="font-semibold text-foreground">{name}</span>
                <span
                  className={clsx(
                    "font-bold text-[11px]",
                    act.action === "fold" && "text-muted",
                    act.action === "check" && "text-muted",
                    act.action === "call" && "text-positive",
                    (act.action === "bet" || act.action === "raise") &&
                      "text-accent",
                    act.action === "all_in" && "text-negative"
                  )}
                >
                  {actionUpper}
                </span>
                {act.amount > 0 ? (
                  <span className="text-foreground">
                    {formatMoney(act.amount)}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] text-muted/70 font-sans">
                {new Date(act.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

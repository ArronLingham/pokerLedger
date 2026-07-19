"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { formatMoney, formatChipsString } from "@/lib/ledger";
import type { ChipDenomination } from "@/lib/types";

export type ActionKind = "fold" | "check" | "call" | "bet" | "raise" | "all_in";

export function ActionBar({
  stack,
  committedStreet,
  currentBet,
  lastRaise,
  bigBlind,
  pot,
  busy,
  onAction,
  showChips,
  denominations,
}: {
  stack: number;
  committedStreet: number;
  currentBet: number;
  lastRaise: number;
  bigBlind: number;
  pot: number;
  busy: boolean;
  onAction: (action: ActionKind, amountTo?: number) => void;
  showChips?: boolean;
  denominations?: ChipDenomination[] | null;
}) {
  const toCall = Math.max(0, currentBet - committedStreet);
  const canCheck = toCall === 0;
  const maxTo = committedStreet + stack; // all-in target (this-street total)
  const isRaise = currentBet > 0;
  const minTo = Math.min(
    isRaise ? currentBet + lastRaise : bigBlind,
    maxTo,
  );

  const [amountTo, setAmountTo] = useState<number>(minTo);
  const amt = Math.max(minTo, Math.min(amountTo || minTo, maxTo));
  const canBetOrRaise = stack > toCall; // room to put in more than a call

  function quick(target: number) {
    setAmountTo(Math.max(minTo, Math.min(Math.round(target), maxTo)));
  }

  const format = (v: number) => 
    showChips && denominations ? formatChipsString(v, denominations) : formatMoney(v);

  return (
    <Card className="sticky bottom-20 flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          variant="danger"
          className="flex-1"
          disabled={busy}
          onClick={() => onAction("fold")}
        >
          Fold
        </Button>
        {canCheck ? (
          <Button
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() => onAction("check")}
          >
            Check
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() => onAction("call")}
          >
            Call {format(Math.min(toCall, stack))}
          </Button>
        )}
      </div>

      {canBetOrRaise ? (
        <>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={minTo}
              max={maxTo}
              step={1}
              value={amt}
              onChange={(e) => setAmountTo(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
            />
            <span className="w-20 text-right font-mono text-sm">{format(amt)}</span>
          </div>
          <div className="flex gap-2 text-xs">
            <Button variant="secondary" className="flex-1 py-1.5" onClick={() => quick(minTo)}>
              Min
            </Button>
            <Button variant="secondary" className="flex-1 py-1.5" onClick={() => quick(committedStreet + pot / 2)}>
              ½ Pot
            </Button>
            <Button variant="secondary" className="flex-1 py-1.5" onClick={() => quick(committedStreet + pot)}>
              Pot
            </Button>
            <Button variant="secondary" className="flex-1 py-1.5" onClick={() => quick(maxTo)}>
              Max
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy}
              onClick={() =>
                amt >= maxTo
                  ? onAction("all_in")
                  : onAction(isRaise ? "raise" : "bet", amt)
              }
            >
              {amt >= maxTo
                ? `All-in ${format(maxTo)}`
                : `${isRaise ? "Raise to" : "Bet"} ${format(amt)}`}
            </Button>
          </div>
        </>
      ) : (
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => onAction("all_in")}
        >
          All-in {format(maxTo)}
        </Button>
      )}
    </Card>
  );
}

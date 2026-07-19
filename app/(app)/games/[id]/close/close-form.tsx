"use client";

import { useActionState, useMemo, useState } from "react";
import { closeGame, type GameState } from "../../actions";
import { Button, Card, FormMessage, Input, Label } from "@/components/ui";
import { formatMoney } from "@/lib/ledger";
import type { GamePlayer, Member, ChipDenomination } from "@/lib/types";
import { ChipCounter } from "@/components/chip-counter";

const initial: GameState = {};

type RowState = {
  player_id: string;
  nickname: string;
  member_id: string; // "" => create new member from nickname
  buy_in: string;
  cash_out: string;
};

export function CloseGameForm({
  gameId,
  players,
  members,
  denominations,
}: {
  gameId: string;
  players: GamePlayer[];
  members: Member[];
  denominations?: ChipDenomination[] | null;
}) {
  const [state, formAction, pending] = useActionState(closeGame, initial);
  const [rows, setRows] = useState<RowState[]>(
    players.map((p) => ({
      player_id: p.id,
      nickname: p.nickname || "Player",
      member_id: p.member_id ?? "",
      // Pre-filled from the chip tracker when it was used (0 => blank).
      buy_in: p.buy_in ? String(p.buy_in) : "",
      cash_out: p.stack ? String(p.stack) : "",
    })),
  );
  const [activeCounter, setActiveCounter] = useState<{
    rowIdx: number;
    field: "buy_in" | "cash_out";
  } | null>(null);

  function update(i: number, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const { totalBuyIn, totalCashOut } = useMemo(() => {
    let b = 0;
    let c = 0;
    for (const r of rows) {
      b += Number(r.buy_in) || 0;
      c += Number(r.cash_out) || 0;
    }
    return { totalBuyIn: b, totalCashOut: c };
  }, [rows]);

  const diff = totalCashOut - totalBuyIn;
  const balanced = Math.abs(diff) < 0.005;

  const serialized = JSON.stringify(
    rows.map((r) => ({
      player_id: r.player_id,
      member_id: r.member_id || null,
      nickname: r.nickname,
      buy_in: Number(r.buy_in) || 0,
      cash_out: Number(r.cash_out) || 0,
    })),
  );

  if (players.length === 0) {
    return (
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="game_id" value={gameId} />
        <input type="hidden" name="rows" value="[]" />
        <p className="text-muted">
          No approved players in this game. You can still close it.
        </p>
        <FormMessage error={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? "Closing…" : "Close game"}
        </Button>
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="game_id" value={gameId} />
      <input type="hidden" name="rows" value={serialized} />

      {rows.map((row, i) => {
        const net = (Number(row.cash_out) || 0) - (Number(row.buy_in) || 0);
        return (
          <Card key={row.player_id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{row.nickname}</span>
              <span
                className={
                  net > 0
                    ? "text-positive"
                    : net < 0
                      ? "text-negative"
                      : "text-muted"
                }
              >
                {formatMoney(net)}
              </span>
            </div>

            <div>
              <Label htmlFor={`member-${i}`}>Ledger player</Label>
              <select
                id={`member-${i}`}
                value={row.member_id}
                onChange={(e) => update(i, { member_id: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
              >
                <option value="">+ New player “{row.nickname}”</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor={`buyin-${i}`} className="mb-0">Buy-in</Label>
                  <button type="button" onClick={() => setActiveCounter({rowIdx: i, field: "buy_in"})} className="text-xs text-accent">🧮 Count</button>
                </div>
                <Input
                  id={`buyin-${i}`}
                  inputMode="decimal"
                  value={row.buy_in}
                  onChange={(e) => update(i, { buy_in: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor={`cashout-${i}`} className="mb-0">Cash-out</Label>
                  <button type="button" onClick={() => setActiveCounter({rowIdx: i, field: "cash_out"})} className="text-xs text-accent">🧮 Count</button>
                </div>
                <Input
                  id={`cashout-${i}`}
                  inputMode="decimal"
                  value={row.cash_out}
                  onChange={(e) => update(i, { cash_out: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
          </Card>
        );
      })}

      <Card className="flex items-center justify-between text-sm">
        <span className="text-muted">
          Buy-ins {formatMoney(totalBuyIn)} · Cash-outs {formatMoney(totalCashOut)}
        </span>
        <span className={balanced ? "text-positive" : "text-negative"}>
          {balanced ? "Balanced ✓" : `Off by ${formatMoney(diff)}`}
        </span>
      </Card>

      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Close game & save to ledger"}
      </Button>

      {activeCounter && (
        <ChipCounter
          denominations={denominations}
          onApply={(total) => {
            update(activeCounter.rowIdx, { [activeCounter.field]: String(total) });
            setActiveCounter(null);
          }}
          onCancel={() => setActiveCounter(null)}
        />
      )}
    </form>
  );
}

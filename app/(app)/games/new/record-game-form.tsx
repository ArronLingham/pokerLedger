"use client";

import { useActionState, useMemo, useState } from "react";
import { createGame, type GameState } from "../actions";
import { Button, Card, FormMessage, Input, Label } from "@/components/ui";
import { formatMoney } from "@/lib/ledger";
import type { Member } from "@/lib/types";

const initial: GameState = {};

type Row = { member_id: string; buy_in: string; cash_out: string };

export function RecordGameForm({ members }: { members: Member[] }) {
  const [state, formAction, pending] = useActionState(createGame, initial);
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<Row[]>([
    { member_id: "", buy_in: "", cash_out: "" },
  ]);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { member_id: "", buy_in: "", cash_out: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
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
    rows
      .filter((r) => r.member_id)
      .map((r) => ({
        member_id: r.member_id,
        buy_in: Number(r.buy_in) || 0,
        cash_out: Number(r.cash_out) || 0,
      })),
  );

  const used = new Set(rows.map((r) => r.member_id).filter(Boolean));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="rows" value={serialized} />

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="name">Game name</Label>
            <Input id="name" name="name" placeholder="Friday night" />
          </div>
          <div>
            <Label htmlFor="played_on">Date</Label>
            <Input id="played_on" name="played_on" type="date" defaultValue={today} />
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {rows.map((row, i) => {
          const net =
            (Number(row.cash_out) || 0) - (Number(row.buy_in) || 0);
          return (
            <Card key={i} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <select
                  value={row.member_id}
                  onChange={(e) => update(i, { member_id: e.target.value })}
                  className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
                >
                  <option value="">Select player…</option>
                  {members.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      disabled={used.has(m.id) && m.id !== row.member_id}
                    >
                      {m.name}
                    </option>
                  ))}
                </select>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="px-2 text-muted hover:text-negative"
                    aria-label="Remove row"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-3 items-end gap-2">
                <div>
                  <Label htmlFor={`buyin-${i}`}>Buy-in</Label>
                  <Input
                    id={`buyin-${i}`}
                    inputMode="decimal"
                    value={row.buy_in}
                    onChange={(e) => update(i, { buy_in: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label htmlFor={`cashout-${i}`}>Cash-out</Label>
                  <Input
                    id={`cashout-${i}`}
                    inputMode="decimal"
                    value={row.cash_out}
                    onChange={(e) => update(i, { cash_out: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="pb-2.5 text-right text-sm font-medium">
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
              </div>
            </Card>
          );
        })}
      </div>

      <Button type="button" variant="secondary" onClick={addRow}>
        + Add player
      </Button>

      <Card className="flex items-center justify-between text-sm">
        <span className="text-muted">
          Buy-ins {formatMoney(totalBuyIn)} · Cash-outs {formatMoney(totalCashOut)}
        </span>
        <span className={balanced ? "text-positive" : "text-negative"}>
          {balanced ? "Balanced ✓" : `Off by ${formatMoney(diff)}`}
        </span>
      </Card>

      {!balanced ? (
        <p className="text-xs text-muted">
          Tip: total cash-outs should equal total buy-ins. You can still save —
          this is just a sanity check.
        </p>
      ) : null}

      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save game"}
      </Button>
    </form>
  );
}

"use client";

import { clsx } from "@/lib/clsx";
import { formatMoney } from "@/lib/ledger";
import { Card } from "@/components/ui";
import type { Game, GamePlayer, Hand, HandPlayer } from "@/lib/types";

export function TableBoard({
  game,
  players,
  hand,
  handPlayers,
  viewerPlayerId,
}: {
  game: Game;
  players: GamePlayer[];
  hand: Hand | null;
  handPlayers: HandPlayer[];
  viewerPlayerId?: string;
}) {
  const hpByPlayer = new Map(handPlayers.map((hp) => [hp.player_id, hp]));

  return (
    <div className="flex flex-col gap-3">
      {/* Pot / street header */}
      <Card className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Pot</div>
          <div className="text-2xl font-semibold text-accent">
            {formatMoney(hand?.pot ?? 0)}
          </div>
        </div>
        <div className="text-right text-sm text-muted">
          {hand ? (
            <>
              <div className="capitalize">{hand.street}</div>
              <div>Hand #{hand.hand_number}</div>
            </>
          ) : (
            <div>No hand in progress</div>
          )}
          <div>
            Blinds {formatMoney(game.small_blind)}/{formatMoney(game.big_blind)}
          </div>
        </div>
      </Card>

      {/* Seats */}
      <div className="flex flex-col gap-2">
        {players.map((p) => {
          const hp = hpByPlayer.get(p.id);
          const isDealer = hand ? p.seat === hand.dealer_seat : false;
          const isTurn = hand?.current_turn === p.id;
          const isViewer = viewerPlayerId === p.id;
          const folded = hp?.status === "folded";
          const allIn = hp?.status === "all_in";

          return (
            <div
              key={p.id}
              className={clsx(
                "flex items-center justify-between rounded-xl border px-4 py-3",
                isTurn ? "border-accent bg-accent/10" : "border-border bg-surface",
                folded && "opacity-40",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {p.nickname || "Player"}
                  {isViewer ? (
                    <span className="ml-1 text-xs text-muted">(you)</span>
                  ) : null}
                </span>
                {isDealer ? (
                  <span className="rounded-full bg-foreground/90 px-1.5 py-0.5 text-[10px] font-bold text-background">
                    D
                  </span>
                ) : null}
                {allIn ? (
                  <span className="rounded-full bg-negative/20 px-1.5 py-0.5 text-[10px] font-semibold text-negative">
                    ALL-IN
                  </span>
                ) : null}
                {folded ? (
                  <span className="text-[10px] uppercase text-muted">folded</span>
                ) : null}
              </div>

              <div className="flex items-center gap-4 text-right">
                {hp && hp.committed_street > 0 ? (
                  <div className="text-xs text-muted">
                    bet{" "}
                    <span className="text-foreground">
                      {formatMoney(hp.committed_street)}
                    </span>
                  </div>
                ) : null}
                <div>
                  <div className="text-xs text-muted">stack</div>
                  <div className="font-mono font-semibold">
                    {formatMoney(p.stack)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { clsx } from "@/lib/clsx";
import { formatMoney, formatChipsString } from "@/lib/ledger";
import { Card } from "@/components/ui";
import { PlayingCard } from "@/components/playing-card";
import type { Game, GamePlayer, Hand, HandPlayer, SidePot } from "@/lib/types";

export function TableBoard({
  game,
  players,
  hand,
  handPlayers,
  sidePots,
  viewerPlayerId,
  showChips,
}: {
  game: Game;
  players: GamePlayer[];
  hand: Hand | null;
  handPlayers: HandPlayer[];
  sidePots?: SidePot[];
  viewerPlayerId?: string;
  showChips?: boolean;
}) {
  const hpByPlayer = new Map(handPlayers.map((hp) => [hp.player_id, hp]));

  return (
    <div className="flex flex-col gap-3">
      {/* Pot / street header */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Pot</div>
            <div className="text-2xl font-semibold text-accent">
              {showChips && game.denominations ? formatChipsString(hand?.pot ?? 0, game.denominations) : formatMoney(hand?.pot ?? 0)}
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
        </div>

        {/* Side pots breakdown */}
        {sidePots && sidePots.length > 1 ? (
          <div className="mt-1 border-t border-border pt-2 text-xs">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">
              Pot breakdown ({sidePots.length} pots)
            </div>
            <div className="flex flex-col gap-1">
              {sidePots.map((sp) => {
                const names = sp.eligible_player_ids
                  .map((id) => players.find((p) => p.id === id)?.nickname ?? "Player")
                  .join(", ");
                return (
                  <div key={sp.pot_index} className="flex justify-between items-center text-muted">
                    <span>
                      {sp.pot_index === 0 ? "Main Pot" : `Side Pot ${sp.pot_index}`}:{" "}
                      <span className="font-semibold text-foreground">
                        {showChips && game.denominations ? formatChipsString(sp.amount, game.denominations) : formatMoney(sp.amount)}
                      </span>
                    </span>
                    <span className="truncate max-w-[140px] text-[11px] text-muted/80">
                      {names}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Community Cards (if digital mode) */}
        {game.digital_cards && hand && hand.board && hand.board.length > 0 ? (
          <div className="mt-2 flex justify-center gap-2 border-t border-border pt-3">
            {hand.board.map((card, i) => (
              <PlayingCard key={i} card={card} className="w-12 sm:w-16" />
            ))}
          </div>
        ) : null}
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
                      {showChips && game.denominations ? formatChipsString(hp.committed_street, game.denominations) : formatMoney(hp.committed_street)}
                    </span>
                  </div>
                ) : null}
                <div>
                  <div className="text-xs text-muted">stack</div>
                  <div className="font-mono font-semibold">
                    {showChips && game.denominations ? formatChipsString(p.stack, game.denominations) : formatMoney(p.stack)}
                  </div>
                </div>
              </div>

              {/* Showdown: reveal hole cards */}
              {game.digital_cards && hand?.status === "awaiting_showdown" && hp?.hole_cards ? (
                <div className="ml-4 flex gap-1 border-l border-border pl-4">
                  {hp.hole_cards.map((card, i) => (
                    <PlayingCard key={i} card={card} className="w-10 sm:w-12" />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

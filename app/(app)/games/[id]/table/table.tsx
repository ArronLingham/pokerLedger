"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/ledger";
import { useLiveGame } from "@/components/live/use-live-game";
import { TableBoard } from "@/components/live/table-board";
import { ActionBar, type ActionKind } from "@/components/live/action-bar";

export function HostTable({ gameId }: { gameId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const { game, players, hand, handPlayers, loading, refresh } =
    useLiveGame(gameId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [buyIn, setBuyIn] = useState("100");
  const [winners, setWinners] = useState<string[]>([]);

  if (loading || !game) {
    return <p className="text-muted">Loading table…</p>;
  }

  async function run(fn: () => Promise<{ error: unknown }>) {
    setBusy(true);
    setError(undefined);
    const { error } = await fn();
    if (error) setError(String((error as { message?: string })?.message ?? error));
    await refresh();
    setBusy(false);
  }

  const withChips = players.filter((p) => p.stack > 0);
  const noHand = !hand || hand.status === "complete";
  const currentHp = hand
    ? handPlayers.find((hp) => hp.player_id === hand.current_turn)
    : undefined;
  const currentPlayer = players.find((p) => p.id === hand?.current_turn);
  const inHand = handPlayers.filter(
    (hp) => hp.status === "active" || hp.status === "all_in",
  );

  async function giveChipsAll() {
    const amt = Number(buyIn) || 0;
    if (amt <= 0) return;
    await run(async () => {
      for (const p of players) {
        await supabase
          .from("game_players")
          .update({ stack: p.stack + amt, buy_in: p.buy_in + amt })
          .eq("id", p.id);
      }
      return { error: null };
    });
  }

  async function rebuy(playerId: string, current: { stack: number; buy_in: number }) {
    const amt = Number(buyIn) || 0;
    if (amt <= 0) return;
    await run(async () => {
      const { error } = await supabase
        .from("game_players")
        .update({ stack: current.stack + amt, buy_in: current.buy_in + amt })
        .eq("id", playerId);
      return { error };
    });
  }

  async function setBlinds(sb: number, bb: number) {
    await run(async () => {
      const { error } = await supabase
        .from("games")
        .update({ small_blind: sb, big_blind: bb })
        .eq("id", gameId);
      return { error };
    });
  }

  async function startHand() {
    await run(async () => supabase.rpc("start_hand", { p_game_id: gameId }));
  }

  async function act(action: ActionKind, amountTo?: number) {
    if (!hand) return;
    await run(async () =>
      supabase.rpc("player_action", {
        p_hand_id: hand.id,
        p_action: action,
        p_amount: amountTo ?? 0,
      }),
    );
  }

  async function declareWinners() {
    if (!hand || winners.length === 0) return;
    await run(async () =>
      supabase.rpc("declare_winners", {
        p_hand_id: hand.id,
        p_winner_ids: winners,
      }),
    );
    setWinners([]);
  }

  return (
    <>
      <PageHeader
        title={game.name || "Live game"}
        subtitle="Host controls"
        action={
          <Button
            variant="secondary"
            className="px-3 py-2 text-sm"
            onClick={() => router.push(`/games/${gameId}/close`)}
          >
            End game
          </Button>
        }
      />

      <TableBoard
        game={game}
        players={players}
        hand={hand}
        handPlayers={handPlayers}
      />

      {error ? (
        <p className="mt-3 rounded-lg bg-negative/15 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      ) : null}

      {/* Between hands: buy-ins, blinds, start */}
      {noHand ? (
        <div className="mt-4 flex flex-col gap-3">
          <Card className="flex flex-col gap-3">
            <div className="text-sm font-medium">Chips</div>
            <div className="flex items-center gap-2">
              <Input
                inputMode="decimal"
                value={buyIn}
                onChange={(e) => setBuyIn(e.target.value)}
                className="w-28"
              />
              <Button variant="secondary" onClick={giveChipsAll} disabled={busy}>
                Give everyone
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {p.nickname || "Player"} · {formatMoney(p.stack)}
                  </span>
                  <button
                    className="text-xs text-accent hover:underline"
                    onClick={() => rebuy(p.id, p)}
                    disabled={busy}
                  >
                    + rebuy
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex items-center justify-between">
            <span className="text-sm">
              Blinds {formatMoney(game.small_blind)}/{formatMoney(game.big_blind)}
            </span>
            <div className="flex gap-2 text-xs">
              <button
                className="text-accent hover:underline"
                onClick={() => setBlinds(1, 2)}
              >
                1/2
              </button>
              <button
                className="text-accent hover:underline"
                onClick={() => setBlinds(5, 10)}
              >
                5/10
              </button>
              <button
                className="text-accent hover:underline"
                onClick={() => setBlinds(25, 50)}
              >
                25/50
              </button>
            </div>
          </Card>

          <Button onClick={startHand} disabled={busy || withChips.length < 2}>
            {withChips.length < 2 ? "Give at least 2 players chips" : "Deal next hand"}
          </Button>
        </div>
      ) : null}

      {/* Betting: host can act for whoever is up */}
      {hand && hand.status === "betting" && currentHp && currentPlayer ? (
        <div className="mt-4">
          <p className="mb-2 text-center text-sm text-muted">
            Action on <span className="text-foreground">{currentPlayer.nickname}</span>
          </p>
          <ActionBar
            stack={currentPlayer.stack}
            committedStreet={currentHp.committed_street}
            currentBet={hand.current_bet}
            lastRaise={hand.last_raise}
            bigBlind={game.big_blind}
            pot={hand.pot}
            busy={busy}
            onAction={act}
          />
        </div>
      ) : null}

      {/* Showdown: declare winner(s) */}
      {hand && hand.status === "awaiting_showdown" ? (
        <Card className="mt-4 flex flex-col gap-3">
          <div className="text-sm font-medium">
            Who won? Select the winning player(s).
          </div>
          {inHand.map((hp) => {
            const p = players.find((pl) => pl.id === hp.player_id);
            const checked = winners.includes(hp.player_id);
            return (
              <label
                key={hp.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setWinners((w) =>
                      e.target.checked
                        ? [...w, hp.player_id]
                        : w.filter((id) => id !== hp.player_id),
                    )
                  }
                />
                {p?.nickname || "Player"}
              </label>
            );
          })}
          <Button onClick={declareWinners} disabled={busy || winners.length === 0}>
            Award {formatMoney(hand.pot)}
          </Button>
        </Card>
      ) : null}
    </>
  );
}

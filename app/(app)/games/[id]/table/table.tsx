"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/ledger";
import { useLiveGame } from "@/components/live/use-live-game";
import { TableBoard } from "@/components/live/table-board";
import { ActionBar, type ActionKind } from "@/components/live/action-bar";
import { evaluateShowdown } from "../../actions";
import { ActionLog } from "@/components/live/action-log";
import { ChipCounter } from "@/components/chip-counter";

export function HostTable({ gameId }: { gameId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const { game, players, hand, handPlayers, handActions, sidePots, loading, refresh } =
    useLiveGame(gameId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [buyIn, setBuyIn] = useState("100");
  const [winnersByPot, setWinnersByPot] = useState<Record<number, string[]>>({});
  const [showChips, setShowChips] = useState(false);
  const [showCounter, setShowCounter] = useState(false);

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

  async function setDenominations(denoms: { value: number; color?: string; label?: string }[] | null) {
    await run(async () => {
      const { error } = await supabase
        .from("games")
        .update({ denominations: denoms })
        .eq("id", gameId);
      return { error };
    });
  }

  async function setDigitalCards(digital: boolean) {
    await run(async () => {
      const { error } = await supabase
        .from("games")
        .update({ digital_cards: digital })
        .eq("id", gameId);
      return { error };
    });
  }

  async function startHand() {
    setWinnersByPot({});
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
    if (!hand) return;
    const potsToEvaluate = sidePots.length > 0 ? sidePots : [
      { pot_index: 0, amount: hand.pot, eligible_player_ids: inHand.map((hp) => hp.player_id) }
    ];

    const payload = potsToEvaluate.map((sp) => {
      const selected = winnersByPot[sp.pot_index] || [];
      // Auto-assign single eligible player if no selection was made
      const finalWinners = sp.eligible_player_ids.length === 1 ? sp.eligible_player_ids : selected;
      return {
        pot_index: sp.pot_index,
        winner_ids: finalWinners,
      };
    });

    // Validation: make sure all pots have at least 1 winner
    const missing = payload.find((p) => p.winner_ids.length === 0);
    if (missing) {
      setError(`Please select a winner for ${missing.pot_index === 0 ? "Main Pot" : `Side Pot ${missing.pot_index}`}`);
      return;
    }

    await run(async () =>
      supabase.rpc("declare_winners", {
        p_hand_id: hand.id,
        p_winners: payload,
      }),
    );
    setWinnersByPot({});
  }

  async function autoEvaluateWinners() {
    if (!hand) return;
    setBusy(true);
    setError(undefined);

    const pots = sidePots.length > 0 ? sidePots : [
      { pot_index: 0, amount: hand.pot, eligible_player_ids: inHand.map((hp) => hp.player_id) }
    ];

    const res = await evaluateShowdown(hand.id, pots.map(sp => ({
      pot_index: sp.pot_index,
      eligible_player_ids: sp.eligible_player_ids,
    })));

    if (res.error) {
      setError(res.error);
    } else if (res.results) {
      const newWinners: Record<number, string[]> = {};
      for (const p of res.results) {
        newWinners[p.pot_index] = p.winner_ids;
      }
      setWinnersByPot(newWinners);
    }
    setBusy(false);
  }

  const potsToRender = sidePots.length > 0 ? sidePots : (hand && hand.status === "awaiting_showdown" ? [
    { pot_index: 0, amount: hand.pot, eligible_player_ids: inHand.map((hp) => hp.player_id) }
  ] : []);

  return (
    <>
      <PageHeader
        title={game.name || "Live game"}
        subtitle="Host controls"
        action={
          <div className="flex items-center gap-2">
            {game.denominations && game.denominations.length > 0 && (
              <Button
                variant="secondary"
                className="px-3 py-2 text-sm"
                onClick={() => setShowChips(!showChips)}
              >
                {showChips ? "Show Value" : "Show Chips"}
              </Button>
            )}
            <Button
              variant="secondary"
              className="px-3 py-2 text-sm"
              onClick={() => router.push(`/games/${gameId}/close`)}
            >
              End game
            </Button>
          </div>
        }
      />

      <TableBoard
        game={game}
        players={players}
        hand={hand}
        handPlayers={handPlayers}
        sidePots={sidePots}
        showChips={showChips}
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
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Chips</div>
              <button type="button" onClick={() => setShowCounter(true)} className="text-xs text-accent">🧮 Count</button>
            </div>
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

          <Card className="flex items-center justify-between">
            <span className="text-sm">Denominations</span>
            <div className="flex gap-2 text-xs">
              <button
                className="text-accent hover:underline"
                onClick={() => setDenominations([{value: 1, label: "⚪"}, {value: 5, label: "🔴"}, {value: 25, label: "🟢"}])}
              >
                1/5/25
              </button>
              <button
                className="text-accent hover:underline"
                onClick={() => setDenominations([{value: 5, label: "🔴"}, {value: 25, label: "🟢"}, {value: 100, label: "⚫"}])}
              >
                5/25/100
              </button>
              <button
                className="text-accent hover:underline"
                onClick={() => setDenominations(null)}
              >
                Off
              </button>
            </div>
          </Card>

          <Card className="flex items-center justify-between">
            <span className="text-sm">Cards</span>
            <div className="flex gap-2 text-xs">
              <button
                className={clsx("hover:underline", !game.digital_cards ? "text-accent font-semibold" : "text-muted")}
                onClick={() => setDigitalCards(false)}
              >
                Physical
              </button>
              <button
                className={clsx("hover:underline", game.digital_cards ? "text-accent font-semibold" : "text-muted")}
                onClick={() => setDigitalCards(true)}
              >
                Digital (App Deals)
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
            showChips={showChips}
            denominations={game.denominations}
          />
        </div>
      ) : null}

      {/* Showdown: declare winner(s) per pot */}
      {hand && hand.status === "awaiting_showdown" ? (
        <Card className="mt-4 flex flex-col gap-4">
          <div className="text-sm font-semibold text-foreground">
            Showdown — Declare Pot Winner(s)
          </div>

          <div className="flex flex-col gap-4">
            {potsToRender.map((sp) => {
              const potLabel = sp.pot_index === 0 ? "Main Pot" : `Side Pot ${sp.pot_index}`;
              const isSingleEligible = sp.eligible_player_ids.length === 1;

              return (
                <div key={sp.pot_index} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {potLabel}: <span className="font-semibold text-accent">{formatMoney(sp.amount)}</span>
                    </span>
                    {isSingleEligible ? (
                      <span className="text-xs text-muted italic">Uncontested (Auto-awarded)</span>
                    ) : null}
                  </div>

                  {isSingleEligible ? (
                    <div className="text-xs text-muted pl-2">
                      Winner:{" "}
                      <span className="text-foreground font-medium">
                        {players.find((pl) => pl.id === sp.eligible_player_ids[0])?.nickname ?? "Player"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3 pl-2 pt-1">
                      {sp.eligible_player_ids.map((pid) => {
                        const p = players.find((pl) => pl.id === pid);
                        const checked = (winnersByPot[sp.pot_index] || []).includes(pid);
                        return (
                          <label key={pid} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const current = winnersByPot[sp.pot_index] || [];
                                const updated = e.target.checked
                                  ? [...current, pid]
                                  : current.filter((id) => id !== pid);
                                setWinnersByPot({ ...winnersByPot, [sp.pot_index]: updated });
                              }}
                            />
                            <span>{p?.nickname || "Player"}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 mt-1">
            {game.digital_cards && (
              <Button onClick={autoEvaluateWinners} disabled={busy} variant="secondary" className="flex-1">
                Auto-Evaluate
              </Button>
            )}
            <Button onClick={declareWinners} disabled={busy} className="flex-1">
              Award Winners
            </Button>
          </div>
        </Card>
      ) : null}

      <ActionLog handActions={handActions} players={players} />

      {showCounter && (
        <ChipCounter
          denominations={game.denominations}
          onApply={(total) => {
            setBuyIn(String(total));
            setShowCounter(false);
          }}
          onCancel={() => setShowCounter(false)}
        />
      )}
    </>
  );
}


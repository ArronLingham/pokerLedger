"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";
import { useLiveGame } from "@/components/live/use-live-game";
import { TableBoard } from "@/components/live/table-board";
import { ActionBar, type ActionKind } from "@/components/live/action-bar";
import type { Game, GamePlayer } from "@/lib/types";

function Status({
  title,
  body,
  tone = "wait",
  nickname,
  gameName,
}: {
  title: string;
  body: string;
  tone?: "wait" | "ok" | "bad";
  nickname: string;
  gameName: string;
}) {
  const dot =
    tone === "ok"
      ? "bg-positive"
      : tone === "bad"
        ? "bg-negative"
        : "bg-accent animate-pulse";
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <span className="text-sm text-muted">Playing as {nickname}</span>
        </div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-muted">{body}</p>
        <p className="mt-4 text-xs text-muted">{gameName}</p>
      </Card>
    </main>
  );
}

export function PlayView({
  game: initialGame,
  player,
}: {
  game: Game;
  player: GamePlayer;
}) {
  const supabase = createClient();
  const { game, players, hand, handPlayers, loading } = useLiveGame(
    initialGame.id,
  );
  const [busy, setBusy] = useState(false);

  const nickname = player.nickname || "Player";
  const gameName = (game ?? initialGame).name;

  // Approval / lifecycle states first.
  if (player.status === "rejected") {
    return <Status title="Not approved" body="The host didn’t add you to this game." tone="bad" nickname={nickname} gameName={gameName} />;
  }
  if (player.status === "pending") {
    return <Status title="Waiting for approval" body="The host needs to let you in. Hang tight…" nickname={nickname} gameName={gameName} />;
  }

  const status = (game ?? initialGame).status;
  if (status === "finished") {
    return <Status title="Game over" body="This game has ended. Check with the host for results." tone="ok" nickname={nickname} gameName={gameName} />;
  }
  if (status === "lobby") {
    return <Status title="You’re in!" body="Waiting for the host to start the game." tone="ok" nickname={nickname} gameName={gameName} />;
  }

  if (loading || !game) {
    return <Status title="Loading…" body="Getting the table." nickname={nickname} gameName={gameName} />;
  }

  const myHp = handPlayers.find((hp) => hp.player_id === player.id);
  const myPlayer = players.find((p) => p.id === player.id) ?? player;
  const isMyTurn =
    hand?.status === "betting" && hand.current_turn === player.id;
  const currentPlayer = players.find((p) => p.id === hand?.current_turn);

  async function act(action: ActionKind, amountTo?: number) {
    if (!hand) return;
    setBusy(true);
    await supabase.rpc("player_action", {
      p_hand_id: hand.id,
      p_action: action,
      p_amount: amountTo ?? 0,
    });
    setBusy(false);
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24">
      <div className="mb-3 text-center text-sm text-muted">
        Playing as <span className="text-foreground">{nickname}</span>
      </div>

      <TableBoard
        game={game}
        players={players}
        hand={hand}
        handPlayers={handPlayers}
        viewerPlayerId={player.id}
      />

      {!hand || hand.status === "complete" ? (
        <p className="mt-6 text-center text-muted">
          Waiting for the host to deal the next hand…
        </p>
      ) : hand.status === "awaiting_showdown" ? (
        <p className="mt-6 text-center text-muted">
          Showdown — waiting for the host to declare the winner.
        </p>
      ) : isMyTurn && myHp ? (
        <div className="mt-4">
          <p className="mb-2 text-center text-sm font-medium text-accent">
            Your turn
          </p>
          <ActionBar
            stack={myPlayer.stack}
            committedStreet={myHp.committed_street}
            currentBet={hand.current_bet}
            lastRaise={hand.last_raise}
            bigBlind={game.big_blind}
            pot={hand.pot}
            busy={busy}
            onAction={act}
          />
        </div>
      ) : myHp && myHp.status !== "folded" ? (
        <p className="mt-6 text-center text-muted">
          Waiting for{" "}
          <span className="text-foreground">
            {currentPlayer?.nickname ?? "the next player"}
          </span>
          …
        </p>
      ) : (
        <p className="mt-6 text-center text-muted">
          {myHp?.status === "folded"
            ? "You folded this hand."
            : "Sitting out this hand."}
        </p>
      )}
    </main>
  );
}

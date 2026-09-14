"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";
import { useLiveGame } from "@/components/live/use-live-game";
import { TableBoard } from "@/components/live/table-board";
import { ActionBar, type ActionKind } from "@/components/live/action-bar";
import { ActionLog } from "@/components/live/action-log";
import { PlayingCard } from "@/components/playing-card";
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
  const {
    game,
    players,
    roster,
    hand,
    handPlayers,
    handActions,
    sidePots,
    myHoleCards,
    showdownCards,
    loading,
  } = useLiveGame(initialGame.id);
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [showChips, setShowChips] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);

  const livePlayer = roster.find((p) => p.id === player.id) ?? player;
  const nickname = livePlayer.nickname || "Player";
  const gameName = (game ?? initialGame).name;

  // Approval / lifecycle states first.
  if (livePlayer.status === "rejected") {
    return <Status title="Not approved" body="The host didn’t add you to this game." tone="bad" nickname={nickname} gameName={gameName} />;
  }
  if (livePlayer.status === "pending") {
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
    setActionError(undefined);
    const { error } = await supabase.rpc("player_action", {
      p_hand_id: hand.id,
      p_action: action,
      p_amount: amountTo ?? 0,
    });
    if (error) setActionError(error.message);
    setBusy(false);
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24">
      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <div>
          Playing as <span className="text-foreground">{nickname}</span>
        </div>
        {game.denominations && game.denominations.length > 0 && (
          <button
            className="text-accent hover:underline text-xs"
            onClick={() => setShowChips(!showChips)}
          >
            {showChips ? "Show Value" : "Show Chips"}
          </button>
        )}
      </div>

      {actionError && <p role="alert" className="mb-3 text-negative">{actionError}</p>}
      <TableBoard
        game={game}
        players={players}
        hand={hand}
        handPlayers={handPlayers}
        sidePots={sidePots}
        viewerPlayerId={player.id}
        showChips={showChips}
        showdownCards={showdownCards}
      />

      {/* Digital Hole Cards */}
      {game.digital_cards && myHoleCards.length > 0 ? (
        <div className="mt-4 flex flex-col items-center">
          <button
            aria-label="Hold to peek at your cards"
            onPointerCancel={() => setIsPeeking(false)}
            onBlur={() => setIsPeeking(false)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") { e.preventDefault(); setIsPeeking(true); }
            }}
            onKeyUp={() => setIsPeeking(false)}
            onPointerDown={() => setIsPeeking(true)}
            onPointerUp={() => setIsPeeking(false)}
            onPointerLeave={() => setIsPeeking(false)}
            onContextMenu={(e) => e.preventDefault()}
            className="flex gap-2 p-2 bg-surface/80 backdrop-blur-md rounded-2xl border border-border shadow-xl transition-transform active:scale-95 touch-none select-none"
          >
            {myHoleCards.map((card, i) => (
              <PlayingCard key={i} card={card} hidden={!isPeeking} className="w-20 shadow-sm" />
            ))}
          </button>
          {!isPeeking && (
            <div className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-muted/80 pointer-events-none">
              Hold to peek
            </div>
          )}
        </div>
      ) : null}

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
            showChips={showChips}
            denominations={game.denominations}
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

      <ActionLog handActions={handActions} players={players} />

    </main>
  );
}


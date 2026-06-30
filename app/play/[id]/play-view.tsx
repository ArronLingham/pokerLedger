"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";
import type { Game, GamePlayer, GameStatus, PlayerStatus } from "@/lib/types";

export function PlayView({
  game,
  player,
}: {
  game: Game;
  player: GamePlayer;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>(player.status);
  const [gameStatus, setGameStatus] = useState<GameStatus>(game.status);

  useEffect(() => {
    const channel = supabase
      .channel(`play:${game.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_players", filter: `id=eq.${player.id}` },
        (payload) => setPlayerStatus((payload.new as GamePlayer).status),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${game.id}` },
        (payload) => setGameStatus((payload.new as Game).status),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, game.id, player.id]);

  let title: string;
  let body: string;
  let tone: "wait" | "ok" | "bad" = "wait";

  if (playerStatus === "rejected") {
    title = "Not approved";
    body = "The host didn’t add you to this game.";
    tone = "bad";
  } else if (playerStatus === "left") {
    title = "You left this game";
    body = "Ask the host for the code if you want to rejoin.";
    tone = "bad";
  } else if (playerStatus === "pending") {
    title = "Waiting for approval";
    body = "The host needs to let you in. Hang tight…";
    tone = "wait";
  } else if (gameStatus === "finished") {
    title = "Game over";
    body = "This game has ended. Check with the host for results.";
    tone = "ok";
  } else if (gameStatus === "active") {
    title = "Game in progress";
    body = "You’re in. Chip tracking is coming in a future update.";
    tone = "ok";
  } else {
    title = "You’re in!";
    body = "Waiting for the host to start the game.";
    tone = "ok";
  }

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
          <span className="text-sm text-muted">
            Playing as {player.nickname || "Player"}
          </span>
        </div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-muted">{body}</p>
        <p className="mt-4 text-xs text-muted">{game.name}</p>
      </Card>
    </main>
  );
}

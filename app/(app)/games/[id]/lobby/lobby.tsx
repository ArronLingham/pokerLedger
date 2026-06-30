"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, PageHeader } from "@/components/ui";
import type { Game, GamePlayer } from "@/lib/types";

export function Lobby({
  game,
  initialPlayers,
  joinUrl,
}: {
  game: Game;
  initialPlayers: GamePlayer[];
  joinUrl: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<GamePlayer[]>(initialPlayers);
  const [status, setStatus] = useState(game.status);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("game_players")
      .select("*")
      .eq("game_id", game.id)
      .order("joined_at");
    if (data) setPlayers(data as GamePlayer[]);

    const { data: g } = await supabase
      .from("games")
      .select("status")
      .eq("id", game.id)
      .single();
    if (g) setStatus(g.status as Game["status"]);
  }, [supabase, game.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`lobby:${game.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${game.id}` },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${game.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, game.id, refresh]);

  async function setPlayer(id: string, newStatus: GamePlayer["status"]) {
    setPlayers((ps) =>
      ps.map((p) => (p.id === id ? { ...p, status: newStatus } : p)),
    );
    await supabase.from("game_players").update({ status: newStatus }).eq("id", id);
  }

  async function start() {
    setStatus("active");
    await supabase.from("games").update({ status: "active" }).eq("id", game.id);
  }

  function endGame() {
    router.push(`/games/${game.id}/close`);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  const pending = players.filter((p) => p.status === "pending");
  const approved = players.filter((p) => p.status === "approved");

  return (
    <>
      <PageHeader
        title={game.name || "Live game"}
        subtitle={status === "lobby" ? "Waiting to start" : "Game in progress"}
      />

      {/* Join card */}
      <Card className="flex flex-col items-center gap-4 text-center">
        {joinUrl ? (
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={joinUrl} size={168} />
          </div>
        ) : null}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Join code</div>
          <div className="font-mono text-3xl tracking-[0.3em]">
            {game.join_code}
          </div>
        </div>
        <Button variant="secondary" onClick={copyLink} className="w-full">
          {copied ? "Copied ✓" : "Copy join link"}
        </Button>
      </Card>

      {/* Pending approvals */}
      {pending.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Waiting for approval ({pending.length})
          </h2>
          <div className="flex flex-col gap-2">
            {pending.map((p) => (
              <Card key={p.id} className="flex items-center justify-between py-3">
                <span className="font-medium">
                  {p.nickname || "Guest"}
                  <span className="ml-2 text-xs text-muted">guest</span>
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setPlayer(p.id, "approved")}
                    className="px-3 py-1.5 text-xs"
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setPlayer(p.id, "rejected")}
                    className="px-3 py-1.5 text-xs"
                  >
                    Reject
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Approved players */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          At the table ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <p className="text-sm text-muted">
            No one yet — share the code above to get players in.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {approved.map((p) => (
              <Card key={p.id} className="flex items-center justify-between py-3">
                <span className="font-medium">{p.nickname || "Player"}</span>
                {p.is_guest ? (
                  <span className="text-xs text-muted">guest</span>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Host controls */}
      <div className="mt-8 flex flex-col gap-3">
        {status === "lobby" ? (
          <Button onClick={start} disabled={approved.length === 0}>
            Start game
          </Button>
        ) : null}
        <Button variant="secondary" onClick={endGame}>
          End game &amp; record results
        </Button>
      </div>
    </>
  );
}

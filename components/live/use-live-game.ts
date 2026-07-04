"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Game, GamePlayer, Hand, HandPlayer } from "@/lib/types";

export type LiveSnapshot = {
  game: Game | null;
  players: GamePlayer[];
  hand: Hand | null;
  handPlayers: HandPlayer[];
  loading: boolean;
};

/**
 * Loads and live-subscribes to a game's table state: the game, its approved
 * players, the current (latest non-complete) hand, and that hand's seats.
 * Any relevant realtime event triggers a full snapshot refetch — simplest and
 * race-free for a home game.
 */
export function useLiveGame(gameId: string): LiveSnapshot & {
  refresh: () => Promise<void>;
} {
  const supabase = useMemo(() => createClient(), []);
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [hand, setHand] = useState<Hand | null>(null);
  const [handPlayers, setHandPlayers] = useState<HandPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [{ data: g }, { data: ps }, { data: h }] = await Promise.all([
      supabase.from("games").select("*").eq("id", gameId).single(),
      supabase
        .from("game_players")
        .select("*")
        .eq("game_id", gameId)
        .eq("status", "approved")
        .order("seat", { nullsFirst: false })
        .order("joined_at"),
      supabase
        .from("hands")
        .select("*")
        .eq("game_id", gameId)
        .order("hand_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setGame((g as Game) ?? null);
    setPlayers((ps as GamePlayer[]) ?? []);
    setHand((h as Hand) ?? null);

    if (h?.id) {
      const { data: hp } = await supabase
        .from("hand_players")
        .select("*")
        .eq("hand_id", h.id)
        .order("seat");
      setHandPlayers((hp as HandPlayer[]) ?? []);
    } else {
      setHandPlayers([]);
    }
    setLoading(false);
  }, [supabase, gameId]);

  useEffect(() => {
    // Initial snapshot load; refresh() sets state asynchronously (after awaits).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const channel = supabase
      .channel(`game:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "hands", filter: `game_id=eq.${gameId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "hand_players" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, gameId, refresh]);

  return { game, players, hand, handPlayers, loading, refresh };
}

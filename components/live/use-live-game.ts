"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Game, GamePlayer, Hand, HandAction, HandPlayer, SidePot } from "@/lib/types";

export type LiveSnapshot = {
  game: Game | null;
  players: GamePlayer[];
  hand: Hand | null;
  handPlayers: HandPlayer[];
  handActions: HandAction[];
  sidePots: SidePot[];
  loading: boolean;
};

/**
 * Loads and live-subscribes to a game's table state: the game, its approved
 * players, the current (latest non-complete) hand, that hand's seats, actions,
 * and active side pots.
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
  const [handActions, setHandActions] = useState<HandAction[]>([]);
  const [sidePots, setSidePots] = useState<SidePot[]>([]);
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
      const [{ data: hp }, { data: ha }, { data: sp }] = await Promise.all([
        supabase
          .from("hand_players")
          .select("*")
          .eq("hand_id", h.id)
          .order("seat"),
        supabase
          .from("hand_actions")
          .select("*")
          .eq("hand_id", h.id)
          .order("created_at", { ascending: true }),
        supabase.rpc("get_side_pots", { p_hand_id: h.id }),
      ]);

      setHandPlayers((hp as HandPlayer[]) ?? []);
      setHandActions((ha as HandAction[]) ?? []);
      setSidePots((sp as SidePot[]) ?? []);
    } else {
      setHandPlayers([]);
      setHandActions([]);
      setSidePots([]);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "hand_actions" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, gameId, refresh]);

  return { game, players, hand, handPlayers, handActions, sidePots, loading, refresh };
}


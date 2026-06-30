import { createClient } from "@/lib/supabase/server";
import {
  netsByMember,
  outstandingBalances,
  suggestSettlements,
} from "@/lib/ledger";
import type { Game, GameResult, Member, Settlement } from "@/lib/types";

export type LedgerData = {
  members: Member[];
  games: Game[];
  results: GameResult[];
  settlements: Settlement[];
  memberById: Map<string, Member>;
  nets: Map<string, number>;
  balances: Map<string, number>;
  suggestions: ReturnType<typeof suggestSettlements>;
};

/** Loads all ledger data for the current host and computes balances. */
export async function loadLedger(): Promise<LedgerData> {
  const supabase = await createClient();

  const [membersRes, gamesRes, resultsRes, settlementsRes] = await Promise.all([
    supabase.from("members").select("*").order("name"),
    supabase.from("games").select("*").order("played_on", { ascending: false }),
    supabase.from("game_results").select("*"),
    supabase
      .from("settlements")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const members = (membersRes.data ?? []) as Member[];
  const games = (gamesRes.data ?? []) as Game[];
  const results = (resultsRes.data ?? []) as GameResult[];
  const settlements = (settlementsRes.data ?? []) as Settlement[];

  const memberById = new Map(members.map((m) => [m.id, m]));
  const memberIds = members.map((m) => m.id);
  const nets = netsByMember(results);
  const balances = outstandingBalances(results, settlements, memberIds);
  const suggestions = suggestSettlements(balances);

  return {
    members,
    games,
    results,
    settlements,
    memberById,
    nets,
    balances,
    suggestions,
  };
}

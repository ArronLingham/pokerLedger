import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Game, GamePlayer } from "@/lib/types";
import { Lobby } from "./lobby";

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single<Game>();

  if (!game) notFound();
  if (game.host_id !== user!.id) redirect("/dashboard");
  if (game.status === "finished") redirect("/ledger");

  const { data: players } = await supabase
    .from("game_players")
    .select("*")
    .eq("game_id", id)
    .order("joined_at");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const joinUrl = game.join_code
    ? `${proto}://${host}/join/${game.join_code}`
    : "";

  return (
    <Lobby
      game={game}
      initialPlayers={(players ?? []) as GamePlayer[]}
      joinUrl={joinUrl}
    />
  );
}

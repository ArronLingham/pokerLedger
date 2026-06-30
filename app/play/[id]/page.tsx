import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import type { Game, GamePlayer } from "@/lib/types";
import { PlayView } from "./play-view";

export default async function PlayPage({
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

  const { data: player } = await supabase
    .from("game_players")
    .select("*")
    .eq("game_id", id)
    .eq("profile_id", user!.id)
    .maybeSingle<GamePlayer>();

  if (!game || !player) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <Card className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">You’re not in this game</h1>
          <p className="mt-2 text-muted">
            Ask the host for the join code to get in.
          </p>
          <Link href="/" className="mt-4 inline-block text-accent hover:underline">
            Go home
          </Link>
        </Card>
      </main>
    );
  }

  return <PlayView game={game} player={player} />;
}

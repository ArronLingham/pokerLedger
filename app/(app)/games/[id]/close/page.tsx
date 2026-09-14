import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import type { Game, GamePlayer, Member } from "@/lib/types";
import { CloseGameForm } from "./close-form";

export default async function CloseGamePage({
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

  const { data: unfinishedHand, error: handError } = await supabase
    .from("hands").select("id").eq("game_id", id).neq("status", "complete").limit(1).maybeSingle();
  if (handError) throw new Error("Could not check whether the current hand has finished.");
  if (unfinishedHand) return (
    <>
      <PageHeader title="Finish the current hand" subtitle="Award the pot before recording cash-outs so every chip is accounted for." />
      <Link href={`/games/${id}/table`} className="text-accent hover:underline">Return to the table</Link>
    </>
  );

  const [{ data: players }, { data: members }] = await Promise.all([
    supabase
      .from("game_players")
      .select("*")
      .eq("game_id", id)
      .eq("status", "approved")
      .order("joined_at"),
    supabase.from("members").select("*").order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="Record results"
        subtitle="Enter each player’s buy-in and cash-out to close the game."
      />
      <CloseGameForm
        gameId={id}
        players={(players ?? []) as GamePlayer[]}
        members={(members ?? []) as Member[]}
        denominations={game.denominations}
      />
    </>
  );
}

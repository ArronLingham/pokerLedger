import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Game } from "@/lib/types";
import { HostTable } from "./table";

export default async function TablePage({
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

  return <HostTable gameId={id} />;
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type GameState = { error?: string };

type RowInput = { member_id: string; buy_in: number; cash_out: number };

export async function createGame(
  _prev: GameState,
  formData: FormData,
): Promise<GameState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const name = String(formData.get("name") ?? "").trim();
  const played_on =
    String(formData.get("played_on") ?? "") ||
    new Date().toISOString().slice(0, 10);

  let rows: RowInput[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "Could not read the results." };
  }

  const valid = rows.filter((r) => r.member_id);
  if (valid.length === 0) {
    return { error: "Add at least one player's result." };
  }

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .insert({ host_id: user.id, name, played_on, status: "finished" })
    .select("id")
    .single();
  if (gameErr || !game) return { error: gameErr?.message ?? "Could not save game." };

  const { error: resErr } = await supabase.from("game_results").insert(
    valid.map((r) => ({
      game_id: game.id,
      member_id: r.member_id,
      buy_in: Number(r.buy_in) || 0,
      cash_out: Number(r.cash_out) || 0,
    })),
  );
  if (resErr) {
    // Roll back the orphaned game so we don't leave half-saved data.
    await supabase.from("games").delete().eq("id", game.id);
    return { error: resErr.message };
  }

  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  redirect("/ledger");
}

export async function deleteGame(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  await supabase.from("games").delete().eq("id", id);
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
}

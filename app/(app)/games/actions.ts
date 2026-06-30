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

// Unambiguous alphabet (no 0/O/1/I) for easy-to-read join codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len = 5): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export async function createLiveGame(
  _prev: GameState,
  formData: FormData,
): Promise<GameState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const name = String(formData.get("name") ?? "").trim() || "Live game";

  // Try a few codes in case of a (rare) collision.
  let gameId: string | null = null;
  for (let attempt = 0; attempt < 6 && !gameId; attempt++) {
    const join_code = randomCode();
    const { data, error } = await supabase
      .from("games")
      .insert({ host_id: user.id, name, status: "lobby", join_code })
      .select("id")
      .single();
    if (data) {
      gameId = data.id;
    } else if (error && !error.message.toLowerCase().includes("duplicate")) {
      return { error: error.message };
    }
  }

  if (!gameId) return { error: "Could not create game. Try again." };

  revalidatePath("/dashboard");
  redirect(`/games/${gameId}/lobby`);
}

export async function setGameStatus(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["lobby", "active", "finished"].includes(status)) return;

  await supabase.from("games").update({ status }).eq("id", id);
  revalidatePath(`/games/${id}/lobby`);
  revalidatePath("/dashboard");
}

export async function setPlayerStatus(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const game_id = String(formData.get("game_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["pending", "approved", "rejected", "left"].includes(status)) return;

  await supabase.from("game_players").update({ status }).eq("id", id);
  revalidatePath(`/games/${game_id}/lobby`);
}

type CloseRow = {
  player_id: string;
  member_id: string | null; // null => create a new member from the nickname
  nickname: string;
  buy_in: number;
  cash_out: number;
};

export async function closeGame(
  _prev: GameState,
  formData: FormData,
): Promise<GameState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const gameId = String(formData.get("game_id") ?? "");
  if (!gameId) return { error: "Missing game." };

  // Confirm ownership before doing anything.
  const { data: game } = await supabase
    .from("games")
    .select("id, host_id")
    .eq("id", gameId)
    .single();
  if (!game || game.host_id !== user.id) return { error: "Game not found." };

  let rows: CloseRow[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "Could not read the results." };
  }

  for (const row of rows) {
    let memberId = row.member_id;

    // Create a ledger member for players who aren't linked to one yet.
    if (!memberId) {
      const { data: member, error: memberErr } = await supabase
        .from("members")
        .insert({ host_id: user.id, name: row.nickname || "Player" })
        .select("id")
        .single();
      if (memberErr || !member) {
        return { error: memberErr?.message ?? "Could not create player." };
      }
      memberId = member.id;
      await supabase
        .from("game_players")
        .update({ member_id: memberId })
        .eq("id", row.player_id);
    }

    const { error: resErr } = await supabase.from("game_results").upsert(
      {
        game_id: gameId,
        member_id: memberId,
        buy_in: Number(row.buy_in) || 0,
        cash_out: Number(row.cash_out) || 0,
      },
      { onConflict: "game_id,member_id" },
    );
    if (resErr) return { error: resErr.message };
  }

  await supabase
    .from("games")
    .update({ status: "finished", played_on: new Date().toISOString().slice(0, 10) })
    .eq("id", gameId);

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

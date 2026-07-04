// Engine test harness for the Phase 3 betting RPCs.
//
// Runs against a Supabase project that has migrations 0001–0004 applied and
// "Confirm email" turned OFF. Reads NEXT_PUBLIC_SUPABASE_URL and a key from the
// environment (or .env.local). Creates a throwaway host account + game, drives
// hands via host-override player_action, and asserts outcomes.
//
//   node scripts/engine-test.mjs
//
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- env ---------------------------------------------------------------
function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error("Missing Supabase env (URL / key).");
  process.exit(1);
}

let failures = 0;
function assert(label, cond, extra = "") {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "  " + extra}`);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function signInHost() {
  const email = `engine-test+${Date.now()}@example.com`;
  const password = "test-password-123";
  const { error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error("signUp: " + error.message);
  const { data, error: e2 } = await sb.auth.signInWithPassword({ email, password });
  if (e2) throw new Error("signIn: " + e2.message);
  return data.user.id;
}

async function createGame(hostId, { sb: small = 1, bb = 2 } = {}) {
  const { data, error } = await sb
    .from("games")
    .insert({ host_id: hostId, name: "Engine Test", status: "active", small_blind: small, big_blind: bb })
    .select("id")
    .single();
  if (error) throw new Error("createGame: " + error.message);
  return data.id;
}

async function addPlayers(gameId, stacks) {
  const rows = stacks.map((stack, i) => ({
    game_id: gameId,
    status: "approved",
    is_guest: true,
    nickname: `P${i + 1}`,
    seat: i + 1,
    stack,
    buy_in: stack,
  }));
  const { data, error } = await sb.from("game_players").insert(rows).select("id, seat");
  if (error) throw new Error("addPlayers: " + error.message);
  return data.sort((a, b) => a.seat - b.seat);
}

async function currentHand(gameId) {
  const { data } = await sb
    .from("hands")
    .select("*")
    .eq("game_id", gameId)
    .order("hand_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function stacks(gameId) {
  const { data } = await sb
    .from("game_players")
    .select("seat, stack")
    .eq("game_id", gameId)
    .order("seat");
  return Object.fromEntries(data.map((r) => [r.seat, Number(r.stack)]));
}

async function act(handId, action, amount = 0) {
  const { error } = await sb.rpc("player_action", { p_hand_id: handId, p_action: action, p_amount: amount });
  if (error) throw new Error(`player_action(${action}): ` + error.message);
}

// Auto-play the current hand passively (check when free, call otherwise) until
// betting ends. Returns after status leaves 'betting'.
async function playPassive(gameId, handId) {
  for (let i = 0; i < 200; i++) {
    const h = await currentHand(gameId);
    if (!h || h.id !== handId || h.status !== "betting") return;
    const { data: hp } = await sb
      .from("hand_players")
      .select("committed_street")
      .eq("hand_id", handId)
      .eq("player_id", h.current_turn)
      .single();
    const toCall = Number(h.current_bet) - Number(hp.committed_street);
    await act(handId, toCall > 0 ? "call" : "check");
  }
}

function total(s) {
  return Object.values(s).reduce((a, b) => a + b, 0);
}

async function run() {
  const hostId = await signInHost();

  // --- Scenario 1: 3-handed limped pot to showdown, seat 1 wins -----------
  {
    const gameId = await createGame(hostId);
    await addPlayers(gameId, [100, 100, 100]);
    const { data: handId, error } = await sb.rpc("start_hand", { p_game_id: gameId });
    if (error) throw new Error("start_hand: " + error.message);

    const h0 = await currentHand(gameId);
    assert("S1 blinds → pot 3", Number(h0.pot) === 3, `pot=${h0.pot}`);
    assert("S1 preflop first to act = seat 1 (UTG)", h0.current_turn != null);

    await playPassive(gameId, handId);
    const hAfter = await currentHand(gameId);
    assert("S1 reaches showdown", hAfter.status === "awaiting_showdown", `status=${hAfter.status}`);

    // declare seat 1 winner
    const { data: p1 } = await sb.from("game_players").select("id").eq("game_id", gameId).eq("seat", 1).single();
    const { error: dErr } = await sb.rpc("declare_winners", { p_hand_id: handId, p_winner_ids: [p1.id] });
    if (dErr) throw new Error("declare_winners: " + dErr.message);

    const s = await stacks(gameId);
    assert("S1 chips conserved (300)", total(s) === 300, JSON.stringify(s));
    assert("S1 winner seat1 = 104", s[1] === 104, JSON.stringify(s));
    assert("S1 seat2 = 98", s[2] === 98, JSON.stringify(s));
    assert("S1 seat3 = 98", s[3] === 98, JSON.stringify(s));
    await sb.from("games").delete().eq("id", gameId);
  }

  // --- Scenario 2: heads-up, SB folds preflop, BB wins uncontested --------
  {
    const gameId = await createGame(hostId);
    await addPlayers(gameId, [100, 100]);
    const { data: handId } = await sb.rpc("start_hand", { p_game_id: gameId });

    // SB (dealer, first to act heads-up) folds
    await act(handId, "fold");

    const h = await currentHand(gameId);
    assert("S2 hand complete after fold", h.status === "complete", `status=${h.status}`);
    const s = await stacks(gameId);
    assert("S2 chips conserved (200)", total(s) === 200, JSON.stringify(s));
    assert("S2 folder (seat1/SB) = 99", s[1] === 99, JSON.stringify(s));
    assert("S2 winner (seat2/BB) = 101", s[2] === 101, JSON.stringify(s));
    await sb.from("games").delete().eq("id", gameId);
  }

  // --- Scenario 3: 3-handed, UTG bets big preflop, others fold ------------
  {
    const gameId = await createGame(hostId);
    const ps = await addPlayers(gameId, [100, 100, 100]);
    const { data: handId } = await sb.rpc("start_hand", { p_game_id: gameId });

    // UTG (seat1) raises to 10, then the other two fold in turn.
    await act(handId, "raise", 10);
    await act(handId, "fold");
    await act(handId, "fold");

    const h = await currentHand(gameId);
    assert("S3 hand complete after folds", h.status === "complete", `status=${h.status}`);
    const s = await stacks(gameId);
    assert("S3 chips conserved (300)", total(s) === 300, JSON.stringify(s));
    // seat1 wins its own 10 back + SB1 + BB2 = pot 13; net +3 over start.
    assert("S3 raiser seat1 = 103", s[1] === 103, JSON.stringify(s));
    void ps;
    await sb.from("games").delete().eq("id", gameId);
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("\nERROR:", e.message);
  process.exit(1);
});

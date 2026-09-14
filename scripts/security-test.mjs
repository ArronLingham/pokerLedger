// Integration regressions against the configured development Supabase project.
// Uses throwaway Auth users and removes all test games/members in finally.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const host = client(), guest = client(), outsider = client(), anon = client();
const checked = ({ data, error }) => { assert.ifError(error); return data; };
const denied = (result, label) => { assert.ok(result.error, label); console.log('PASS', label); };
let gameId, hostId, outsiderId;
try {
  hostId = checked(await host.auth.signInAnonymously()).user.id;
  checked(await guest.auth.signInAnonymously());
  outsiderId = checked(await outsider.auth.signInAnonymously()).user.id;
  const code = `TEST${Date.now()}`;
  gameId = checked(await host.from('games').insert({ host_id: hostId, name: 'Security regression', status: 'active', join_code: code, digital_cards: true }).select('id').single()).id;
  const guestId = checked(await guest.rpc('join_game', { p_code: code, p_nickname: 'Guest' }));
  await guest.from('game_players').update({ status: 'approved', stack: 9999, buy_in: 9999 }).eq('id', guestId);
  const pending = checked(await host.from('game_players').select('status,stack,buy_in').eq('id', guestId).single());
  assert.deepEqual(pending, { status: 'pending', stack: 0, buy_in: 0 });
  console.log('PASS guest cannot self-approve or edit chips');
  checked(await host.from('game_players').update({ status: 'approved', seat: 1, stack: 100, buy_in: 100 }).eq('id', guestId));
  const p2 = checked(await host.from('game_players').insert({ game_id: gameId, nickname: 'Second', status: 'approved', seat: 2, stack: 100, buy_in: 100 }).select('id').single()).id;
  const handId = checked(await host.rpc('start_hand', { p_game_id: gameId }));
  const internal = [
    ['_advance_street', { p_hand_id: handId }],
    ['_award_pot', { p_hand_id: handId, p_winner_ids: [guestId] }],
    ['_post_blind', { p_hand_id: handId, p_seat: 1, p_blind: 50 }],
    ['_refund_uncalled_bets', { p_hand_id: handId }],
  ];
  for (const [name, args] of internal) {
    for (const [role, sb] of [['unsigned-in', anon], ['guest', guest], ['host', host]]) {
      denied(await sb.rpc(name, args), `${role} cannot invoke ${name}`);
    }
  }
  denied(await anon.rpc('player_action', { p_hand_id: handId, p_action: 'fold' }), 'unsigned-in action rejected');
  denied(await outsider.rpc('player_action', { p_hand_id: handId, p_action: 'fold' }), 'unrelated user action rejected');
  denied(await outsider.rpc('get_side_pots', { p_hand_id: handId }), 'unrelated user cannot inspect pots');
  denied(await host.rpc('get_hand_cards_for_eval', { p_hand_id: handId }), 'host cannot read opponents before showdown');
  denied(await guest.rpc('get_hand_cards_for_eval', { p_hand_id: handId }), 'guest cannot use host evaluation');
  const ownCards = checked(await guest.rpc('get_my_hole_cards', { p_hand_id: handId }));
  assert.equal(ownCards.length, 2); console.log('PASS player can still read own cards');
  const rows = [{ player_id: guestId, member_id: null, nickname: 'Guest', buy_in: 100, cash_out: 100 }, { player_id: p2, member_id: null, nickname: 'Second', buy_in: 100, cash_out: 100 }];
  denied(await host.rpc('close_live_game', { p_game_id: gameId, p_rows: rows }), 'cannot close mid-hand');
  denied(await host.from('games').update({ status: 'finished' }).eq('id', gameId), 'direct status update cannot bypass hand guard');
  denied(await host.rpc('declare_winners', { p_hand_id: handId, p_winners: [{ pot_index: 0, winner_ids: [guestId] }] }), 'cannot award before showdown');
  // Drive the real betting RPC to showdown, then verify private evaluation.
  for (let i = 0; i < 30; i++) {
    const h = checked(await host.from('hands').select('*').eq('id', handId).single());
    if (h.status !== 'betting') break;
    const hp = checked(await host.from('hand_players').select('committed_street').eq('hand_id', handId).eq('player_id', h.current_turn).single());
    checked(await host.rpc('player_action', { p_hand_id: handId, p_action: Number(h.current_bet) > Number(hp.committed_street) ? 'call' : 'check' }));
  }
  assert.equal(checked(await host.rpc('get_hand_cards_for_eval', { p_hand_id: handId })).length, 2);
  console.log('PASS evaluation available at showdown');
  checked(await host.rpc('declare_winners', { p_hand_id: handId, p_winners: [{ pot_index: 0, winner_ids: [guestId] }] }));
  const member = checked(await host.from('members').insert({ host_id: hostId, name: 'Existing' }).select('id').single()).id;
  denied(await host.rpc('close_live_game', { p_game_id: gameId, p_rows: rows.map(r => ({ ...r, member_id: member })) }), 'duplicate ledger mappings rejected');
  denied(await host.rpc('close_live_game', { p_game_id: gameId, p_rows: [rows[0], rows[0]] }), 'duplicate roster rows rejected');
  denied(await host.rpc('close_live_game', { p_game_id: gameId, p_rows: [rows[0]] }), 'omitted player rejected');
  denied(await outsider.rpc('close_live_game', { p_game_id: gameId, p_rows: rows }), 'non-host close rejected');
  denied(await host.rpc('close_live_game', { p_game_id: gameId, p_rows: rows.map((r,i) => ({ ...r, cash_out: i ? 99 : 100 })) }), 'unbalanced close rejected');
  const foreign = checked(await outsider.from('members').insert({ host_id: outsiderId, name: 'Foreign' }).select('id').single()).id;
  denied(await host.rpc('close_live_game', { p_game_id: gameId, p_rows: [rows[0], { ...rows[1], member_id: foreign }] }), 'foreign member rejected after first row');
  assert.equal(checked(await host.from('game_results').select('id').eq('game_id', gameId)).length, 0);
  assert.equal(checked(await host.from('members').select('id')).length, 1);
  assert.ok(checked(await host.from('game_players').select('member_id').eq('game_id', gameId)).every(r => r.member_id === null));
  console.log('PASS failed close rolls back results, new members and roster links');
  const close = () => host.rpc('close_live_game', { p_game_id: gameId, p_rows: [{ ...rows[0], member_id: member }, rows[1]] });
  const attempts = await Promise.all([close(), close()]);
  assert.equal(attempts.filter(r => !r.error).length, 1);
  assert.equal(checked(await host.from('game_results').select('id').eq('game_id', gameId)).length, 2);
  assert.equal(checked(await host.from('games').select('status').eq('id', gameId).single()).status, 'finished');
  assert.equal(checked(await host.from('game_players').select('member_id').eq('id', guestId).single()).member_id, member);
  console.log('PASS concurrent close saves exactly once and links existing member');
  console.log('\nALL SECURITY / CLOSEOUT REGRESSIONS PASS');
} finally {
  if (gameId) checked(await host.from('games').delete().eq('id', gameId));
  if (hostId) checked(await host.from('members').delete().eq('host_id', hostId));
  if (outsiderId) checked(await outsider.from('members').delete().eq('host_id', outsiderId));
  await Promise.all([host, guest, outsider].map(sb => sb.auth.signOut()));
}

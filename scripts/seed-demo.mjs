// Creates fictional portfolio data through the same authenticated APIs as the app.
// Credentials and owned fixture IDs stay in a gitignored, owner-readable file.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const file = '.env.demo.local.json';
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { email: `portfolio-demo+${Date.now()}@example.com`, password: randomBytes(24).toString('base64url'), games: [], members: [] };
const save = () => writeFileSync(file, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
if (!existsSync(file)) {
  check(await sb.auth.signUp({ email: state.email, password: state.password, options: { data: { display_name: 'Demo Host' } } }));
  save();
}
const user = check(await sb.auth.signInWithPassword({ email: state.email, password: state.password })).user;
for (const id of state.games) check(await sb.from('games').delete().eq('id', id).eq('host_id', user.id));
// Settlements are limited to the dedicated demo account.
check(await sb.from('settlements').delete().eq('host_id', user.id));
for (const id of state.members) check(await sb.from('members').delete().eq('id', id).eq('host_id', user.id));
state.games = []; state.members = []; save();
const names = ['Alex', 'Morgan', 'Sam', 'Jordan'];
for (const name of names) {
  const member = check(await sb.from('members').insert({ host_id: user.id, name }).select('id').single());
  state.members.push(member.id); save();
}
const history = [
  ['Friday night', '2026-09-04', [145, 80, 110, 65]],
  ['Sunday with friends', '2026-09-06', [120, 75, 115, 90]],
  ['Midweek cards', '2026-09-09', [110, 105, 90, 95]],
];
for (const [name, played_on, cash] of history) {
  const game = check(await sb.from('games').insert({ host_id: user.id, name, played_on, status: 'finished' }).select('id').single());
  state.games.push(game.id); save();
  check(await sb.from('game_results').insert(cash.map((cash_out, i) => ({ game_id: game.id, member_id: state.members[i], buy_in: 100, cash_out }))));
}
const code = randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
const live = check(await sb.from('games').insert({ host_id: user.id, name: 'Saturday at the table', status: 'lobby', join_code: code, digital_cards: true, denominations: [{ value: 1, label: 'White', color: '#e2e8f0' }, { value: 5, label: 'Red', color: '#ef4444' }, { value: 25, label: 'Green', color: '#22c55e' }] }).select('id').single());
state.games.push(live.id); state.liveGameId = live.id; state.joinCode = code; save();
check(await sb.from('game_players').insert(names.slice(0, 3).map((nickname, i) => ({ game_id: live.id, nickname, member_id: state.members[i], is_guest: true, status: 'approved', seat: i + 1, stack: 100, buy_in: 100 }))));
console.log('Fictional demo ready: three historical games, four ledger members and a digital-card lobby.');
console.log('Local credentials and fixture IDs: .env.demo.local.json (gitignored).');
console.log(`Host lobby: http://localhost:3100/games/${live.id}/lobby`);
console.log(`Guest join: http://127.0.0.1:3100/join/${code}`);
await sb.auth.signOut();

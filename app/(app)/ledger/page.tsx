import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/ledger";
import { loadLedger } from "@/lib/queries";
import { recordSettlement } from "./actions";
import { deleteGame } from "../games/actions";

export default async function LedgerPage() {
  const { members, games, results, memberById, nets, balances, suggestions } =
    await loadLedger();

  const resultsByGame = new Map<string, typeof results>();
  for (const r of results) {
    const arr = resultsByGame.get(r.game_id) ?? [];
    arr.push(r);
    resultsByGame.set(r.game_id, arr);
  }

  // Members sorted by lifetime net, biggest winners first.
  const standings = members
    .map((m) => ({
      member: m,
      net: nets.get(m.id) ?? 0,
      balance: balances.get(m.id) ?? 0,
    }))
    .sort((a, b) => b.net - a.net);

  return (
    <>
      <PageHeader
        title="Account Sheet"
        subtitle="Lifetime results and who owes whom."
        action={
          <Link
            href="/games/new"
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
          >
            + Game
          </Link>
        }
      />

      {/* Standings */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Standings
        </h2>
        {standings.length === 0 ? (
          <p className="text-sm text-muted">
            No players yet.{" "}
            <Link href="/members" className="text-accent hover:underline">
              Add some →
            </Link>
          </p>
        ) : (
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-4 py-2.5 font-medium">Player</th>
                  <th className="px-4 py-2.5 text-right font-medium">Lifetime</th>
                  <th className="px-4 py-2.5 text-right font-medium">Owed / Owes</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(({ member, net, balance }) => (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{member.name}</td>
                    <td
                      className={`px-4 py-2.5 text-right ${
                        net > 0 ? "text-positive" : net < 0 ? "text-negative" : ""
                      }`}
                    >
                      {formatMoney(net)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right ${
                        balance > 0.005
                          ? "text-positive"
                          : balance < -0.005
                            ? "text-negative"
                            : "text-muted"
                      }`}
                    >
                      {Math.abs(balance) < 0.005 ? "settled" : formatMoney(balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* Settle up */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Settle up
        </h2>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted">Everyone is square. 🎉</p>
        ) : (
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <Card key={i} className="flex items-center justify-between py-3">
                <span className="text-sm">
                  <span className="font-medium">
                    {memberById.get(s.from)?.name ?? "?"}
                  </span>{" "}
                  pays{" "}
                  <span className="font-medium">
                    {memberById.get(s.to)?.name ?? "?"}
                  </span>{" "}
                  <span className="text-accent">{formatMoney(s.amount)}</span>
                </span>
                <form action={recordSettlement}>
                  <input type="hidden" name="from_member" value={s.from} />
                  <input type="hidden" name="to_member" value={s.to} />
                  <input type="hidden" name="amount" value={s.amount} />
                  <button
                    type="submit"
                    className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium hover:bg-border"
                  >
                    Mark paid
                  </button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Game history */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Games
        </h2>
        {games.length === 0 ? (
          <p className="text-sm text-muted">No games recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {games.map((g) => {
              const gr = resultsByGame.get(g.id) ?? [];
              return (
                <Card key={g.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {g.name || "Untitled game"}
                      </div>
                      <div className="text-xs text-muted">{g.played_on}</div>
                    </div>
                    <form action={deleteGame}>
                      <input type="hidden" name="id" value={g.id} />
                      <button
                        type="submit"
                        className="text-xs text-muted hover:text-negative"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                  <div className="flex flex-col gap-1">
                    {gr.map((r) => {
                      const net = Number(r.cash_out) - Number(r.buy_in);
                      return (
                        <div
                          key={r.id}
                          className="flex justify-between text-sm"
                        >
                          <span>{memberById.get(r.member_id)?.name ?? "?"}</span>
                          <span
                            className={
                              net > 0
                                ? "text-positive"
                                : net < 0
                                  ? "text-negative"
                                  : "text-muted"
                            }
                          >
                            {formatMoney(net)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

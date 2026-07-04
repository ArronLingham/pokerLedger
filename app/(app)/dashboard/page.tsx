import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/ledger";
import { loadLedger } from "@/lib/queries";
import type { Game, Profile } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single<Profile>();

  const { members, games, nets, suggestions } = await loadLedger();
  const liveGames = games.filter(
    (g) => g.status === "lobby" || g.status === "active",
  ) as Game[];
  const finishedCount = games.filter((g) => g.status === "finished").length;

  const topWinner = [...members]
    .map((m) => ({ m, net: nets.get(m.id) ?? 0 }))
    .sort((a, b) => b.net - a.net)[0];

  const greeting = profile?.display_name || profile?.default_nickname || "there";

  return (
    <>
      <PageHeader title={`Hey, ${greeting}`} subtitle="Your poker ledger." />

      {/* Live games */}
      {liveGames.length > 0 ? (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Live now
          </h2>
          <div className="flex flex-col gap-2">
            {liveGames.map((g) => (
              <Link
                key={g.id}
                href={
                  g.status === "active"
                    ? `/games/${g.id}/table`
                    : `/games/${g.id}/lobby`
                }
              >
                <Card className="flex items-center justify-between hover:border-accent">
                  <div>
                    <div className="font-medium">{g.name || "Live game"}</div>
                    <div className="text-xs text-muted">
                      {g.status === "lobby" ? "In lobby" : "In progress"} · code{" "}
                      <span className="font-mono">{g.join_code}</span>
                    </div>
                  </div>
                  <span className="text-accent">→</span>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-3xl font-semibold">{finishedCount}</div>
          <div className="text-sm text-muted">games recorded</div>
        </Card>
        <Card>
          <div className="text-3xl font-semibold">{members.length}</div>
          <div className="text-sm text-muted">players tracked</div>
        </Card>
      </div>

      {topWinner && topWinner.net > 0 ? (
        <Card className="mt-3">
          <div className="text-sm text-muted">Biggest winner</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-medium">{topWinner.m.name}</span>
            <span className="text-lg font-semibold text-positive">
              {formatMoney(topWinner.net)}
            </span>
          </div>
        </Card>
      ) : null}

      {suggestions.length > 0 ? (
        <Link href="/ledger" className="mt-3 block">
          <Card className="flex items-center justify-between">
            <span className="text-sm">
              {suggestions.length} payment
              {suggestions.length > 1 ? "s" : ""} to settle up
            </span>
            <span className="text-accent">→</span>
          </Card>
        </Link>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link href="/games/live">
          <Card className="text-center hover:border-accent">
            <div className="text-2xl">🟢</div>
            <div className="mt-1 text-sm font-medium">Start live game</div>
          </Card>
        </Link>
        <Link href="/games/new">
          <Card className="text-center hover:border-accent">
            <div className="text-2xl">➕</div>
            <div className="mt-1 text-sm font-medium">Record past game</div>
          </Card>
        </Link>
      </div>
    </>
  );
}

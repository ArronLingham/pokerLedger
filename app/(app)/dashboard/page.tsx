import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/ledger";
import { loadLedger } from "@/lib/queries";
import type { Profile } from "@/lib/types";

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

  const topWinner = [...members]
    .map((m) => ({ m, net: nets.get(m.id) ?? 0 }))
    .sort((a, b) => b.net - a.net)[0];

  const greeting = profile?.display_name || profile?.default_nickname || "there";

  return (
    <>
      <PageHeader title={`Hey, ${greeting}`} subtitle="Your poker ledger." />

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-3xl font-semibold">{games.length}</div>
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
        <Link href="/games/new">
          <Card className="text-center hover:border-accent">
            <div className="text-2xl">➕</div>
            <div className="mt-1 text-sm font-medium">Record a game</div>
          </Card>
        </Link>
        <Link href="/ledger">
          <Card className="text-center hover:border-accent">
            <div className="text-2xl">📒</div>
            <div className="mt-1 text-sm font-medium">Account sheet</div>
          </Card>
        </Link>
      </div>
    </>
  );
}

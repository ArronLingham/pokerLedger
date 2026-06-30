import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { JoinForm } from "./join-form";

type CodeGame = {
  id: string;
  name: string;
  status: string;
  host_name: string;
};

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_game_by_code", {
    p_code: code.toUpperCase(),
  });
  const game = (data?.[0] ?? null) as CodeGame | null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoggedIn = !!user && !user.is_anonymous;

  let defaultNickname = "";
  if (isLoggedIn) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_nickname")
      .eq("id", user!.id)
      .single();
    defaultNickname = profile?.default_nickname ?? "";
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {!game ? (
          <Card className="text-center">
            <h1 className="text-xl font-semibold">Game not found</h1>
            <p className="mt-2 text-muted">
              That code doesn’t match a game that’s open to join. Double-check it
              with the host.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-accent hover:underline"
            >
              Go home
            </Link>
          </Card>
        ) : (
          <>
            <h1 className="mb-1 text-center text-2xl font-semibold">
              {game.name || "Poker game"}
            </h1>
            <p className="mb-6 text-center text-muted">
              Hosted by {game.host_name}
            </p>
            <JoinForm
              code={code.toUpperCase()}
              gameId={game.id}
              isLoggedIn={isLoggedIn}
              defaultNickname={defaultNickname}
            />
          </>
        )}
      </div>
    </main>
  );
}

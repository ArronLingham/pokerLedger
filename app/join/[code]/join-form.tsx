"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, FormMessage, Input, Label } from "@/components/ui";

export function JoinForm({
  code,
  gameId,
  isLoggedIn,
  defaultNickname,
}: {
  code: string;
  gameId: string;
  isLoggedIn: boolean;
  defaultNickname: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [nickname, setNickname] = useState(defaultNickname);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    setError(undefined);

    // Guests get an anonymous session so the rest of the app can identify them.
    if (!isLoggedIn) {
      if (!nickname.trim()) {
        setError("Enter a nickname so the host knows who you are.");
        setBusy(false);
        return;
      }
      const { error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) {
        setError(anonErr.message);
        setBusy(false);
        return;
      }
    }

    const { error: rpcErr } = await supabase.rpc("join_game", {
      p_code: code,
      p_nickname: nickname.trim(),
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      return;
    }

    router.push(`/play/${gameId}`);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <Label htmlFor="nickname">Your nickname at the table</Label>
        <Input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. Big Slick"
        />
      </div>

      <FormMessage error={error} />

      <Button onClick={join} disabled={busy}>
        {busy
          ? "Joining…"
          : isLoggedIn
            ? "Join game"
            : "Join as guest"}
      </Button>

      {!isLoggedIn ? (
        <p className="text-center text-xs text-muted">
          Have an account?{" "}
          <Link
            href={`/login?next=/join/${code}`}
            className="text-accent hover:underline"
          >
            Log in
          </Link>{" "}
          to skip host approval.
        </p>
      ) : null}
    </Card>
  );
}

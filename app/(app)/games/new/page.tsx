import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import type { Member } from "@/lib/types";
import { RecordGameForm } from "./record-game-form";

export default async function NewGamePage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("members")
    .select("*")
    .order("name");

  const list = (members ?? []) as Member[];

  if (list.length === 0) {
    return (
      <>
        <PageHeader title="Record a game" />
        <p className="text-muted">
          Add some players first, then come back to record a game.{" "}
          <Link href="/members" className="text-accent hover:underline">
            Add players →
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Record a game"
        subtitle="Enter each player's buy-in and final cash-out."
      />
      <RecordGameForm members={list} />
    </>
  );
}

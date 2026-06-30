import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-accent" />
        <h1 className="text-4xl font-bold tracking-tight">Poker Ledger</h1>
        <p className="mt-3 text-muted">
          Track your home games, balances, and exactly who owes whom — without
          the spreadsheet.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href="/signup">
            <Button className="w-full">Create an account</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" className="w-full">
              Log in
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

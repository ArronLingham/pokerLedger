"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthState } from "../actions";
import { Button, Card, FormMessage, Input, Label } from "@/components/ui";

const initial: AuthState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold text-center">Welcome back</h1>
        <p className="mb-6 text-center text-muted">Log in to your ledger.</p>
        <Card>
          <form action={formAction} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <FormMessage error={state.error} />
            <Button type="submit" disabled={pending}>
              {pending ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-sm text-muted">
          No account?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

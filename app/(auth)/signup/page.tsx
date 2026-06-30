"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type AuthState } from "../actions";
import { Button, Card, FormMessage, Input, Label } from "@/components/ui";

const initial: AuthState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, initial);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold text-center">
          Create your account
        </h1>
        <p className="mb-6 text-center text-muted">
          Your password keeps your identity yours — no one can play as you.
        </p>
        <Card>
          <form action={formAction} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="display_name">Name</Label>
              <Input id="display_name" name="display_name" autoComplete="name" />
            </div>
            <div>
              <Label htmlFor="default_nickname">
                Default nickname{" "}
                <span className="font-normal">(shown at the table)</span>
              </Label>
              <Input id="default_nickname" name="default_nickname" />
            </div>
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
                autoComplete="new-password"
                required
              />
            </div>
            <FormMessage error={state.error} />
            {state.message ? (
              <p className="rounded-lg bg-accent/15 px-3 py-2 text-sm text-positive">
                {state.message}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

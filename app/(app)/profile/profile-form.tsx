"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "./actions";
import { Button, Card, FormMessage, Input, Label } from "@/components/ui";

const initial: ProfileState = {};

export function ProfileForm({
  displayName,
  defaultNickname,
}: {
  displayName: string;
  defaultNickname: string;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, initial);

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="display_name">Name</Label>
          <Input id="display_name" name="display_name" defaultValue={displayName} />
        </div>
        <div>
          <Label htmlFor="default_nickname">Default nickname</Label>
          <Input
            id="default_nickname"
            name="default_nickname"
            defaultValue={defaultNickname}
          />
          <p className="mt-1.5 text-xs text-muted">
            Auto-filled when you join a game — you can still change it per game.
          </p>
        </div>
        <FormMessage error={state.error} />
        {state.message ? (
          <p className="rounded-lg bg-accent/15 px-3 py-2 text-sm text-positive">
            {state.message}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Card>
  );
}

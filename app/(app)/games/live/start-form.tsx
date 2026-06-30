"use client";

import { useActionState } from "react";
import { createLiveGame, type GameState } from "../actions";
import { Button, Card, FormMessage, Input, Label } from "@/components/ui";

const initial: GameState = {};

export function StartLiveGameForm() {
  const [state, formAction, pending] = useActionState(createLiveGame, initial);

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="name">Game name</Label>
          <Input id="name" name="name" placeholder="Friday night" />
        </div>
        <FormMessage error={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create game"}
        </Button>
      </form>
    </Card>
  );
}

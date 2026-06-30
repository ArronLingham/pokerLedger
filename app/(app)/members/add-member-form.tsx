"use client";

import { useActionState, useRef, useEffect } from "react";
import { addMember, type MemberState } from "./actions";
import { Button, Card, FormMessage, Input } from "@/components/ui";

const initial: MemberState = {};

export function AddMemberForm() {
  const [state, formAction, pending] = useActionState(addMember, initial);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) ref.current?.reset();
  }, [pending, state]);

  return (
    <Card>
      <form ref={ref} action={formAction} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input name="name" placeholder="Add a player by name" required />
          <Button type="submit" disabled={pending}>
            Add
          </Button>
        </div>
        <FormMessage error={state.error} />
      </form>
    </Card>
  );
}

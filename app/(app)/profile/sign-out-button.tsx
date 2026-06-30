"use client";

import { signout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui";

export function SignOutButton() {
  return (
    <form action={signout}>
      <Button type="submit" variant="secondary" className="w-full">
        Log out
      </Button>
    </form>
  );
}

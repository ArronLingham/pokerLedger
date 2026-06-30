"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function recordSettlement(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const from_member = String(formData.get("from_member") ?? "");
  const to_member = String(formData.get("to_member") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  if (!from_member || !to_member || !(amount > 0)) return;

  await supabase.from("settlements").insert({
    host_id: user.id,
    from_member,
    to_member,
    amount,
    note: "Marked paid from settle-up",
  });

  revalidatePath("/ledger");
  revalidatePath("/dashboard");
}

export async function undoSettlement(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  await supabase.from("settlements").delete().eq("id", id);
  revalidatePath("/ledger");
  revalidatePath("/dashboard");
}

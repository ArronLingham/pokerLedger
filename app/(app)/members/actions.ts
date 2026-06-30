"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MemberState = { error?: string };

export async function addMember(
  _prev: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name." };

  const { error } = await supabase
    .from("members")
    .insert({ host_id: user.id, name });
  if (error) return { error: error.message };

  revalidatePath("/members");
  revalidatePath("/games/new");
  return {};
}

export async function deleteMember(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  await supabase.from("members").delete().eq("id", id);
  revalidatePath("/members");
  revalidatePath("/ledger");
}

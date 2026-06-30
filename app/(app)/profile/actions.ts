"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = { error?: string; message?: string };

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const display_name = String(formData.get("display_name") ?? "").trim();
  const default_nickname = String(formData.get("default_nickname") ?? "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({ display_name, default_nickname, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { message: "Profile saved." };
}

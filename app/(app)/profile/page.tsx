import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import type { Profile } from "@/lib/types";
import { ProfileForm } from "./profile-form";
import { SignOutButton } from "./sign-out-button";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single<Profile>();

  return (
    <>
      <PageHeader title="Profile" subtitle={user!.email ?? undefined} />
      <ProfileForm
        displayName={profile?.display_name ?? ""}
        defaultNickname={profile?.default_nickname ?? ""}
      />
      <div className="mt-6">
        <SignOutButton />
      </div>
    </>
  );
}

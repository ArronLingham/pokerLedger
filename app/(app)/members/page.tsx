import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import type { Member } from "@/lib/types";
import { AddMemberForm } from "./add-member-form";
import { deleteMember } from "./actions";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("members")
    .select("*")
    .order("name");

  const list = (members ?? []) as Member[];

  return (
    <>
      <PageHeader
        title="Players"
        subtitle="The people you track across your games."
      />
      <AddMemberForm />

      <div className="mt-6 flex flex-col gap-2">
        {list.length === 0 ? (
          <p className="text-muted text-sm">
            No players yet. Add the regulars at your table.
          </p>
        ) : (
          list.map((m) => (
            <Card
              key={m.id}
              className="flex items-center justify-between py-3"
            >
              <span className="font-medium">{m.name}</span>
              <form action={deleteMember}>
                <input type="hidden" name="id" value={m.id} />
                <button
                  type="submit"
                  className="text-sm text-muted hover:text-negative"
                >
                  Remove
                </button>
              </form>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

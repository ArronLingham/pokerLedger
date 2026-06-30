import { PageHeader } from "@/components/ui";
import { StartLiveGameForm } from "./start-form";

export default function StartLiveGamePage() {
  return (
    <>
      <PageHeader
        title="Start a live game"
        subtitle="Get a join code, link, and QR for your table."
      />
      <StartLiveGameForm />
    </>
  );
}

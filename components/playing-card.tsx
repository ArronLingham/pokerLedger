import { clsx } from "@/lib/clsx";

export function PlayingCard({
  card,
  hidden,
  className,
}: {
  card?: string | null;
  hidden?: boolean;
  className?: string;
}) {
  if (hidden || !card) {
    return (
      <div
        className={clsx(
          "relative flex items-center justify-center rounded-lg border-2 border-border bg-surface-2 shadow-sm",
          className
        )}
        style={{ aspectRatio: "2/3" }}
      >
        <div className="absolute inset-2 rounded-md border border-border/50 bg-gradient-to-br from-accent/20 to-accent/5" />
      </div>
    );
  }

  const rank = card.charAt(0).toUpperCase();
  const suitChar = card.charAt(1).toLowerCase();

  let suit = "";
  let color = "text-foreground";

  switch (suitChar) {
    case "h":
      suit = "♥";
      color = "text-negative"; // Red
      break;
    case "d":
      suit = "♦";
      color = "text-negative"; // Red
      break;
    case "c":
      suit = "♣";
      color = "text-foreground"; // Black/White depending on theme
      break;
    case "s":
      suit = "♠";
      color = "text-foreground"; // Black/White
      break;
  }

  // Replace 'T' with '10' for rendering
  const displayRank = rank === "T" ? "10" : rank;

  return (
    <div
      className={clsx(
        "relative flex flex-col justify-between rounded-lg border border-border bg-surface p-1.5 shadow-sm",
        color,
        className
      )}
      style={{ aspectRatio: "2/3" }}
    >
      <div className="flex flex-col items-center leading-none">
        <span className="text-sm font-bold sm:text-base">{displayRank}</span>
        <span className="text-xs sm:text-sm">{suit}</span>
      </div>
      
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <span className="text-4xl sm:text-5xl">{suit}</span>
      </div>
      
      <div className="flex flex-col items-center leading-none rotate-180">
        <span className="text-sm font-bold sm:text-base">{displayRank}</span>
        <span className="text-xs sm:text-sm">{suit}</span>
      </div>
    </div>
  );
}

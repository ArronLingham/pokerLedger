"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clsx } from "@/lib/clsx";

/**
 * Countdown for the player currently on the clock.
 *
 * The countdown itself is purely cosmetic — expiry is decided by the server.
 * When the clock looks overdue this nudges `expire_turn`, which re-validates
 * against server time and quietly no-ops if the deadline hasn't really passed
 * (or another client already moved the turn along). Retrying once a second is
 * what absorbs client/server clock skew.
 */
export function TurnTimer({
  handId,
  deadline,
  totalSeconds,
  isHost,
  className,
}: {
  handId: string;
  deadline: string | null;
  totalSeconds: number;
  isHost: boolean;
  className?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [now, setNow] = useState(() => Date.now());
  const lastAttempt = useRef(0);

  // A single ticking clock; everything else is derived from it.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const endsAt = deadline ? new Date(deadline).getTime() : null;
  const msLeft = endsAt === null ? null : endsAt - now;

  // The host nudges first; players act as a fallback in case the host's tab is
  // asleep. Staggering avoids every device firing at once.
  const graceMs = isHost ? 1000 : 4000;

  useEffect(() => {
    if (msLeft === null || msLeft >= -graceMs) return;
    const t = Date.now();
    if (t - lastAttempt.current < 1000) return; // throttle retries to ~1/s
    lastAttempt.current = t;
    supabase.rpc("expire_turn", { p_hand_id: handId });
  }, [msLeft, graceMs, handId, supabase]);

  if (msLeft === null) return null;

  const secs = Math.max(0, Math.ceil(msLeft / 1000));
  const urgent = secs <= 5;
  const pct =
    totalSeconds > 0
      ? Math.max(0, Math.min(100, (msLeft / (totalSeconds * 1000)) * 100))
      : 0;

  return (
    <div className={clsx("flex items-center gap-1.5", className)}>
      <div className="h-1 w-10 overflow-hidden rounded-full bg-border">
        <div
          className={clsx(
            "h-full rounded-full transition-[width] duration-200 ease-linear",
            urgent ? "bg-negative" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={clsx(
          "w-6 text-right font-mono text-xs tabular-nums",
          urgent ? "animate-pulse text-negative" : "text-muted",
        )}
      >
        {secs}
      </span>
    </div>
  );
}

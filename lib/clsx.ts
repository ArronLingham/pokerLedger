/** Tiny classNames helper — joins truthy class strings. */
export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

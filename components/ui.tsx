import { clsx } from "@/lib/clsx";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-border bg-surface p-5 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants = {
    primary: "bg-accent text-accent-fg hover:opacity-90",
    secondary: "bg-surface-2 text-foreground border border-border hover:bg-border",
    ghost: "text-muted hover:text-foreground",
    danger: "bg-negative/15 text-negative hover:bg-negative/25",
  };
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx("block text-sm font-medium text-muted mb-1.5", className)}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted mt-1">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function FormMessage({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg bg-negative/15 px-3 py-2 text-sm text-negative">
      {error}
    </p>
  );
}

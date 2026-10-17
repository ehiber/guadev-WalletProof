import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { statusClass, statusLabel } from "@/lib/format";
import type { DecisionStatus } from "@/types/blinka";

const buttonTone = {
  primary: "border-accent bg-accent text-white hover:bg-accent-hover",
  secondary: "border-[#d1d7e5] bg-surface text-ink hover:bg-[#f0f2fa]",
  danger: "border-[#d6aaa5] bg-surface text-danger",
  text: "border-transparent bg-transparent text-accent hover:underline",
} as const;

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonTone }) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold ${buttonTone[variant]} ${className}`}
      {...props}
    />
  );
}

export function StatusBadge({ status }: { status: DecisionStatus }) {
  return (
    <span className={`inline-flex items-center rounded-[5px] px-[7px] py-1 text-[10px] font-semibold ${statusClass(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-6 ${className}`}>{children}</section>;
}

export function TextField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-semibold">{label}</span>
      <input className="field mt-0" {...props} />
      {hint ? <small className="mt-1.5 block text-[10px] text-muted">{hint}</small> : null}
    </label>
  );
}

export function TextArea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-semibold">{label}</span>
      <textarea className="field mt-0 min-h-20 resize-y text-xs" {...props} />
    </label>
  );
}

export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[440px] rounded-[14px] bg-surface p-7 text-ink shadow-[0_16px_48px_rgba(27,55,44,0.14)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-[22px] font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  );
}

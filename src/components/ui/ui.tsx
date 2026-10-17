import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { statusClass, statusLabel } from "@/lib/format";
import type { DecisionStatus } from "@/types/blinka";

const buttonTone = {
  primary: "btn primary",
  secondary: "btn",
  danger: "btn danger",
  text: "text-btn",
} as const;

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonTone }) {
  return <button className={`${buttonTone[variant]} ${className}`.trim()} {...props} />;
}

export function StatusBadge({ status }: { status: DecisionStatus }) {
  return <span className={statusClass(status)}>{statusLabel(status)}</span>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`.trim()}>{children}</section>;
}

export function TextField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function TextArea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea {...props} />
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
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

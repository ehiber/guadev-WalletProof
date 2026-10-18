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

export function RequiredMark() {
  return (
    <abbr className="req" title="Obligatorio">
      *
      <span className="visually-hidden"> (obligatorio)</span>
    </abbr>
  );
}

export function RequiredNote() {
  return (
    <p className="req-note">
      <span className="req" aria-hidden="true">
        *
      </span>
      Campo obligatorio
    </p>
  );
}

export function TextField({
  label,
  hint,
  required,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <input required={required} aria-required={required || undefined} {...props} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function TextArea({
  label,
  required,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      <textarea required={required} aria-required={required || undefined} {...props} />
    </label>
  );
}

export function Dialog({
  open,
  title,
  children,
  onClose,
  className = "",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`modal-card ${className}`.trim()} onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

import type { BankAccountCheck } from "@/types/blinka";

export function normalizeAccountIdentifier(value: string): string {
  return value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isLikelyPaymentAccountIdentifier(value: string | undefined): value is string {
  if (!value?.trim()) return false;
  const normalized = normalizeAccountIdentifier(value);
  const digits = normalized.replace(/\D/g, "");
  if (/^SYN\d{4}$/.test(normalized)) return true;
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)) return true;
  if (/^\d{6,20}$/.test(normalized)) return true;
  return normalized.length >= 10 && digits.length >= 4;
}

export function compareBankAccount(requested: string, registered: string[]): BankAccountCheck {
  const requestedNormalized = normalizeAccountIdentifier(requested);
  const registeredNormalized = registered
    .map((identifier) => normalizeAccountIdentifier(identifier))
    .filter(Boolean);
  return {
    requested,
    registered,
    matches: requestedNormalized.length > 0 && registeredNormalized.includes(requestedNormalized),
  };
}

export function defaultBankAccount(registered: string[]): BankAccountCheck | undefined {
  const first = registered.find((identifier) => normalizeAccountIdentifier(identifier));
  if (!first) return undefined;
  return { requested: first, registered, matches: true, usedDefault: true };
}

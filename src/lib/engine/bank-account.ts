import type { BankAccountCheck } from "@/types/blinka";

export function normalizeAccountIdentifier(value: string): string {
  return value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
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

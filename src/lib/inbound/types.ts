export type MailLogStatus = "ingested" | "discarded" | "error" | "pending";

export interface MailLogEntry {
  id: string;
  at: string;
  from: string;
  subject: string;
  attachments: string[];
  status: MailLogStatus;
  reason?: string;
  invoiceIds: string[];
}

export interface GmailStatus {
  connected: boolean;
  address: string | null;
  lastPollAt: string | null;
  lastError: string | null;
  messages: MailLogEntry[];
}

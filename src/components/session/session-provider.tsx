"use client";

import { cloneRules, normalizeRules } from "@/lib/engine/criteria";
import type { LayerTiming } from "@/lib/engine/live-pipeline";
import { emptyLayer, normalizeKeys, type ByokKeys } from "@/lib/engine/model-provider";
import { evaluateBatch } from "@/lib/engine/pipeline";
import type { FxOverride } from "@/lib/engine/fx-overrides";
import type { GmailStatus } from "@/lib/inbound/types";
import { DEFAULT_RULES, VENDORS } from "@/lib/mock-data/company-rules";
import { DEMO_ISSUE_DATE, paymentDate, ratesFromReference, type FxReference } from "@/lib/mock-data/fx-ledger";
import { INITIAL_DATASET } from "@/lib/mock-data/initial-dataset";
import {
  freshNav,
  orderedProjects,
  reorderIds,
  SIDEBAR_PROJECT_LIMIT,
  sidebarProjects,
  usesFavorites,
  type NavPrefs,
  type NavSection,
} from "@/lib/mock-data/nav";
import { ALL_PROJECTS, INITIAL_PROJECTS } from "@/lib/mock-data/projects";
import { OPENCLAW_DEMO_SECRET } from "@/lib/openclaw/constants";
import { recordsToCsv } from "@/lib/utils/export-csv";
import { maskAccount, seedVendorCards, type VendorCard } from "@/lib/vendors/directory";
import type { AuditRecord, CompanyRules, DecisionStatus, FxRate, Invoice, NewProjectInput, Project, ProjectRules, Vendor } from "@/types/blinka";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const KEYS_STORAGE = "blinka-byok";
const KEYS_EVENT = "blinka-byok-change";

function subscribeKeys(onChange: () => void) {
  window.addEventListener(KEYS_EVENT, onChange);
  return () => window.removeEventListener(KEYS_EVENT, onChange);
}

function readStoredKeys() {
  return window.localStorage.getItem(KEYS_STORAGE) ?? "";
}

function parseKeys(raw: string): ByokKeys {
  if (!raw) return { read: emptyLayer(), explain: emptyLayer() };
  try {
    const parsed = normalizeKeys(JSON.parse(raw));
    return {
      read: parsed.read ?? emptyLayer(),
      explain: parsed.explain ?? emptyLayer(),
      jev: parsed.jev,
    };
  } catch {
    return { read: emptyLayer(), explain: emptyLayer() };
  }
}

type HumanDecision = { decision: "APPROVED" | "BLOCKED"; note: string };

export type CriterionWaiver = { key: string; title: string; comment: string };
type LiveMeta = {
  timings: LayerTiming[];
  raw: unknown;
  explanation: { text: string; mode: "live" | "fallback" };
};
type ArrivalBody = {
  arrived?: Array<{
    invoice: Invoice;
    timings: LayerTiming[];
    raw: unknown;
    explanation: LiveMeta["explanation"];
  }>;
  human?: Record<string, HumanDecision>;
};

export type VendorProfile = Vendor & { accounts: string[] };

type SessionValue = {
  rules: CompanyRules;
  projects: Project[];
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  nav: NavPrefs;
  toggleNav: (section: NavSection) => void;
  placeProject: (fromId: string, toId: string) => void;
  toggleFavorite: (id: string) => void;
  rememberProject: (id: string) => void;
  createProjectOpen: boolean;
  setCreateProjectOpen: (open: boolean) => void;
  addProject: (input: NewProjectInput) => string | null;
  invoices: Invoice[];
  records: AuditRecord[];
  human: Record<string, HumanDecision>;
  waivers: Record<string, CriterionWaiver[]>;
  live: Record<string, LiveMeta>;
  running: boolean;
  liveError: string | null;
  byokOpen: boolean;
  drawerOpen: boolean;
  showRaw: boolean;
  mail: GmailStatus | null;
  mailBusy: boolean;
  keys: ByokKeys;
  vendors: VendorProfile[];
  vendorCards: VendorCard[];
  saveVendorCard: (card: VendorCard) => void;
  autonomous: AuditRecord[];
  improper: AuditRecord[];
  latency: number;
  consumed: number;
  retained: number;
  available: number;
  reviewCount: number;
  statusOf: (record: AuditRecord) => DecisionStatus;
  explanationOf: (invoice: Invoice, record: AuditRecord) => string;
  updateRules: (rules: CompanyRules) => void;
  patchProjectRules: (projectId: string, patch: ProjectRules) => void;
  setProjectStatus: (projectId: string, status: "active" | "archived") => void;
  setByokOpen: (open: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  setShowRaw: (value: boolean | ((current: boolean) => boolean)) => void;
  refreshMail: () => Promise<void>;
  runLive: (ids: string[]) => Promise<void>;
  reset: () => void;
  resetCount: number;
  upload: (file: File) => Promise<Invoice | null>;
  uploadMany: (files: File[]) => Promise<UploadBatch>;
  uploadStatus: string | null;
  exportCsv: (invoiceIds?: string[]) => void;
  notifyOpenClaw: (invoice: Invoice, record: AuditRecord) => Promise<void>;
  saveKeys: (next: ByokKeys) => void;
  decide: (invoiceId: string, decision: "APPROVED" | "BLOCKED", note: string) => void;
  updateInvoice: (invoiceId: string, patch: Partial<Invoice>) => void;
  addVendorToProject: (projectId: string, vendorId: string) => void;
  setVendorProjects: (vendorId: string, projectIds: string[]) => void;
  releaseDecision: (invoiceId: string) => void;
  waiveCriterion: (invoiceId: string, waiver: CriterionWaiver) => void;
  fxOverrides: FxOverride[];
  saveFxOverride: (override: FxOverride) => void;
  removeFxOverride: (id: string) => void;
  fxMarket: FxRate[];
  fxError: string | null;
  fxBusy: boolean;
  refreshFx: () => Promise<void>;
};

export const INVOICE_FILE_ACCEPT =
  "application/pdf,image/png,image/jpeg,image/webp,image/gif,.pdf,.png,.jpg,.jpeg,.webp,.gif";

const INVOICE_FILE_NAME = /\.(pdf|png|jpe?g|webp|gif)$/i;

export type UploadBatch = {
  added: Invoice[];
  failed: string[];
  skipped: string[];
};

function isInvoiceDocument(file: File) {
  const type = file.type.toLowerCase();
  return (
    type === "application/pdf" ||
    type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/webp" ||
    type === "image/gif" ||
    INVOICE_FILE_NAME.test(file.name)
  );
}

function blocksBatch(message: string) {
  const text = message.toLowerCase();
  return text.includes("clave") || text.includes("tope") || text.includes("espera");
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("La sesión no está disponible.");
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<CompanyRules>(() => cloneRules(DEFAULT_RULES));
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState(ALL_PROJECTS);
  const [nav, setNav] = useState<NavPrefs>(() => freshNav());
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_DATASET);
  const [human, setHuman] = useState<Record<string, HumanDecision>>({});
  const [waivers, setWaivers] = useState<Record<string, CriterionWaiver[]>>({});
  const [live, setLive] = useState<Record<string, LiveMeta>>({});
  const [running, setRunning] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [byokOpen, setByokOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [mail, setMail] = useState<GmailStatus | null>(null);
  const [mailBusy, setMailBusy] = useState(false);
  const [vendorCards, setVendorCards] = useState<VendorCard[]>(() => seedVendorCards());
  const [fxOverrides, setFxOverrides] = useState<FxOverride[]>([]);
  const [paymentDay, setPaymentDay] = useState(DEMO_ISSUE_DATE);
  const [fxMarket, setFxMarket] = useState<FxRate[]>([]);
  const [paidRates, setPaidRates] = useState<Record<string, FxRate>>({});
  const [fxError, setFxError] = useState<string | null>(null);
  const [fxBusy, setFxBusy] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const storedKeys = useSyncExternalStore(subscribeKeys, readStoredKeys, () => "");
  const keys = useMemo(() => parseKeys(storedKeys), [storedKeys]);
  const previewUrls = useRef<string[]>([]);
  const invoicesRef = useRef(invoices);
  const seenArrivals = useRef(new Set<string>());
  const pullGeneration = useRef(0);

  useEffect(() => {
    invoicesRef.current = invoices;
  }, [invoices]);
  const refreshFx = useCallback(async () => {
    const asOf = paymentDate();
    setPaymentDay(asOf);
    setFxBusy(true);
    setFxError(null);
    try {
      const response = await fetch("/api/fx/reference");
      const body = (await response.json()) as FxReference;
      if (!response.ok) throw new Error("La referencia no respondió.");
      const rates = ratesFromReference(body, asOf);
      setFxMarket(rates);
      if (rates.length === 0) setFxError(body.errors.join(" ") || "La referencia del día no trajo tasas.");
    } catch {
      setFxMarket([]);
      setFxError("No se pudo consultar la tasa del día.");
    } finally {
      setFxBusy(false);
    }
  }, []);
  useEffect(() => {
    void refreshFx();
  }, [refreshFx]);
  const activeVendors = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const card of vendorCards) map[card.id] = card.status === "authorized";
    return map;
  }, [vendorCards]);
  const records = useMemo(
    () => evaluateBatch(invoices, rules, fxOverrides, paymentDay, fxMarket.length > 0 ? fxMarket : undefined, paidRates, projects, activeVendors),
    [activeVendors, fxMarket, fxOverrides, invoices, paidRates, paymentDay, projects, rules],
  );

  const statusOf = useCallback(
    (record: AuditRecord): DecisionStatus => {
      const note = human[record.invoiceId];
      if (note && record.finalStatus === "ESCALATED") return note.decision;
      if (record.finalStatus === "APPROVED") {
        const source = invoices.find((item) => item.id === record.invoiceId);
        const card = vendorCards.find((item) => item.id === source?.vendorId);
        if (card && card.bankAccounts.length === 0) return "ESCALATED";
      }
      return record.finalStatus;
    },
    [human, invoices, vendorCards],
  );

  useEffect(() => {
    setPaidRates((current) => {
      const next = { ...current };
      let changed = false;
      const liveIds = new Set(invoices.map((invoice) => invoice.id));
      for (const id of Object.keys(next)) {
        if (!liveIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      for (const record of records) {
        const paid = statusOf(record) === "APPROVED" && record.fxSnapshot;
        const pinned = next[record.invoiceId];
        if (paid && record.fxSnapshot && (!pinned || pinned.currency !== record.fxSnapshot.currency)) {
          next[record.invoiceId] = record.fxSnapshot;
          changed = true;
        }
        if (!paid && pinned) {
          delete next[record.invoiceId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [invoices, records, statusOf]);

  const explanationOf = useCallback(
    (invoice: Invoice, record: AuditRecord) => {
      const note = human[invoice.id];
      const liveText = live[invoice.id]?.explanation.text;
      const base = liveText || record.explanation;
      return note ? `${base} Nota humana: ${note.note}` : base;
    },
    [human, live],
  );

  const autonomous = records.filter((record) => record.finalStatus === "APPROVED" && !human[record.invoiceId]);
  const improper = records.filter((record) => record.finalStatus === "APPROVED" && !record.hardRulesResult.passed);
  const consulted = records.filter((record) => record.jevResult);
  const latency = consulted.length
    ? Math.round(consulted.reduce((sum, record) => sum + (record.jevResult?.latencyMs ?? 0), 0) / consulted.length)
    : 0;
  const consumed = records.reduce((sum, record) => sum + (statusOf(record) === "APPROVED" ? record.totalPayableUsd : 0), 0);
  const retained = records.reduce((sum, record) => sum + (statusOf(record) === "ESCALATED" ? record.totalPayableUsd : 0), 0);
  const available = Math.max(0, Number((rules.monthlyBudgetUsd - consumed - retained).toFixed(2)));
  const reviewCount = records.filter((record) => statusOf(record) === "ESCALATED").length;

  const vendors = useMemo<VendorProfile[]>(() => {
    const extras: Record<string, string[]> = {};
    for (const invoice of invoices) {
      const note = human[invoice.id];
      const record = records.find((item) => item.invoiceId === invoice.id);
      if (note?.decision !== "APPROVED" || record?.jevResult?.socialEngineeringRisk.score !== "HIGH") continue;
      const line = invoice.lineItems.find((item) => /cuenta/i.test(item)) ?? `Cuenta solicitada · ${invoice.id}`;
      extras[invoice.vendorId] = [...(extras[invoice.vendorId] ?? []), line];
    }
    return vendorCards.map((card) => {
      const base = VENDORS.find((vendor) => vendor.id === card.id);
      const vendor: Vendor = base ?? {
        id: card.id,
        legalName: card.legal,
        country: card.country,
        active: card.status === "authorized",
        contractSummary: card.service,
        costCenter: card.costCenter,
        bankAccountLast4: card.bankAccounts[0]?.identifier.replace(/\D/g, "").slice(-4) || "0000",
      };
      const registered = card.bankAccounts[0] ? maskAccount(card.bankAccounts[0].identifier) : "Sin cuenta";
      return { ...vendor, active: card.status === "authorized", accounts: [registered, ...(extras[card.id] ?? [])] };
    });
  }, [human, invoices, records, vendorCards]);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const generation = pullGeneration.current;
        const response = await fetch("/api/invoices");
        if (!response.ok || cancelled || generation !== pullGeneration.current) return;
        const body = (await response.json()) as ArrivalBody;
        if (cancelled || generation !== pullGeneration.current) return;
        const arrivals = body.arrived ?? [];
        const extra = arrivals.filter((item) => !seenArrivals.current.has(item.invoice.id));
        if (extra.length > 0) {
          for (const item of extra) seenArrivals.current.add(item.invoice.id);
          setInvoices((current) => {
            const known = new Set(current.map((invoice) => invoice.id));
            const fresh = extra
              .map((item) => item.invoice)
              .filter((invoice) => !known.has(invoice.id))
              .map((invoice) => (invoice.receivedAt ? invoice : { ...invoice, receivedAt: new Date().toISOString() }));
            return fresh.length === 0 ? current : [...current, ...fresh];
          });
        }
        setLive((current) => {
          let changed = false;
          const next = { ...current };
          for (const arrival of arrivals) {
            if (next[arrival.invoice.id]) continue;
            next[arrival.invoice.id] = {
              timings: arrival.timings,
              raw: arrival.raw,
              explanation: arrival.explanation,
            };
            changed = true;
          }
          return changed ? next : current;
        });
        if (body.human) setHuman((current) => ({ ...current, ...body.human }));
      } catch {
        // The next interval retries automatically; this also covers a dev-server restart.
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const refreshMail = useCallback(async () => {
    setMailBusy(true);
    try {
      const response = await fetch("/api/inbound/gmail", { method: "POST" });
      const body = (await response.json().catch(() => null)) as GmailStatus | null;
      if (!response.ok || !body) throw new Error("No se pudo revisar el correo.");
      setMail(body);
    } catch {
      setMail((current) => ({
        connected: current?.connected ?? false,
        address: current?.address ?? null,
        lastPollAt: current?.lastPollAt ?? null,
        lastError: "No se pudo revisar el correo.",
        messages: current?.messages ?? [],
      }));
    } finally {
      setMailBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      setMailBusy(true);
      try {
        const response = await fetch("/api/inbound/gmail", { method: "POST" });
        const body = (await response.json().catch(() => null)) as GmailStatus | null;
        if (cancelled) return;
        if (!response.ok || !body) throw new Error("No se pudo revisar el correo.");
        setMail(body);
      } catch {
        if (!cancelled) {
          setMail((current) => ({
            connected: current?.connected ?? false,
            address: current?.address ?? null,
            lastPollAt: current?.lastPollAt ?? null,
            lastError: "No se pudo revisar el correo.",
            messages: current?.messages ?? [],
          }));
        }
      } finally {
        if (!cancelled) setMailBusy(false);
      }
    }
    void (async () => {
      try {
        const response = await fetch("/api/inbound/gmail");
        const body = (await response.json().catch(() => null)) as GmailStatus | null;
        if (!cancelled && response.ok && body) setMail((current) => current ?? body);
      } catch {
        // The scheduled poll reports the connection state and retries shortly.
      }
    })();
    void tick();
    const timer = window.setInterval(() => void tick(), 25_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const updateRules = useCallback((next: CompanyRules) => {
    const normalized = normalizeRules(next);
    setRules(normalized);
    setHuman({});
    void fetch("/api/session/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(normalized),
    });
  }, []);

  const setProjectStatus = useCallback((projectId: string, status: "active" | "archived") => {
    setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, status } : project)));
  }, []);

  const patchProjectRules = useCallback((projectId: string, patch: ProjectRules) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              rules: {
                ...project.rules,
                ...patch,
                criteria: patch.criteria ? { ...project.rules.criteria, ...patch.criteria } : project.rules.criteria,
              },
            }
          : project,
      ),
    );
    setHuman({});
  }, []);

  const runLive = useCallback(
    async (ids: string[]) => {
      setRunning(true);
      setLiveError(null);
      try {
        const response = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids, rules, keys, invoices, projects }),
        });
        const body = (await response.json()) as {
          error?: string;
          invoices?: Invoice[];
          results?: Array<{ invoice: Invoice; timings: LayerTiming[]; raw: unknown; explanation: LiveMeta["explanation"] }>;
        };
        if (!response.ok || !body.invoices || !body.results) throw new Error(body.error ?? "La ejecución en vivo no respondió.");
        setInvoices(body.invoices);
        setLive((current) => {
          const next = { ...current };
          for (const result of body.results ?? []) {
            next[result.invoice.id] = {
              timings: result.timings,
              raw: result.raw,
              explanation: result.explanation,
            };
          }
          return next;
        });
      } catch (error) {
        setLiveError(error instanceof Error ? error.message : "La ejecución en vivo falló.");
      } finally {
        setRunning(false);
      }
    },
    [invoices, keys, projects, rules],
  );

  const reset = useCallback(() => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current = [];
    seenArrivals.current = new Set();
    pullGeneration.current += 1;
    setRules(cloneRules(DEFAULT_RULES));
    setProjects(INITIAL_PROJECTS);
    setActiveProjectId(ALL_PROJECTS);
    setNav(freshNav());
    setCreateProjectOpen(false);
    setInvoices(INITIAL_DATASET);
    setHuman({});
    setWaivers({});
    setLive({});
    setLiveError(null);
    setVendorCards(seedVendorCards());
    setFxOverrides([]);
    setPaidRates({});
    setResetCount((current) => current + 1);
    void fetch("/api/invoices", { method: "DELETE" });
    void fetch("/api/webhooks/openclaw", {
      method: "DELETE",
      headers: { "x-openclaw-secret": OPENCLAW_DEMO_SECRET },
    });
  }, []);

  const ingestFile = useCallback(
    async (file: File, known: Invoice[]) => {
      if (file.size > 4 * 1024 * 1024) return { invoice: null, error: `${file.name} supera 4 MB.` };
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("rules", JSON.stringify(rules));
        form.set("keys", JSON.stringify(keys));
        form.set("invoices", JSON.stringify(known));
        form.set("projects", JSON.stringify(projects));
        const response = await fetch("/api/invoices", { method: "POST", body: form });
        const body = (await response.json()) as {
          error?: string;
          invoice?: Invoice;
          timings?: LayerTiming[];
          raw?: unknown;
          explanation?: LiveMeta["explanation"];
        };
        if (!response.ok || !body.invoice || !body.timings || !body.explanation) {
          const message = body.error ?? "No se pudo leer la factura.";
          if (message.toLowerCase().includes("clave")) setByokOpen(true);
          return { invoice: null, error: message };
        }
        const preview = URL.createObjectURL(file);
        previewUrls.current.push(preview);
        const invoice = {
          ...body.invoice,
          documentPath: preview,
          receivedAt: body.invoice.receivedAt ?? new Date().toISOString(),
        };
        seenArrivals.current.add(invoice.id);
        setInvoices((current) => {
          const index = current.findIndex((item) => item.id === invoice.id);
          if (index < 0) return [...current, invoice];
          const next = [...current];
          next[index] = { ...next[index], documentPath: preview };
          return next;
        });
        setLive((current) => ({
          ...current,
          [invoice.id]: { timings: body.timings ?? [], raw: body.raw, explanation: body.explanation ?? { text: "", mode: "fallback" } },
        }));
        return { invoice, error: null };
      } catch (error) {
        return { invoice: null, error: error instanceof Error ? error.message : "No se pudo leer la factura." };
      }
    },
    [keys, projects, rules],
  );

  const rememberUploaded = useCallback((known: Invoice[], invoice: Invoice) => {
    const next = known.some((item) => item.id === invoice.id)
      ? known.map((item) => (item.id === invoice.id ? { ...item, ...invoice } : item))
      : [...known, invoice];
    invoicesRef.current = next;
    return next;
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setRunning(true);
      setLiveError(null);
      setUploadStatus(file.name);
      try {
        const result = await ingestFile(file, invoicesRef.current);
        if (result.invoice) rememberUploaded(invoicesRef.current, result.invoice);
        setLiveError(result.error);
        return result.invoice;
      } finally {
        setRunning(false);
        setUploadStatus(null);
      }
    },
    [ingestFile, rememberUploaded],
  );

  const uploadMany = useCallback(
    async (files: File[]) => {
      const supported: File[] = [];
      const skipped: string[] = [];
      for (const file of files) {
        if (isInvoiceDocument(file)) supported.push(file);
        else skipped.push(file.name);
      }
      const added: Invoice[] = [];
      const failed: string[] = [];
      const reasons = new Set<string>();
      if (supported.length === 0) {
        setLiveError(skipped.length ? `Formato no admitido: ${skipped.join(", ")}. Usa PDF, JPG, PNG, WEBP o GIF.` : null);
        return { added, failed, skipped };
      }
      let known = invoicesRef.current;
      let stopMessage: string | null = null;
      setRunning(true);
      setLiveError(null);
      try {
        for (let index = 0; index < supported.length; index += 1) {
          const file = supported[index];
          setUploadStatus(`Leyendo ${index + 1} de ${supported.length}: ${file.name}`);
          const result = await ingestFile(file, known);
          if (result.invoice) {
            added.push(result.invoice);
            known = rememberUploaded(known, result.invoice);
            continue;
          }
          failed.push(file.name);
          if (result.error) reasons.add(result.error);
          if (result.error && blocksBatch(result.error)) {
            stopMessage = result.error;
            break;
          }
        }
      } finally {
        setRunning(false);
        setUploadStatus(null);
      }
      const notes = [
        stopMessage,
        skipped.length ? `Formato no admitido: ${skipped.join(", ")}.` : "",
        failed.length && !stopMessage
          ? `No se pudieron leer: ${failed.join(", ")}.${reasons.size ? ` ${[...reasons].join(" ")}` : ""}`
          : "",
      ].filter(Boolean);
      setLiveError(notes.length ? notes.join(" ") : null);
      return { added, failed, skipped };
    },
    [ingestFile, rememberUploaded],
  );

  const exportCsv = useCallback((invoiceIds?: string[]) => {
    const allowed = invoiceIds ? new Set(invoiceIds) : null;
    const chosen = allowed ? invoices.filter((invoice) => allowed.has(invoice.id)) : invoices;
    const exportRecords = records.flatMap((record) => {
      if (allowed && !allowed.has(record.invoiceId)) return [];
      const invoice = invoices.find((item) => item.id === record.invoiceId);
      return [{
        ...record,
        finalStatus: statusOf(record),
        explanation: invoice ? explanationOf(invoice, record) : record.explanation,
      }];
    });
    const blob = new Blob([recordsToCsv(chosen, exportRecords)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wallet-proof-conciliacion.csv";
    link.click();
    URL.revokeObjectURL(url);
  }, [explanationOf, invoices, records, statusOf]);

  const notifyOpenClaw = useCallback(
    async (invoice: Invoice, record: AuditRecord) => {
      const response = await fetch("/api/webhooks/openclaw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-openclaw-secret": OPENCLAW_DEMO_SECRET,
        },
        body: JSON.stringify({
          kind: "escalation",
          invoiceId: invoice.id,
          payload: {
            totalPayableUsd: record.totalPayableUsd,
            status: record.finalStatus,
            explanation: live[invoice.id]?.explanation.text ?? record.explanation,
          },
        }),
      });
      if (!response.ok) {
        setLiveError("No se pudo avisar a OpenClaw.");
        return;
      }
      setDrawerOpen(true);
    },
    [live],
  );

  const saveKeys = useCallback((next: ByokKeys) => {
    window.localStorage.setItem(KEYS_STORAGE, JSON.stringify(next));
    window.dispatchEvent(new Event(KEYS_EVENT));
    setByokOpen(false);
  }, []);

  const toggleNav = useCallback((section: NavSection) => {
    setNav((current) => ({ ...current, open: { ...current.open, [section]: !current.open[section] } }));
  }, []);

  const placeProject = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setNav((current) => {
      const orderedIds = orderedProjects(projects, current.order).map((project) => project.id);
      const visible = sidebarProjects(projects, current).map((project) => project.id);
      const order = reorderIds(orderedIds, visible, fromId, toId);
      return order ? { ...current, order } : current;
    });
  }, [projects]);

  const toggleFavorite = useCallback((id: string) => {
    setNav((current) => {
      const ordered = orderedProjects(projects, current.order);
      if (!usesFavorites(ordered.length)) return current;
      const favorites = current.favorites.includes(id)
        ? current.favorites.filter((item) => item !== id)
        : [...current.favorites, id];
      return { ...current, order: ordered.map((project) => project.id), favorites };
    });
  }, [projects]);

  const rememberProject = useCallback((id: string) => {
    if (!id) return;
    setNav((current) => (current.open.projects ? current : { ...current, open: { ...current.open, projects: true } }));
  }, []);

  const addProject = useCallback(
    (input: NewProjectInput) => {
      const code = input.code.trim().toUpperCase();
      const name = input.name.trim();
      if (!name || !code || projects.some((item) => item.code.toUpperCase() === code)) return null;
      const slug = code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "proyecto";
      let id = `prj-${slug}`;
      let sequence = 2;
      while (projects.some((item) => item.id === id)) id = `prj-${slug}-${sequence++}`;
      const description = input.description?.trim();
      const vendorListName = input.vendorListName?.trim();
      const project: Project = {
        id,
        name,
        code,
        status: "active",
        description: description || undefined,
        vendorListName: vendorListName || undefined,
        budgetMonth: input.budgetMonth,
        currencies: input.currencies,
        vendorIds: input.vendorIds ?? [],
        rules: input.monthlyBudgetUsd == null ? {} : { monthlyBudgetUsd: input.monthlyBudgetUsd },
      };
      setProjects((current) => [...current, project]);
      setActiveProjectId(id);
      setNav((current) => {
        const previous = orderedProjects(projects, current.order).map((project) => project.id);
        const order = [id, ...previous.filter((item) => item !== id)];
        const nextCount = previous.length + 1;
        if (!usesFavorites(nextCount)) {
          return { ...current, order, open: { ...current.open, projects: true } };
        }
        const active = new Set(previous);
        const kept = current.favorites.filter((item) => active.has(item));
        const base = kept.length > 0 ? kept : previous.slice(0, SIDEBAR_PROJECT_LIMIT);
        return {
          ...current,
          order,
          favorites: [id, ...base.filter((item) => item !== id)],
          open: { ...current.open, projects: true },
        };
      });
      return id;
    },
    [projects],
  );

  const saveVendorCard = useCallback((card: VendorCard) => {
    setVendorCards((current) => {
      const index = current.findIndex((item) => item.id === card.id);
      if (index < 0) return [...current, card];
      const next = [...current];
      next[index] = card;
      return next;
    });
  }, []);

  const saveFxOverride = useCallback((override: FxOverride) => {
    setFxOverrides((current) => {
      const index = current.findIndex(
        (item) =>
          item.scope === override.scope &&
          item.date === override.date &&
          item.currency === override.currency &&
          item.invoiceId === override.invoiceId &&
          item.vendorId === override.vendorId,
      );
      if (index < 0) return [...current, override];
      const next = [...current];
      next[index] = override;
      return next;
    });
  }, []);

  const removeFxOverride = useCallback((id: string) => {
    setFxOverrides((current) => current.filter((item) => item.id !== id));
  }, []);

  const decide = useCallback(
    (invoiceId: string, decision: "APPROVED" | "BLOCKED", note: string) => {
      const record = records.find((item) => item.invoiceId === invoiceId);
      if (!record || statusOf(record) !== "ESCALATED" || !note.trim()) return;
      setHuman((current) => ({ ...current, [invoiceId]: { decision, note: note.trim() } }));
    },
    [records, statusOf],
  );

  const releaseDecision = useCallback((invoiceId: string) => {
    setHuman((current) => {
      if (!current[invoiceId]) return current;
      const next = { ...current };
      delete next[invoiceId];
      return next;
    });
  }, []);

  const updateInvoice = useCallback((invoiceId: string, patch: Partial<Invoice>) => {
    setInvoices((current) => current.map((item) => (item.id === invoiceId ? { ...item, ...patch } : item)));
    setHuman((current) => {
      if (!current[invoiceId]) return current;
      const next = { ...current };
      delete next[invoiceId];
      return next;
    });
  }, []);

  const waiveCriterion = useCallback((invoiceId: string, waiver: CriterionWaiver) => {
    setWaivers((current) => {
      const list = current[invoiceId] ?? [];
      if (list.some((item) => item.key === waiver.key)) {
        return { ...current, [invoiceId]: list.map((item) => (item.key === waiver.key ? waiver : item)) };
      }
      return { ...current, [invoiceId]: [...list, waiver] };
    });
  }, []);

  const addVendorToProject = useCallback((projectId: string, vendorId: string) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId && !project.vendorIds.includes(vendorId)
          ? { ...project, vendorIds: [...project.vendorIds, vendorId] }
          : project,
      ),
    );
  }, []);

  const setVendorProjects = useCallback((vendorId: string, projectIds: string[]) => {
    const chosen = new Set(projectIds);
    setProjects((current) =>
      current.map((project) => {
        const has = project.vendorIds.includes(vendorId);
        const should = chosen.has(project.id);
        if (should && !has) return { ...project, vendorIds: [...project.vendorIds, vendorId] };
        if (!should && has) return { ...project, vendorIds: project.vendorIds.filter((item) => item !== vendorId) };
        return project;
      }),
    );
  }, []);

  const value: SessionValue = {
    rules,
    projects,
    activeProjectId,
    setActiveProjectId,
    nav,
    toggleNav,
    placeProject,
    toggleFavorite,
    rememberProject,
    createProjectOpen,
    setCreateProjectOpen,
    addProject,
    invoices,
    records,
    human,
    waivers,
    live,
    running,
    uploadStatus,
    liveError,
    byokOpen,
    drawerOpen,
    showRaw,
    mail,
    mailBusy,
    keys,
    vendors,
    vendorCards,
    saveVendorCard,
    autonomous,
    improper,
    latency,
    consumed,
    retained,
    available,
    reviewCount,
    statusOf,
    explanationOf,
    updateRules,
    patchProjectRules,
    setProjectStatus,
    setByokOpen,
    setDrawerOpen,
    setShowRaw,
    refreshMail,
    runLive,
    reset,
    resetCount,
    upload,
    uploadMany,
    exportCsv,
    notifyOpenClaw,
    saveKeys,
    decide,
    updateInvoice,
    addVendorToProject,
    setVendorProjects,
    releaseDecision,
    waiveCriterion,
    fxOverrides,
    saveFxOverride,
    removeFxOverride,
    fxMarket,
    fxError,
    fxBusy,
    refreshFx,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

"use client";

import { useSession, type CriterionWaiver } from "@/components/session/session-provider";
import { SearchMenu, SelectMenu } from "@/components/ui/select-menu";
import { Dialog, RequiredMark, RequiredNote } from "@/components/ui/ui";
import { describeChecks, type CheckRow } from "@/lib/engine/criteria";
import { currencyChoices, isPayableCurrency } from "@/lib/engine/currency";
import { COUNTRIES } from "@/lib/vendors/countries";
import { amount, statusClass, statusLabel, usd, vendorDisplay } from "@/lib/format";
import type { AuditRecord, DecisionStatus, Invoice, Project } from "@/types/blinka";
import type { VendorCard } from "@/lib/vendors/directory";
import { ArrowLeft, Check, ChevronRight, Printer, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type WorkKind = "confirm-project" | "add-vendor" | "add-bank" | "review-bank" | "fix-concept" | "edit-invoice" | "edit-rate";
type IssueAction = { id: WorkKind | "approve"; label: string };
type ReviewIssue = { key: string; title: string; detail: string; actions: IssueAction[] };
type ModalState = { kind: WorkKind } | { kind: "exception"; issue: ReviewIssue };

function namedOptions(options: readonly string[], current: string) {
  const values = current && !options.includes(current) ? [current, ...options] : [...options];
  return values.map((item) => ({ value: item, label: item }));
}

function currencyOptions(current: string) {
  const choices = currencyChoices().map((choice) => ({ value: choice.code, label: `${choice.code} · ${choice.name}` }));
  if (current && !choices.some((choice) => choice.value === current)) return [{ value: current, label: current }, ...choices];
  return choices;
}

function longDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function dueDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + 19);
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "long" }).format(date);
}

function money(value: number, currency: string): string {
  return amount(value, currency);
}

function conceptOf(invoice: Invoice): string {
  const line = invoice.lineItems[0]?.split("—")[0]?.trim();
  return line || invoice.description;
}

function sentence(value: string): string {
  const clean = value.replace(/\.\s*$/, "").trim();
  return clean.charAt(0).toLowerCase() + clean.slice(1);
}

type ShownRow = {
  id: string;
  label: string;
  detail: string;
  tone: "pass" | "exception" | "adjusted" | "fail";
  note?: string;
  action: CheckRow["action"];
};

const WAIVER_KEYS: Record<string, string[]> = {
  project: ["project"],
  whitelist: ["vendor"],
  projectVendor: ["vendor"],
  anomalyHigh: ["bank"],
  limit: ["limit-agree", "limit-company", "limit"],
  budget: ["budget"],
  contract: ["service"],
  fx: ["fx"],
  duplicate: ["duplicate"],
  lineCheck: ["lines"],
};

function waiversForCheck(checkId: string, granted: CriterionWaiver[]): CriterionWaiver[] {
  const keys = WAIVER_KEYS[checkId] ?? [checkId];
  return granted.filter((item) => keys.includes(item.key));
}

function plainCopy(check: CheckRow, invoice: Invoice, record: AuditRecord): { label: string; pass: string; fail: string } {
  const amount = `${record.totalPayableUsd.toFixed(2)} USD`;
  const cap = `${record.rulesSnapshot.maxAutoApproveUsd.toFixed(2)} USD`;
  if (check.detail.startsWith("Criterio desactivado")) {
    return { label: everydayLabel(check.id), pass: "Este punto no se usa en esta revisión.", fail: "Este punto no se usa en esta revisión." };
  }
  switch (check.id) {
    case "extraction":
      return {
        label: "Datos de la factura",
        pass: "La factura incluye proveedor, fecha, número y total.",
        fail: invoice.extractionNote || "Faltan datos necesarios para revisar la factura.",
      };
    case "fx": {
      const snap = record.fxSnapshot;
      const adjusted = snap?.source === "Tasa modificada";
      const pass = !snap
        ? "Hay una tasa del día para expresar el importe en dólares."
        : invoice.currency === "USD"
          ? "La factura está emitida en dólares."
          : adjusted
            ? `La tasa de este día fue ajustada: 1 dólar equivale a ${snap.rateToUsd} ${snap.currency}.`
            : `1 dólar equivale a ${snap.rateToUsd} ${snap.currency} en la fecha de la factura.`;
      return {
        label: "Conversión a dólares",
        pass,
        fail: `No hay una tasa del día para convertir ${invoice.currency} a dólares.`,
      };
    }
    case "duplicate":
      return {
        label: "Factura no duplicada",
        pass: "No hay otra factura con la misma referencia y el mismo proveedor.",
        fail: "Ya existe otra factura con la misma referencia y el mismo proveedor.",
      };
    case "budget":
      return {
        label: "Presupuesto disponible",
        pass: `El importe de ${amount} cabe en el presupuesto restante.`,
        fail: check.detail.includes("proyecto")
          ? "El importe no cabe en el presupuesto de este proyecto."
          : check.detail.includes("Sin equivalente")
            ? "No hay un importe en dólares para compararlo con el presupuesto."
            : "El importe no cabe en el presupuesto de la empresa para este periodo.",
      };
    case "whitelist":
      return {
        label: "Proveedor autorizado",
        pass: "El proveedor está autorizado para este cobro.",
        fail: "El proveedor no está autorizado para este cobro.",
      };
    case "project":
      return {
        label: "Proyecto identificado",
        pass: "La factura está asignada a un proyecto.",
        fail: "La factura no tiene un proyecto confirmado.",
      };
    case "projectVendor":
      return {
        label: "Proveedor del proyecto",
        pass: "El proveedor figura en la lista de este proyecto.",
        fail: "El proveedor no figura en la lista de este proyecto.",
      };
    case "limit":
      return {
        label: "Dentro del límite",
        pass: `El importe de ${amount} no supera el máximo de ${cap}.`,
        fail: `El importe de ${amount} supera el máximo de ${cap}.`,
      };
    case "lineCheck":
      return {
        label: "Total consistente",
        pass: "La suma de los conceptos coincide con el total.",
        fail: invoice.lineCheck || "La suma de los conceptos no coincide con el total.",
      };
    case "anomalyHigh":
      return {
        label: "Cuenta de pago",
        pass: "No hay una solicitud de pagar a una cuenta distinta.",
        fail: "La factura pide pagar a una cuenta distinta o el mensaje no es fiable.",
      };
    case "anomalyMedium":
      return {
        label: "Señal de revisión",
        pass: "No hay una señal adicional sobre este cobro.",
        fail: "Hay una señal que requiere revisión de una persona.",
      };
    case "contract":
      return {
        label: "Concepto del servicio",
        pass: "El concepto corresponde al servicio acordado.",
        fail: "El concepto no corresponde al servicio acordado.",
      };
    case "semanticDuplicate":
      return {
        label: "Trabajo no repetido",
        pass: "No corresponde a un trabajo ya cobrado en otra factura.",
        fail: "Corresponde a un trabajo ya cobrado en otra factura.",
      };
    default:
      return {
        label: "Revisión del contenido",
        pass: "Se pudo revisar si el contenido coincide con lo acordado.",
        fail: "Todavía no se pudo revisar si el contenido coincide con lo acordado.",
      };
  }
}

function everydayLabel(id: string): string {
  const labels: Record<string, string> = {
    extraction: "Datos de la factura",
    fx: "Conversión a dólares",
    duplicate: "Factura no duplicada",
    budget: "Presupuesto disponible",
    whitelist: "Proveedor autorizado",
    project: "Proyecto identificado",
    projectVendor: "Proveedor del proyecto",
    limit: "Dentro del límite",
    lineCheck: "Total consistente",
    anomalyHigh: "Cuenta de pago",
    anomalyMedium: "Señal de revisión",
    contract: "Concepto del servicio",
    semanticDuplicate: "Trabajo no repetido",
    jev: "Revisión del contenido",
  };
  return labels[id] ?? "Punto por revisar";
}

const ADJUSTED = "Ajuste manual. Una persona modificó este punto para esta factura. Queda registrado y no cuenta como cumplimiento automático.";
const EXCEPTION = "Excepción registrada. Este criterio no se cumplió y una persona lo autorizó solo para esta factura.";

function touchFor(checkId: string, touches: CriterionWaiver[]): CriterionWaiver | undefined {
  return touches.find((item) => item.key === `touch:${checkId}` || (checkId === "anomalyHigh" && item.key === "touch:bank"));
}

function presentRows(
  checks: CheckRow[],
  invoice: Invoice,
  record: AuditRecord,
  granted: CriterionWaiver[],
  touches: CriterionWaiver[],
): ShownRow[] {
  const used = new Set<string>();
  const rows = checks.map((check) => {
    const copy = plainCopy(check, invoice, record);
    const touch = touchFor(check.id, touches);
    const matched = check.pass ? [] : waiversForCheck(check.id, granted);
    matched.forEach((item) => used.add(item.key));
    if (matched.length > 0) {
      const note = matched.map((item) => item.comment).filter(Boolean).join(" ");
      return {
        id: check.id,
        label: copy.label,
        detail: EXCEPTION,
        tone: "exception" as const,
        note: note || undefined,
        action: check.action,
      };
    }
    if (check.pass && touch) {
      return {
        id: check.id,
        label: copy.label,
        detail: ADJUSTED,
        tone: "adjusted" as const,
        note: touch.comment || undefined,
        action: check.action,
      };
    }
    return {
      id: check.id,
      label: copy.label,
      detail: check.pass ? copy.pass : copy.fail,
      tone: check.pass ? ("pass" as const) : ("fail" as const),
      note: !check.pass && touch?.comment ? touch.comment : undefined,
      action: check.action,
    };
  });
  for (const item of granted) {
    if (used.has(item.key)) continue;
    const relatedIds = Object.entries(WAIVER_KEYS)
      .filter(([, keys]) => keys.includes(item.key))
      .map(([id]) => id);
    const related = checks.filter((check) => relatedIds.includes(check.id));
    if (related.length > 0 && related.every((check) => check.pass)) continue;
    used.add(item.key);
    rows.push({
      id: item.key,
      label: item.title,
      detail: EXCEPTION,
      tone: "exception",
      note: item.comment || undefined,
      action: "ESCALATED",
    });
  }
  const bankTouch = touches.find((item) => item.key === "touch:bank");
  if (bankTouch && !rows.some((row) => row.id === "anomalyHigh")) {
    rows.push({
      id: "bank",
      label: "Cuenta de pago",
      detail: "Ajuste manual. Una persona registró la cuenta de pago de este proveedor.",
      tone: "adjusted",
      note: bankTouch.comment || undefined,
      action: null,
    });
  }
  return rows;
}

function leadText(status: DecisionStatus, rows: ShownRow[], humanNote?: string): string {
  const exceptions = rows.filter((row) => row.tone === "exception");
  const adjusted = rows.filter((row) => row.tone === "adjusted");
  const fails = rows.filter((row) => row.tone === "fail");
  const names = exceptions.map((row) => row.label.toLowerCase()).join(", ");
  if (status === "APPROVED") {
    if (exceptions.length > 0) {
      return exceptions.length === 1
        ? `Una persona confirmó el pago. Este criterio no se cumplía y quedó autorizado solo para esta factura: ${names}.`
        : `Una persona confirmó el pago. Estos criterios no se cumplían y quedaron autorizados solo para esta factura: ${names}.`;
    }
    if (adjusted.length > 0) {
      return "El pago queda habilitado. Hay criterios modificados por una persona: quedan registrados y no cuentan como cumplimiento automático.";
    }
    if (humanNote && humanNote !== "Confirmado desde el detalle.") return `Una persona confirmó el pago. ${humanNote}`;
    return "La factura cumple los requisitos. El importe, el proveedor y el concepto coinciden con lo acordado.";
  }
  if (status === "BLOCKED") {
    const reason = fails[0]?.detail ?? "Hay un criterio que impide el pago.";
    if (humanNote && humanNote !== "Rechazada desde el detalle.") return `Una persona rechazó la factura. ${reason}`;
    return reason;
  }
  if (exceptions.length > 0 || adjusted.length > 0) {
    return "Hay puntos pendientes. Lo que modificó o autorizó una persona queda registrado y no cuenta como cumplimiento automático.";
  }
  return "Hay puntos pendientes antes de autorizar el pago.";
}

function technicalSnapshot(
  invoice: Invoice,
  project: Project | undefined,
  status: DecisionStatus,
  reason: string,
  rows: ShownRow[],
  exceptions: CriterionWaiver[],
  human: { decision: "APPROVED" | "BLOCKED"; note: string } | undefined,
) {
  return {
    invoiceId: invoice.id,
    status: status === "APPROVED" ? "approved" : status === "BLOCKED" ? "rejected" : "review",
    code: status === "APPROVED" ? "within" : status === "BLOCKED" ? "blocked" : "review",
    reason,
    humanDecision: human
      ? { by: "persona", decision: human.decision === "APPROVED" ? "approved" : "rejected", note: human.note }
      : null,
    exceptions: exceptions.map((item) => ({
      criterionId: item.key,
      title: item.title,
      comment: item.comment,
      by: "persona",
      invoiceId: invoice.id,
      note: "Autorizado a mano solo para esta factura. El criterio no se cumplió por sí solo.",
    })),
    adjustments: rows
      .filter((row) => row.tone === "adjusted")
      .map((row) => ({
        criterionId: row.id,
        title: row.label,
        comment: row.note ?? "",
        by: "persona",
        invoiceId: invoice.id,
        note: "Una persona modificó este criterio. No cuenta como cumplimiento automático.",
      })),
    checks: rows.map((row) => ({
      label: row.label,
      pass: row.tone === "pass",
      outcome:
        row.tone === "pass" ? "met" : row.tone === "exception" ? "human_exception" : row.tone === "adjusted" ? "human_adjustment" : "unmet",
      detail: row.note ? `${row.detail} ${row.note}` : row.detail,
      action: row.action === "BLOCKED" ? "block" : "review",
      criterionId: row.id,
      scope: project?.name ?? "Empresa",
      humanAuthorization:
        row.tone === "exception" || row.tone === "adjusted"
          ? {
              by: "persona",
              kind: row.tone === "adjusted" ? "adjustment" : "exception",
              invoiceId: invoice.id,
              comment: row.note ?? "",
              note:
                row.tone === "adjusted"
                  ? "Ajuste manual. No cuenta como cumplimiento automático."
                  : "Autorizado a mano. No cuenta como criterio cumplido.",
            }
          : null,
    })),
  };
}

function askedAccount(invoice: Invoice): string {
  const line = invoice.lineItems.find((item) => /cuenta/i.test(item)) ?? "";
  const tail = line.match(/\d{4}/)?.[0];
  return tail ? `SYN-${tail}` : line || "una cuenta distinta";
}

function visibleChecks(checks: CheckRow[], hardPassed: boolean): CheckRow[] {
  return checks.filter((check) => !(check.id === "jev" && !hardPassed));
}

function reviewIssues(
  invoice: Invoice,
  checks: CheckRow[],
  card: VendorCard | undefined,
  project: Project | undefined,
  totalUsd: number,
  limitUsd: number,
  projectLimitUsd: number | undefined,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const push = (issue: ReviewIssue) => {
    if (!issues.some((item) => item.key === issue.key)) issues.push(issue);
  };
  const name = vendorDisplay(invoice.vendorId, invoice.vendorName);
  const payable = Number.isFinite(totalUsd) && totalUsd > 0 ? usd(totalUsd) : money(invoice.totalPayable, invoice.currency);

  for (const check of checks) {
    if (check.pass) continue;
    if (check.id === "project") {
      push({
        key: "project",
        title: "Proyecto identificado",
        detail: "La factura no tiene un proyecto confirmado.",
        actions: [{ id: "confirm-project", label: "Confirmar proyecto" }],
      });
    } else if (check.id === "projectVendor" || check.id === "whitelist") {
      push({
        key: "vendor",
        title: "Proveedor en la lista del proyecto",
        detail: `${name} todavía no está autorizado para este proyecto.`,
        actions: [{ id: "add-vendor", label: "Añadir proveedor a la lista" }],
      });
    } else if (check.id === "anomalyHigh") {
      const saved = card?.bankAccounts[0]?.identifier;
      push({
        key: "bank",
        title: "Cuenta de pago registrada",
        detail: saved
          ? `La factura indica ${askedAccount(invoice)}. La cuenta guardada es ${saved}.`
          : "Falta registrar una cuenta de pago para este proveedor.",
        actions: [{ id: saved ? "review-bank" : "add-bank", label: saved ? "Revisar datos de pago del proveedor" : "Añadir datos de pago del proveedor" }],
      });
    } else if (check.id === "limit") {
      if (projectLimitUsd != null && totalUsd > projectLimitUsd) {
        push({
          key: "limit-agree",
          title: "Límite del acuerdo con el proveedor",
          detail: `El total es ${payable} y el límite del acuerdo es ${usd(projectLimitUsd)}.`,
          actions: [{ id: "approve", label: "Autorizar excepción" }],
        });
      }
      if (totalUsd > limitUsd) {
        push({
          key: "limit-company",
          title: "Límite de la empresa",
          detail: `El total es ${payable} y el máximo de la empresa es ${usd(limitUsd)}.`,
          actions: [{ id: "approve", label: "Autorizar excepción" }],
        });
      }
      if (!(projectLimitUsd != null && totalUsd > projectLimitUsd) && !(totalUsd > limitUsd)) {
        push({
          key: "limit-company",
          title: "Límite de la empresa",
          detail: `El total es ${payable} y el máximo de la empresa es ${usd(limitUsd)}.`,
          actions: [{ id: "approve", label: "Autorizar excepción" }],
        });
      }
    } else if (check.id === "budget") {
      push({
        key: "budget",
        title: check.detail.includes("proyecto") ? "Presupuesto del proyecto" : "Presupuesto de la empresa",
        detail: check.detail.includes("proyecto")
          ? "El importe no cabe en el presupuesto de este proyecto."
          : check.detail.includes("Sin equivalente")
            ? "Sin un importe en dólares no se puede saber si cabe en el presupuesto."
            : "El importe no cabe en el presupuesto de la empresa para este periodo.",
        actions: check.action === "BLOCKED" ? [] : [{ id: "approve", label: "Autorizar excepción" }],
      });
    } else if (check.id === "contract") {
      const agreed = card?.service || "el servicio registrado";
      push({
        key: "service",
        title: "Servicio acorde con el acuerdo",
        detail: `El cobro es por ${sentence(conceptOf(invoice))}; el acuerdo cubre ${sentence(agreed)}.`,
        actions: [
          { id: "fix-concept", label: "Corregir concepto" },
          { id: "approve", label: "Autorizar excepción" },
        ],
      });
    } else if (check.id === "fx") {
      push({
        key: "fx",
        title: "Conversión a dólares",
        detail: `No hay una tasa del día para convertir ${invoice.currency} a dólares.`,
        actions: [{ id: "edit-rate", label: "Editar tasa de hoy" }],
      });
    } else if (check.id === "duplicate") {
      push({
        key: "duplicate",
        title: "Factura repetida",
        detail: "Ya existe otra factura con la misma referencia y el mismo proveedor.",
        actions: [],
      });
    } else if (check.id === "lineCheck") {
      push({
        key: "lines",
        title: "El total no cuadra",
        detail: invoice.lineCheck || "La suma de los conceptos no coincide con el total.",
        actions: [{ id: "edit-invoice", label: "Editar datos de la factura" }],
      });
    } else {
      push({
        key: check.id,
        title: everydayLabel(check.id),
        detail: "Este criterio no se cumple y debe revisarse antes del pago.",
        actions: check.action === "BLOCKED" ? [] : [{ id: "approve", label: "Autorizar excepción" }],
      });
    }
  }

  if (card && card.bankAccounts.length === 0 && !issues.some((item) => item.key === "bank")) {
    push({
      key: "bank",
      title: "Cuenta de pago registrada",
      detail: "Falta registrar una cuenta de pago para este proveedor.",
      actions: [{ id: "add-bank", label: "Añadir datos de pago del proveedor" }],
    });
  }

  return issues;
}

export function DetailView({ id }: { id: string }) {
  const session = useSession();
  const invoice = session.invoices.find((item) => item.id === id);
  const record = session.records.find((item) => item.invoiceId === id);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [formError, setFormError] = useState("");
  const [missing, setMissing] = useState<Record<string, string>>({});
  const [payError, setPayError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [comment, setComment] = useState("");

  if (!invoice || !record) {
    return (
      <div className="id-page">
        <Link href="/" className="back">
          <ArrowLeft className="icon" /> Volver a Facturas
        </Link>
        <h1>Factura no encontrada</h1>
        <p>Esa factura no está en la sesión actual.</p>
      </div>
    );
  }

  const status = session.statusOf(record);
  const pending = status === "ESCALATED";
  const card = session.vendorCards.find((item) => item.id === invoice.vendorId);
  const project = session.projects.find((item) => item.id === invoice.projectId);
  const checks = visibleChecks(describeChecks(invoice, record), record.hardRulesResult.passed);
  const granted = (session.waivers[invoice.id] ?? []).filter((item) => !item.key.startsWith("log:") && !item.key.startsWith("touch:"));
  const touches = (session.waivers[invoice.id] ?? []).filter((item) => item.key.startsWith("touch:"));
  const notes = (session.waivers[invoice.id] ?? []).filter((item) => item.key.startsWith("log:"));
  const grantedKeys = new Set(granted.map((item) => item.key));
  const allIssues = pending
    ? reviewIssues(
        invoice,
        checks,
        card,
        project,
        record.totalPayableUsd,
        session.rules.maxAutoApproveUsd,
        project?.rules.maxAutoApproveUsd,
      )
    : [];
  const issues = allIssues.filter((item) => !grantedKeys.has(item.key));
  const passed = checks.filter((check) => check.pass);
  const rows = presentRows(checks, invoice, record, granted, touches);
  const passedRows = rows.filter((row) => row.tone === "pass");
  const exceptionRows = rows.filter((row) => row.tone === "exception");
  const adjustedRows = rows.filter((row) => row.tone === "adjusted");
  const failedRows = rows.filter((row) => row.tone === "fail");
  const totalCriteria = passed.length + allIssues.length;
  const reason = leadText(status, rows, session.human[invoice.id]?.note);
  const name = vendorDisplay(invoice.vendorId, invoice.vendorName);
  const authorized = card?.status === "authorized" && (!project || project.vendorIds.includes(invoice.vendorId));
  const projectBudget = project?.rules.monthlyBudgetUsd;
  const projectSpent = session.records.reduce((sum, item) => {
    const source = session.invoices.find((row) => row.id === item.invoiceId);
    if (!project || source?.projectId !== project.id || session.statusOf(item) !== "APPROVED") return sum;
    return sum + item.totalPayableUsd;
  }, 0);
  const companyRoom = session.rules.monthlyBudgetUsd - session.consumed;
  const roomBefore = projectBudget == null ? companyRoom : projectBudget - projectSpent;
  const roomLabel = status === "APPROVED" ? "disponibles antes de este pago." : "disponibles al revisar la factura.";
  const shownRoom = status === "APPROVED" ? roomBefore + record.totalPayableUsd : roomBefore;
  const decisionNote = session.human[invoice.id];
  const movements = [
    { title: "Factura recibida", detail: invoice.receivedAt ? longDate(invoice.receivedAt) : longDate(invoice.issueDate) },
    ...(decisionNote
      ? [{ title: decisionNote.decision === "APPROVED" ? "Pago confirmado" : "Factura rechazada", detail: decisionNote.note }]
      : []),
    ...granted.map((item) => ({
      title: `Excepción · ${item.title}`,
      detail: item.comment || "Una persona autorizó este criterio solo para esta factura. No cuenta como cumplido.",
    })),
    ...touches.map((item) => ({
      title: `Ajuste manual · ${item.title}`,
      detail: item.comment || "Una persona modificó este punto. Queda registrado y no cuenta como cumplimiento automático.",
    })),
    ...notes.map((item) => ({ title: item.title, detail: item.comment })),
  ];

  function openModal(next: ModalState) {
    setFormError("");
    setMissing({});
    setPayError("");
    setAccepted(false);
    setComment("");
    setModal(next);
  }

  function clearMissing(name: string) {
    setMissing((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function finishWork() {
    session.releaseDecision(invoice!.id);
    setModal(null);
    setFormError("");
  }

  function act(decision: "APPROVED" | "BLOCKED", note: string) {
    if (session.statusOf(record!) !== "ESCALATED") {
      setPayError("La factura ya no está por revisar.");
      return;
    }
    session.decide(invoice!.id, decision, note);
  }

  function recordTouch(keys: string[], title: string) {
    if (!invoice) return;
    const text = comment.trim();
    for (const key of keys) {
      session.waiveCriterion(invoice.id, { key: `touch:${key}`, title, comment: text });
    }
    if (text) session.waiveCriterion(invoice.id, { key: `log:${title}:${text}`, title, comment: text });
  }

  function onIssue(action: IssueAction["id"], issue: ReviewIssue) {
    if (action === "approve") {
      openModal({ kind: "exception", issue });
      return;
    }
    openModal({ kind: action });
  }

  function submitModal(form: FormData) {
    if (!invoice || !modal) return;
    const currentCard = session.vendorCards.find((item) => item.id === invoice.vendorId);
    const gaps: Record<string, string> = {};
    const needsAcceptance = !(modal.kind === "add-vendor" && !project);
    if (needsAcceptance && !accepted) gaps.accepted = "Marca la confirmación para continuar.";
    if (modal.kind === "confirm-project" && !session.projects.some((item) => item.id === String(form.get("projectId") ?? "") && item.status === "active")) {
      gaps.projectId = "Elige un proyecto.";
    }
    if (modal.kind === "add-vendor" && project && !String(form.get("service") ?? "").trim()) {
      gaps.service = "Escribe el servicio acordado.";
    }
    if (modal.kind === "add-bank" || modal.kind === "review-bank") {
      if (!String(form.get("bank") ?? "").trim()) gaps.bank = "Escribe el banco.";
      if (!String(form.get("holder") ?? "").trim()) gaps.holder = "Escribe el titular.";
      if (!String(form.get("country") ?? "").trim()) gaps.country = "Escribe el país.";
      if (!String(form.get("identifier") ?? "").trim()) gaps.identifier = "Escribe el identificador de la cuenta.";
      if (!isPayableCurrency(String(form.get("currency") ?? "").trim().toUpperCase())) gaps.currency = "Elige una moneda admitida, por ejemplo USD o USDT.";
    }
    if (modal.kind === "fix-concept" && !String(form.get("concept") ?? "").trim()) gaps.concept = "Escribe el concepto.";
    if (modal.kind === "edit-invoice") {
      if (!String(form.get("concept") ?? "").trim()) gaps.concept = "Escribe el concepto.";
      if (!String(form.get("reference") ?? "").trim()) gaps.reference = "Escribe la referencia.";
      if (!isPayableCurrency(String(form.get("currency") ?? "").trim().toUpperCase())) gaps.currency = "Elige una moneda admitida, por ejemplo USD o USDT.";
      const total = Number(form.get("total"));
      if (!Number.isFinite(total) || total <= 0) gaps.total = "Indica un total mayor que cero.";
    }
    if (modal.kind === "edit-rate") {
      const rate = Number(form.get("rate"));
      if (!Number.isFinite(rate) || rate <= 0) gaps.rate = "Indica una cantidad mayor que cero.";
    }
    if (Object.keys(gaps).length > 0) {
      setMissing(gaps);
      setFormError("Revisa los campos marcados.");
      return;
    }
    setMissing({});
    setFormError("");
    if (modal.kind === "exception") {
      session.waiveCriterion(invoice.id, {
        key: modal.issue.key,
        title: modal.issue.title,
        comment: comment.trim(),
      });
      setModal(null);
      return;
    }
    if (modal.kind === "confirm-project") {
      const projectId = String(form.get("projectId") ?? "");
      const chosen = session.projects.find((item) => item.id === projectId && item.status === "active");
      if (!chosen) return;
      session.updateInvoice(invoice.id, { projectId: chosen.id });
      recordTouch(["project"], "Proyecto confirmado");
      setModal(null);
      return;
    }
    if (modal.kind === "add-vendor") {
      if (!project) {
        openModal({ kind: "confirm-project" });
        return;
      }
      const service = String(form.get("service") ?? "").trim();
      if (!service || !currentCard) return;
      session.saveVendorCard({ ...currentCard, status: "authorized", service });
      session.addVendorToProject(project.id, invoice.vendorId);
      recordTouch(["whitelist", "projectVendor"], "Proveedor añadido a la lista");
      finishWork();
      return;
    }
    if (modal.kind === "add-bank" || modal.kind === "review-bank") {
      const bank = String(form.get("bank") ?? "").trim();
      const holder = String(form.get("holder") ?? "").trim();
      const identifier = String(form.get("identifier") ?? "").trim();
      const currency = String(form.get("currency") ?? "").trim().toUpperCase();
      const country = String(form.get("country") ?? "").trim();
      const accountType = String(form.get("accountType") ?? "").trim();
      if (!currentCard || !bank || !holder || !identifier || !country || !isPayableCurrency(currency)) return;
      session.saveVendorCard({
        ...currentCard,
        bankAccounts: [
          ...currentCard.bankAccounts,
          { id: `bank-${crypto.randomUUID()}`, bank, holder, country, currency, identifier, type: accountType || undefined },
        ],
      });
      if (modal.kind === "review-bank" && invoice.jevSnapshot?.socialEngineeringRisk.score === "HIGH") {
        session.updateInvoice(invoice.id, {
          jevSnapshot: { ...invoice.jevSnapshot, socialEngineeringRisk: { score: "LOW", probability: 0.9 } },
        });
      }
      recordTouch(["bank"], "Cuenta de pago registrada");
      finishWork();
      return;
    }
    if (modal.kind === "fix-concept") {
      const concept = String(form.get("concept") ?? "").trim();
      if (!concept) return;
      session.updateInvoice(invoice.id, {
        description: concept,
        lineItems: [concept, ...invoice.lineItems.slice(1)],
        jevSnapshot: invoice.jevSnapshot
          ? {
              ...invoice.jevSnapshot,
              contractCoherence: { answer: true, probability: Math.max(invoice.jevSnapshot.contractCoherence.probability, 0.95) },
            }
          : invoice.jevSnapshot,
      });
      recordTouch(["contract"], "Concepto corregido");
      setModal(null);
      return;
    }
    if (modal.kind === "edit-invoice") {
      const concept = String(form.get("concept") ?? "").trim();
      const reference = String(form.get("reference") ?? "").trim();
      const currency = String(form.get("currency") ?? "").trim().toUpperCase();
      const total = Number(form.get("total"));
      if (!concept || !reference || !isPayableCurrency(currency) || !Number.isFinite(total) || total <= 0) return;
      const tax = currency === invoice.currency ? invoice.taxAmount : 0;
      session.updateInvoice(invoice.id, {
        description: concept,
        invoiceNumber: reference,
        currency,
        totalPayable: total,
        taxAmount: tax,
        subtotal: Number((total - tax).toFixed(2)),
        lineItems: [concept, ...invoice.lineItems.slice(1)],
      });
      recordTouch(["contract", "lineCheck"], "Datos de la factura");
      setModal(null);
      return;
    }
    if (modal.kind === "edit-rate") {
      const rate = Number(form.get("rate"));
      if (!Number.isFinite(rate) || rate <= 0) return;
      session.saveFxOverride({
        id: `fx-${invoice.id}-${invoice.currency}`,
        scope: "invoice",
        date: record?.fxSnapshot?.date ?? invoice.issueDate,
        currency: invoice.currency,
        rateToUsd: rate,
        invoiceId: invoice.id,
      });
      recordTouch(["fx"], "Tasa de hoy");
      finishWork();
    }
  }

  const documentKind = invoice.documentKind === "chat" ? "Chat · 1 mensaje" : invoice.documentKind === "thermal" ? "Ticket · 1 página" : "PDF · 1 página";

  return (
    <div className="id-page">
      <div className="id-heading">
        <Link href="/" className="back">
          <ArrowLeft className="icon" /> Volver a Facturas
        </Link>
        <div className="id-title-row">
          <div>
            <h1>{name}</h1>
            <p className="id-code">{invoice.id}</p>
          </div>
          <button className="btn id-print" type="button" onClick={() => window.print()}>
            <Printer className="icon" /> Imprimir detalle
          </button>
        </div>
      </div>

      <div className="id-grid">
        <div>
          <section className="id-sheet">
            <div className="id-sheet-head">
              <span>Factura recibida</span>
              <span>{documentKind}</span>
            </div>
            <article className="paper">
              <div className="paper-brand">{name}</div>
              <div className="paper-title">
                <div>
                  <strong>Factura</strong>
                  <div className="paper-ref">{invoice.invoiceNumber}</div>
                </div>
                <div className="paper-dates">
                  <span>{longDate(invoice.issueDate)}</span>
                  <span>Vence: {dueDate(invoice.issueDate)}</span>
                </div>
              </div>
              <div className="paper-label">CLIENTE</div>
              <p>NovaLatam Holdings LLC</p>
              <div className="paper-line paper-concept">
                <span>{conceptOf(invoice)}</span>
              </div>
              <div className="paper-line">
                <span>Subtotal</span>
                <span>{money(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div className="paper-line">
                <span>Impuestos</span>
                <span>{money(invoice.taxAmount, invoice.currency)}</span>
              </div>
              <div className="paper-total">
                <span>Total</span>
                <span>{money(invoice.totalPayable, invoice.currency)}</span>
              </div>
              <p className="paper-stamp">Ejemplo · sin validez fiscal</p>
            </article>
            <div className="id-total">
              <span>Total de la factura</span>
              <strong>
                {money(invoice.totalPayable, "").trim()} <b>{invoice.currency}</b>
              </strong>
            </div>
            <p className="id-fx">
              {invoice.currency === "USD"
                ? "La factura está en USD. No necesita conversión."
                : record.hardRulesResult.fxValid
                  ? `Equivalente ${usd(record.totalPayableUsd)} con la tasa del día.`
                  : "Sin tasa del día para convertir a USD."}
            </p>
          </section>

          <section className="id-card">
            <div className="id-card-head">
              <h2>Proyecto y proveedor</h2>
              <span>Datos de esta decisión</span>
            </div>
            <dl className="id-facts">
              <div>
                <dt>Proyecto</dt>
                <dd>
                  <strong>{project?.name ?? (pending ? "Sin proyecto asignado" : "Por confirmar")}</strong>
                  <small>
                    {project
                      ? invoice.projectAssignment?.evidence ?? `Asignado al proyecto ${project.code}.`
                      : pending
                        ? "No hay una referencia que permita identificarlo."
                        : "Sin una referencia de proyecto concluyente."}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Presupuesto</dt>
                <dd className="id-inline">
                  {!project ? (
                    <strong>Pendiente de confirmar el proyecto.</strong>
                  ) : (
                    <>
                      <strong>{usd(Math.max(0, shownRoom))} USD</strong> <span>{roomLabel}</span>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Lista utilizada</dt>
                <dd>{project ? `Lista ${project.code}` : "Pendiente de asignación"}</dd>
              </div>
              <div>
                <dt>Proveedor</dt>
                <dd>
                  {name}
                  <small>{authorized ? "Autorizado para este proyecto." : "Pendiente de autorización."}</small>
                </dd>
              </div>
              <div>
                <dt>Moneda del cobro</dt>
                <dd>{invoice.currency}</dd>
              </div>
            </dl>
            <div className="id-actions">
              <Link className="btn" href={project ? `/proyectos/${project.id}` : "/proyectos"}>
                Ver proyecto <ChevronRight className="icon" />
              </Link>
              <Link className="btn" href="/reglas">
                Ver criterios <ChevronRight className="icon" />
              </Link>
              <Link className="btn" href={`/proveedores/${invoice.vendorId}`}>
                Ver proveedor <ChevronRight className="icon" />
              </Link>
            </div>
          </section>

          <details className="id-fold">
            <summary>Historial de la factura · {movements.length} {movements.length === 1 ? "movimiento" : "movimientos"}</summary>
            <div className="id-fold-body">
              <ul className="id-history">
                {movements.map((item) => (
                  <li key={`${item.title}-${item.detail}`}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>

        <div>
          <section className="id-decision">
            <span className={statusClass(status)}>{statusLabel(status)}</span>
            {pending ? (
              <>
                <h2 id="decision-heading">Resuelve lo pendiente</h2>
                <p className="id-lead">Revisa estos puntos antes de continuar con el pago.</p>
                <p className="id-score">
                  {passedRows.length} de {totalCriteria} se cumplen según las reglas
                  {adjustedRows.length > 0
                    ? ` · ${adjustedRows.length === 1 ? "1 ajuste manual" : `${adjustedRows.length} ajustes manuales`}`
                    : ""}
                  {exceptionRows.length > 0
                    ? ` · ${exceptionRows.length === 1 ? "1 excepción" : `${exceptionRows.length} excepciones`}`
                    : ""}
                </p>
                <div className="id-issues">
                  {issues.length === 0 ? <p className="muted">No quedan puntos pendientes. Puedes confirmar el pago.</p> : null}
                  {issues.map((issue) => (
                    <article key={issue.key} className="id-issue">
                      <h3>{issue.title}</h3>
                      <p>{issue.detail}</p>
                      {issue.actions.length > 0 ? (
                        <div className="id-issue-actions">
                          {issue.actions.map((action) => (
                            <button key={action.id} className="btn" type="button" onClick={() => onIssue(action.id, issue)}>
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
                {adjustedRows.length > 0 ? (
                  <div className="id-adjustments">
                    <h3>Ajuste manual</h3>
                    <p>Una persona modificó estos criterios. Quedan registrados y no cuentan como cumplimiento automático.</p>
                    <CheckList rows={adjustedRows} />
                  </div>
                ) : null}
                {exceptionRows.length > 0 ? (
                  <div className="id-exceptions">
                    <h3>Excepción autorizada</h3>
                    <p>Estos criterios no se cumplieron. Una persona los autorizó solo para esta factura. No cuentan como cumplidos.</p>
                    <CheckList rows={exceptionRows} />
                  </div>
                ) : null}
                {passedRows.length > 0 ? (
                  <details className="id-fold id-passed">
                    <summary>
                      {passedRows.length === 1 ? "1 criterio cumplido · Ver detalles" : `${passedRows.length} criterios cumplidos · Ver detalles`}
                    </summary>
                    <div className="id-fold-body">
                      <CheckList rows={passedRows} />
                    </div>
                  </details>
                ) : null}
                <div className="id-decide">
                  <h3>Tu decisión queda registrada</h3>
                  <p>Resuelve los puntos pendientes para habilitar el pago. Puedes rechazar la factura si no corresponde.</p>
                  {payError ? (
                    <p className="field-error" role="alert">
                      {payError}
                    </p>
                  ) : null}
                  <div className="button-row">
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => {
                        if (issues.length > 0) {
                          setPayError("Resuelve los puntos pendientes para habilitar el pago.");
                          return;
                        }
                        setPayError("");
                        act("APPROVED", "Confirmado desde el detalle.");
                      }}
                    >
                      Confirmar y pagar
                    </button>
                    <button className="btn" type="button" onClick={() => act("BLOCKED", "Rechazada desde el detalle.")}>
                      Rechazar
                    </button>
                    <button className="btn" type="button" onClick={() => openModal({ kind: "edit-invoice" })}>
                      Editar datos de la factura
                    </button>
                  </div>
                </div>
              </>
            ) : status === "BLOCKED" ? (
              <RejectedPanel
                invoice={invoice}
                invoices={session.invoices}
                records={session.records}
                statusOf={session.statusOf}
                failedRows={failedRows}
                passedRows={passedRows}
                adjustedRows={adjustedRows}
                reason={reason}
              />
            ) : (
              <>
                <h2 id="decision-heading">
                  {exceptionRows.length > 0
                    ? "Pago confirmado con excepción"
                    : adjustedRows.length > 0
                      ? "Pago habilitado con ajustes manuales"
                      : record.finalStatus === "APPROVED"
                        ? "La factura cumple los requisitos"
                        : "Una persona confirmó el pago"}
                </h2>
                <p className="id-lead">{reason}</p>
                {status === "APPROVED" ? <p className="id-pay">Pago simulado. No salió dinero de una cuenta real.</p> : null}
                {adjustedRows.length > 0 || exceptionRows.length > 0 ? (
                  <>
                    {adjustedRows.length > 0 ? (
                      <div className="id-adjustments">
                        <h3>Ajuste manual</h3>
                        <p>Una persona modificó estos criterios. Quedan registrados y no cuentan como cumplimiento automático.</p>
                        <CheckList rows={adjustedRows} />
                      </div>
                    ) : null}
                    {exceptionRows.length > 0 ? (
                      <div className="id-exceptions">
                        <h3>Excepción autorizada</h3>
                        <p>Estos criterios no se cumplieron. Una persona los autorizó solo para esta factura.</p>
                        <CheckList rows={exceptionRows} />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <h3>Qué se comprobó</h3>
                    <CheckList rows={passedRows} />
                  </>
                )}
                {passedRows.length > 0 && (adjustedRows.length > 0 || exceptionRows.length > 0) ? (
                  <details className="id-fold id-passed">
                    <summary>
                      {passedRows.length === 1 ? "1 criterio cumplido · Ver detalles" : `${passedRows.length} criterios cumplidos · Ver detalles`}
                    </summary>
                    <div className="id-fold-body">
                      <CheckList rows={passedRows} />
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </section>

          <details className="id-fold">
            <summary>Ver el servicio acordado y el cobrado</summary>
            <div className="id-fold-body">
              <p>
                <strong>Servicio acordado. </strong>
                {card?.service || "Todavía no hay un servicio registrado."}
              </p>
              <p>
                <strong>Lo que cobra esta factura. </strong>
                {conceptOf(invoice)}
              </p>
            </div>
          </details>
          <details className="id-fold">
            <summary>Datos técnicos y reglas de esta decisión</summary>
            <div className="id-fold-body">
              <p className="id-tech-note">Registro local para inspección. No es un registro criptográfico ni una garantía de inmutabilidad.</p>
              <pre className="id-tech">
                {JSON.stringify(technicalSnapshot(invoice, project, status, reason, rows, granted, session.human[invoice.id]), null, 2)}
              </pre>
            </div>
          </details>
        </div>
      </div>
      <p className="id-foot">Propuesta de interfaz · Datos ficticios y pago simulado.</p>

      <Dialog open={modal != null} title={modalTitle(modal)} onClose={() => setModal(null)} className="id-modal">
        <form
          noValidate
          key={modal?.kind === "exception" ? `exception-${modal.issue.key}` : modal?.kind}
          onInput={(event) => {
            const name = (event.target as HTMLInputElement).name;
            if (name) clearMissing(name);
          }}
          onSubmit={(event) => {
            event.preventDefault();
            submitModal(new FormData(event.currentTarget));
          }}
        >
          {modal && (modal.kind !== "add-vendor" || project) ? <RequiredNote /> : null}
          {modal?.kind === "exception" ? (
            <>
              <h3>{modal.issue.title}</h3>
              <p>{modal.issue.detail}</p>
              <p className="id-callout">
                Solo se autoriza este criterio para {invoice.id}. No cambia los límites ni los acuerdos de otras facturas. Los demás requisitos siguen vigentes.
              </p>
            </>
          ) : null}
          {modal?.kind === "confirm-project" ? (
            <>
              <p>Elige el proyecto al que corresponde esta factura. Después se revisa de nuevo.</p>
              <label className={`field${missing.projectId ? " invalid" : ""}`}>
                <span>
                  Proyecto
                  <RequiredMark />
                </span>
                <SelectMenu
                  required
                  label="Proyecto"
                  name="projectId"
                  defaultValue={project?.id ?? ""}
                  invalid={Boolean(missing.projectId)}
                  options={[
                    { value: "", label: "Selecciona un proyecto" },
                    ...session.projects
                      .filter((item) => item.status === "active")
                      .map((item) => ({ value: item.id, label: `${item.name} · ${item.code}` })),
                  ]}
                />
                {missing.projectId ? <small className="field-error">{missing.projectId}</small> : null}
              </label>
            </>
          ) : null}
          {modal?.kind === "add-vendor" ? (
            project ? (
              <>
                <p>
                  {name} se añadirá a la lista de {project.name} y quedará autorizado.
                </p>
                <label className={`field${missing.service ? " invalid" : ""}`}>
                  <span>
                    Servicio acordado
                    <RequiredMark />
                  </span>
                  <textarea name="service" rows={3} defaultValue={card?.service || conceptOf(invoice)} aria-required="true" aria-invalid={Boolean(missing.service)} />
                  {missing.service ? <small className="field-error">{missing.service}</small> : null}
                </label>
              </>
            ) : (
              <p>El proveedor se añade a la lista de un proyecto. Primero confirma a cuál pertenece la factura.</p>
            )
          ) : null}
          {modal?.kind === "add-bank" || modal?.kind === "review-bank" ? (
            <>
              <p>
                {modal.kind === "review-bank"
                  ? `La factura indica ${askedAccount(invoice)}. La cuenta guardada es ${card?.bankAccounts[0]?.identifier ?? "ninguna"}. Registra la cuenta que debe quedar disponible.`
                  : `Registra una cuenta ficticia para ${name}. No se envía dinero.`}
              </p>
              <div className="form-grid">
                <label className={`field${missing.bank ? " invalid" : ""}`}>
                  <span>
                    Banco
                    <RequiredMark />
                  </span>
                  <input name="bank" defaultValue="Banco de ejemplo" aria-required="true" aria-invalid={Boolean(missing.bank)} />
                  {missing.bank ? <small className="field-error">{missing.bank}</small> : null}
                </label>
                <label className={`field${missing.holder ? " invalid" : ""}`}>
                  <span>
                    Titular
                    <RequiredMark />
                  </span>
                  <input name="holder" defaultValue={card?.legal || invoice.vendorName} aria-required="true" aria-invalid={Boolean(missing.holder)} />
                  {missing.holder ? <small className="field-error">{missing.holder}</small> : null}
                </label>
                <label className="field">
                  <span>Tipo de cuenta</span>
                  <SelectMenu
                    label="Tipo de cuenta"
                    name="accountType"
                    defaultValue="Corriente"
                    options={[
                      { value: "Corriente", label: "Corriente" },
                      { value: "Ahorros", label: "Ahorros" },
                      { value: "Internacional", label: "Internacional" },
                    ]}
                  />
                </label>
                <label className={`field${missing.country ? " invalid" : ""}`}>
                  <span>
                    País
                    <RequiredMark />
                  </span>
                  <SearchMenu
                    required
                    invalid={Boolean(missing.country)}
                    label="País"
                    name="country"
                    placeholder="Buscar país"
                    className="opens-up"
                    defaultValue={card?.country || "Colombia"}
                    options={namedOptions(COUNTRIES, card?.country || "Colombia")}
                    onChange={() => clearMissing("country")}
                  />
                  {missing.country ? <small className="field-error">{missing.country}</small> : null}
                </label>
                <label className={`field${missing.identifier ? " invalid" : ""}`}>
                  <span>
                    Identificador
                    <RequiredMark />
                  </span>
                  <input name="identifier" defaultValue={modal.kind === "review-bank" ? askedAccount(invoice) : ""} placeholder="SYN-1001" aria-required="true" aria-invalid={Boolean(missing.identifier)} />
                  {missing.identifier ? <small className="field-error">{missing.identifier}</small> : null}
                </label>
                <label className={`field${missing.currency ? " invalid" : ""}`}>
                  <span>
                    Moneda
                    <RequiredMark />
                  </span>
                  <SearchMenu
                    required
                    invalid={Boolean(missing.currency)}
                    label="Moneda"
                    name="currency"
                    placeholder="Buscar moneda"
                    className="opens-up"
                    defaultValue={invoice.currency}
                    options={currencyOptions(invoice.currency)}
                    onChange={() => clearMissing("currency")}
                  />
                  {missing.currency ? <small className="field-error">{missing.currency}</small> : null}
                </label>
              </div>
            </>
          ) : null}
          {modal?.kind === "fix-concept" ? (
            <>
              <p>El acuerdo cubre: {(card?.service || "sin servicio registrado").replace(/\.\s*$/, "")}.</p>
              <label className={`field${missing.concept ? " invalid" : ""}`}>
                <span>
                  Concepto de la factura
                  <RequiredMark />
                </span>
                <textarea name="concept" rows={3} defaultValue={conceptOf(invoice)} aria-required="true" aria-invalid={Boolean(missing.concept)} />
                {missing.concept ? <small className="field-error">{missing.concept}</small> : null}
              </label>
            </>
          ) : null}
          {modal?.kind === "edit-invoice" ? (
            <>
              <p>Estos datos se usan en la siguiente revisión. El documento sigue siendo de ejemplo.</p>
              <label className={`field${missing.concept ? " invalid" : ""}`}>
                <span>
                  Concepto
                  <RequiredMark />
                </span>
                <textarea name="concept" rows={3} defaultValue={conceptOf(invoice)} aria-required="true" aria-invalid={Boolean(missing.concept)} />
                {missing.concept ? <small className="field-error">{missing.concept}</small> : null}
              </label>
              <div className="form-grid">
                <label className={`field${missing.reference ? " invalid" : ""}`}>
                  <span>
                    Referencia
                    <RequiredMark />
                  </span>
                  <input name="reference" defaultValue={invoice.invoiceNumber} aria-required="true" aria-invalid={Boolean(missing.reference)} />
                  {missing.reference ? <small className="field-error">{missing.reference}</small> : null}
                </label>
                <label className={`field${missing.currency ? " invalid" : ""}`}>
                  <span>
                    Moneda
                    <RequiredMark />
                  </span>
                  <SearchMenu
                    required
                    invalid={Boolean(missing.currency)}
                    label="Moneda"
                    name="currency"
                    placeholder="Buscar moneda"
                    defaultValue={invoice.currency}
                    options={currencyOptions(invoice.currency)}
                    onChange={() => clearMissing("currency")}
                  />
                  {missing.currency ? <small className="field-error">{missing.currency}</small> : null}
                </label>
                <label className={`field${missing.total ? " invalid" : ""}`}>
                  <span>
                    Total
                    <RequiredMark />
                  </span>
                  <input name="total" type="number" step="0.01" defaultValue={invoice.totalPayable} aria-required="true" aria-invalid={Boolean(missing.total)} />
                  {missing.total ? <small className="field-error">{missing.total}</small> : null}
                </label>
              </div>
            </>
          ) : null}
          {modal?.kind === "edit-rate" ? (
            <>
              <p>1 USD equivale a esta cantidad de {invoice.currency}. Es una referencia de ejemplo.</p>
              <label className={`field${missing.rate ? " invalid" : ""}`}>
                <span>
                  Unidades por 1 USD
                  <RequiredMark />
                </span>
                <input name="rate" type="number" step="any" defaultValue={record.fxSnapshot?.rateToUsd ?? ""} aria-required="true" aria-invalid={Boolean(missing.rate)} />
                {missing.rate ? <small className="field-error">{missing.rate}</small> : null}
              </label>
            </>
          ) : null}
          {modal && (modal.kind !== "add-vendor" || project) ? (
            <Acceptance
              label={acceptanceCopy(modal).label}
              hints={modal.kind === "exception" ? exceptionHints(modal.issue) : acceptanceCopy(modal).hints}
              accepted={accepted}
              comment={comment}
              invalid={missing.accepted}
              onAccepted={(value) => {
                setAccepted(value);
                if (value) clearMissing("accepted");
              }}
              onComment={setComment}
            />
          ) : null}
          {formError ? (
            <p className="field-error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="button-row">
            <button className="btn" type="button" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={Boolean(modal && (modal.kind !== "add-vendor" || project) && !accepted)}>
              {modal?.kind === "add-vendor" && !project ? "Elegir proyecto" : modal ? acceptanceCopy(modal).action : "Guardar"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function acceptanceCopy(modal: ModalState): { label: string; hints: string[]; action: string } {
  if (modal.kind === "exception") {
    return {
      label: "Confirmo que puedo autorizar esta excepción.",
      hints: ["Importe excepcional confirmado con el responsable.", "Servicio adicional aprobado para esta factura."],
      action: "Autorizar solo este criterio",
    };
  }
  if (modal.kind === "confirm-project") {
    return {
      label: "Confirmo que esta factura corresponde a este proyecto.",
      hints: ["La referencia del documento coincide con el proyecto.", "El responsable confirmó la asignación."],
      action: "Confirmar proyecto",
    };
  }
  if (modal.kind === "add-vendor") {
    return {
      label: "Confirmo que este proveedor queda autorizado para el proyecto.",
      hints: ["Proveedor confirmado para este proyecto.", "El servicio acordado cubre este cobro."],
      action: "Añadir a la lista",
    };
  }
  if (modal.kind === "add-bank" || modal.kind === "review-bank") {
    return {
      label: "Confirmo que estos datos de pago corresponden al proveedor.",
      hints: ["Cuenta confirmada con el proveedor.", "Estos datos aplican a los próximos pagos."],
      action: "Guardar cuenta",
    };
  }
  if (modal.kind === "fix-concept") {
    return {
      label: "Confirmo que el concepto corresponde al acuerdo.",
      hints: ["El cobro corresponde al servicio acordado.", "Corregí el concepto con el proveedor."],
      action: "Guardar concepto",
    };
  }
  return {
    label: "Confirmo estos datos para esta factura.",
    hints: ["Datos revisados con el responsable.", "El cambio aplica solo a esta factura."],
    action: "Guardar",
  };
}

function sameCharge(left: Invoice, right: Invoice): boolean {
  return (
    left.id !== right.id &&
    ((left.invoiceNumber === right.invoiceNumber && left.vendorId === right.vendorId) || left.documentHash === right.documentHash)
  );
}

function numericDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function dueNumeric(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + 19);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function periodName(invoice: Invoice): string {
  const source = invoice.periodKey || invoice.issueDate;
  const [year, month] = source.slice(0, 7).split("-");
  const label = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(new Date(`${year}-${month}-02T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function rejectHeading(row: ShownRow | undefined): string {
  const titles: Record<string, string> = {
    duplicate: "Factura duplicada",
    budget: "Presupuesto insuficiente",
    anomalyHigh: "Cuenta de pago no verificada",
    limit: "Importe por encima del límite",
    whitelist: "Proveedor no autorizado",
    contract: "Concepto fuera del acuerdo",
    fx: "Sin tasa de conversión",
    lineCheck: "El total no cuadra",
    project: "Proyecto sin confirmar",
    projectVendor: "Proveedor fuera del proyecto",
    extraction: "Datos incompletos",
    semanticDuplicate: "Trabajo ya cobrado",
  };
  return (row && titles[row.id]) || row?.label || "No se puede pagar";
}

function RejectedPanel({
  invoice,
  invoices,
  records,
  statusOf,
  failedRows,
  passedRows,
  adjustedRows,
  reason,
}: {
  invoice: Invoice;
  invoices: Invoice[];
  records: AuditRecord[];
  statusOf: (record: AuditRecord) => DecisionStatus;
  failedRows: ShownRow[];
  passedRows: ShownRow[];
  adjustedRows: ShownRow[];
  reason: string;
}) {
  const prior = invoices.find((item) => sameCharge(invoice, item));
  const priorRecord = prior ? records.find((item) => item.invoiceId === prior.id) : undefined;
  const priorState = priorRecord ? statusOf(priorRecord) : undefined;
  const primary = failedRows[0];
  const lead =
    primary?.id === "duplicate" && prior
      ? `El número de factura y las fechas coinciden con ${prior.id}, que ya figura ${priorState === "APPROVED" ? "pagada" : priorState === "BLOCKED" ? "rechazada" : "en revisión"}.`
      : reason;
  const hidden = passedRows.length;
  const total = hidden + failedRows.length;
  return (
    <>
      <h2 id="decision-heading">{rejectHeading(primary)}</h2>
      <p className="id-lead">{lead}</p>
      {failedRows.map((row) => (
        <article key={row.id} className="id-reject">
          <div className="id-reject-head">
            <h3>{row.label}</h3>
            <span>No cumple</span>
          </div>
          <p>
            {row.id === "duplicate" && prior
              ? `Esta factura y la registrada en ${prior.id} tienen el mismo número del proveedor y las mismas fechas.`
              : row.detail}
          </p>
          {row.id === "duplicate" && prior ? (
            <>
              <dl className="id-match">
                <div>
                  <dt>Proveedor</dt>
                  <dd>{vendorDisplay(invoice.vendorId, invoice.vendorName)}</dd>
                </div>
                <div>
                  <dt>Número de factura del proveedor</dt>
                  <dd>{invoice.invoiceNumber}</dd>
                </div>
                <div>
                  <dt>Fecha de emisión</dt>
                  <dd>{numericDate(invoice.issueDate)}</dd>
                </div>
                <div>
                  <dt>Fecha de vencimiento</dt>
                  <dd>{dueNumeric(invoice.issueDate)}</dd>
                </div>
                <div>
                  <dt>Periodo cobrado</dt>
                  <dd>{periodName(invoice)}</dd>
                </div>
                <div>
                  <dt>Estado de {prior.id}</dt>
                  <dd>{priorState ? statusLabel(priorState) : "En revisión"}</dd>
                </div>
              </dl>
              <p className="id-reject-note">
                {prior.id} e {invoice.id} son identificadores internos distintos. El documento del proveedor es el mismo y ya figura {priorState === "APPROVED" ? "pagado" : "registrado"}.
              </p>
              <Link className="btn" href={`/facturas/${prior.id}`}>
                Ver factura {prior.id} <ChevronRight className="icon" />
              </Link>
            </>
          ) : null}
          {row.note ? <p className="id-reject-note">{row.note}</p> : null}
        </article>
      ))}
      {primary?.id === "duplicate" ? (
        <p className="id-footnote">
          Un pago recurrente puede repetir proveedor e importe. Si tiene otro número de factura o fechas distintas, esta coincidencia no basta para rechazarlo: hay que revisar el documento y el periodo cobrado.
        </p>
      ) : null}
      {adjustedRows.length > 0 ? (
        <div className="id-adjustments">
          <h3>Ajuste manual</h3>
          <p>Una persona modificó estos criterios. Quedan registrados y no cuentan como cumplimiento automático.</p>
          <CheckList rows={adjustedRows} />
        </div>
      ) : null}
      {hidden > 0 ? (
        <details className="id-fold id-passed">
          <summary>
            {hidden} de {total} criterios cumplidos · Ver detalles
          </summary>
          <div className="id-fold-body">
            <CheckList rows={passedRows} />
          </div>
        </details>
      ) : null}
    </>
  );
}

function CheckList({ rows }: { rows: ShownRow[] }) {
  return (
    <ul className="id-checks">
      {rows.map((row) => (
        <li key={row.id} className={row.tone === "exception" ? "is-exception" : undefined}>
          <span className={`id-mark${row.tone === "fail" ? " fail" : row.tone === "exception" ? " exception" : row.tone === "adjusted" ? " adjust" : ""}`}>
            {row.tone === "fail" ? <X className="icon" /> : row.tone === "pass" ? <Check className="icon" /> : <span aria-hidden="true">!</span>}
          </span>
          <div>
            <strong>
              {row.label}
              {row.tone === "exception" ? <em className="id-exception-tag">Excepción</em> : null}
              {row.tone === "adjusted" ? <em className="id-adjust-tag">Ajuste manual</em> : null}
            </strong>
            <small>{row.detail}</small>
            {row.note ? <small className="id-exception-note">{row.note}</small> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function exceptionHints(issue: ReviewIssue): string[] {
  if (issue.key === "service") return ["El cobro corresponde al servicio de este periodo.", "Servicio adicional aprobado para esta factura."];
  if (issue.key.startsWith("limit") || issue.key === "budget") {
    return ["Importe excepcional confirmado con el responsable.", "Servicio adicional aprobado para esta factura."];
  }
  return ["Revisé este punto con el responsable.", "La excepción aplica solo a esta factura."];
}

function Acceptance({
  label,
  hints,
  accepted,
  comment,
  invalid,
  onAccepted,
  onComment,
}: {
  label: string;
  hints: string[];
  accepted: boolean;
  comment: string;
  invalid?: string;
  onAccepted: (value: boolean) => void;
  onComment: (value: string) => void;
}) {
  return (
    <>
      <label className={`id-confirm-line${invalid ? " invalid" : ""}`}>
        <input type="checkbox" checked={accepted} aria-required="true" aria-invalid={Boolean(invalid)} onChange={(event) => onAccepted(event.target.checked)} />
        <span>
          {label}
          <RequiredMark />
        </span>
      </label>
      {invalid ? <p className="field-error">{invalid}</p> : null}
      <label className="field">
        <span>Comentario adicional</span>
        <textarea rows={3} value={comment} placeholder="Añade contexto si lo necesitas" onChange={(event) => onComment(event.target.value)} />
      </label>
      <p className="id-hint">Añadir contexto ayuda a entender esta decisión cuando se revise más adelante.</p>
      <div className="suggestions">
        {hints.map((hint) => (
          <button key={hint} className="suggestion" type="button" onClick={() => onComment(hint)}>
            {hint}
          </button>
        ))}
      </div>
    </>
  );
}

function modalTitle(modal: ModalState | null): string {
  if (!modal) return "";
  if (modal.kind === "exception") return "Autorizar una excepción";
  if (modal.kind === "confirm-project") return "Confirmar proyecto";
  if (modal.kind === "add-vendor") return "Añadir proveedor a la lista";
  if (modal.kind === "add-bank" || modal.kind === "review-bank") return "Datos de pago del proveedor";
  if (modal.kind === "fix-concept") return "Corregir concepto";
  if (modal.kind === "edit-invoice") return "Editar datos de la factura";
  return "Editar tasa de hoy";
}

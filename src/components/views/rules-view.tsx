"use client";

import { useSession } from "@/components/session/session-provider";
import { Button, RequiredMark, RequiredNote } from "@/components/ui/ui";
import { SearchMenu, SelectMenu } from "@/components/ui/select-menu";
import {
  BUSINESS_CRITERION_ORDER,
  CRITERION_LABEL,
  SYSTEM_CRITERION_ORDER,
  criterionOf,
} from "@/lib/engine/criteria";
import { currencyChoices } from "@/lib/engine/currency";
import { effectiveRules } from "@/lib/mock-data/projects";
import type { CompanyRules, CriterionAction, CriterionId, Project, ProjectRules } from "@/types/blinka";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

const GLOBAL = "global";

type Scope = "global" | "project";

type Operator = "present" | "equals" | "contains" | "min" | "max";

type GroupCriterion = {
  key: string;
  builtinId: CriterionId | null;
  name: string;
  field: string;
  customName: string;
  operator: Operator;
  value: string;
  currency: string;
  action: CriterionAction;
  enabled: boolean;
};

type RuleGroup = {
  id: string;
  name: string;
  scope: Scope;
  projectId: string | null;
  criteria: GroupCriterion[];
};

type DialogState = { kind: "criterion"; groupId: string; key?: string } | null;

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void;
};

const FIELDS: Record<string, string> = {
  reference: "Referencia de factura",
  due: "Fecha de vencimiento",
  concept: "Concepto",
  original: "Importe original",
  currency: "Moneda",
  country: "País",
  category: "Categoría",
  custom: "Otro dato obligatorio",
};

const OPERATORS: Record<Operator, string> = {
  present: "Debe estar presente",
  equals: "Debe ser igual a",
  contains: "Debe contener",
  min: "Mayor o igual a",
  max: "Menor o igual a",
};

function seedCriterion(id: CriterionId): GroupCriterion {
  return {
    key: id,
    builtinId: id,
    name: CRITERION_LABEL[id],
    field: `builtin:${id}`,
    customName: "",
    operator: "present",
    value: "",
    currency: "",
    action: "ESCALATED",
    enabled: true,
  };
}

function projectCriteria(project: Project): GroupCriterion[] {
  return BUSINESS_CRITERION_ORDER.filter((id) => project.rules.criteria?.[id]).map(seedCriterion);
}

function seedGroups(projects: Project[]): RuleGroup[] {
  return [
    {
      id: "company",
      name: "Criterios generales",
      scope: "global",
      projectId: null,
      criteria: BUSINESS_CRITERION_ORDER.map(seedCriterion),
    },
    ...projects.map((project) => ({
      id: `rules-${project.id}`,
      name: "Criterios del proyecto",
      scope: "project" as const,
      projectId: project.id,
      criteria: projectCriteria(project),
    })),
  ];
}

function criterionDetail(item: GroupCriterion) {
  if (item.builtinId) return HINT[item.builtinId];
  const field = item.field === "custom" ? item.customName : FIELDS[item.field];
  const expected = item.operator === "present" ? "" : ` ${item.value}`;
  const money = item.currency ? ` · Solo ${item.currency}` : "";
  return `${field} · ${OPERATORS[item.operator]}${expected}${money}`;
}

const HINT: Record<CriterionId, string> = {
  duplicate: "Misma referencia y proveedor, o mismo documento",
  semanticDuplicate: "Mismo servicio o entregable y periodo que otra factura",
  budget: "El pago cabe en el saldo disponible del periodo",
  anomalyHigh: "La cuenta coincide y no hay señales críticas de manipulación",
  whitelist: "El proveedor está en la lista permitida",
  project: "La factura tiene un proyecto asignado",
  projectVendor: "El proveedor está permitido en ese proyecto",
  fx: "El sistema dispone de una tasa para la fecha de pago",
  limit: "El total no supera el límite de aprobación automática",
  lineCheck: "Subtotal, impuestos y total cuadran",
  contract: "El servicio y el concepto coinciden con lo contratado",
};

const POLICY_GROUPS: Array<{ ids: CriterionId[]; title: string; detail: string }> = [
  { ids: ["duplicate", "semanticDuplicate"], title: "Cobro no duplicado", detail: "Rechaza coincidencias exactas y revisa posibles repeticiones semánticas." },
  { ids: ["whitelist"], title: "Proveedor autorizado", detail: "Un proveedor nuevo requiere validación antes del pago." },
  { ids: ["anomalyHigh"], title: "Cuenta de cobro autorizada", detail: "Una cuenta distinta o una señal crítica impide el pago automático." },
  { ids: ["projectVendor", "contract"], title: "Factura acorde con lo contratado", detail: "Comprueba proveedor, servicio y concepto dentro del proyecto." },
  { ids: ["limit"], title: "Límite por factura", detail: "Los importes superiores necesitan aprobación humana." },
  { ids: ["budget"], title: "Presupuesto disponible", detail: "Sin saldo suficiente, el pago queda pendiente de revisión." },
  { ids: ["project"], title: "Proyecto identificado", detail: "Aplica cuando la empresa exige asignar cada factura a un proyecto." },
];

function policyHeading(id: CriterionId, criteria: GroupCriterion[]) {
  const policy = POLICY_GROUPS.find((item) => item.ids.includes(id));
  if (!policy) return undefined;
  const firstVisible = criteria.find((criterion) => criterion.builtinId && policy.ids.includes(criterion.builtinId));
  return firstVisible?.builtinId === id ? policy : undefined;
}

function periodLabel() {
  return new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(new Date());
}

export function RulesView() {
  const session = useSession();
  const [scopeId, setScopeId] = useState(GLOBAL);
  const [groups, setGroups] = useState<RuleGroup[]>(() => seedGroups(session.projects));
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const project = scopeId === GLOBAL ? null : (session.projects.find((item) => item.id === scopeId) ?? null);
  const applied = project ? effectiveRules(session.rules, project.rules) : session.rules;
  const visible = groups.filter((group) => (project ? group.scope === "project" && group.projectId === project.id : group.scope === "global"));
  const visibleKeys = visible.flatMap((group) => group.criteria.map((item) => `${group.id}|${item.key}`));

  useEffect(() => {
    setGroups(seedGroups(session.projects));
    setPicked(new Set());
    setScopeId(GLOBAL);
    setDialog(null);
    setConfirm(null);
  }, [session.resetCount]);

  useEffect(() => {
    setGroups((current) => {
      const missing = session.projects.filter((item) => !current.some((group) => group.projectId === item.id));
      if (missing.length === 0) return current;
      return [
        ...current,
        ...missing.map((item) => ({
          id: `rules-${item.id}`,
          name: "Criterios del proyecto",
          scope: "project" as const,
          projectId: item.id,
          criteria: projectCriteria(item),
        })),
      ];
    });
  }, [session.projects]);

  useEffect(() => {
    if (scopeId !== GLOBAL && !session.projects.some((item) => item.id === scopeId)) setScopeId(GLOBAL);
  }, [scopeId, session.projects]);

  function writeCriteria(
    patches: Array<{ id: CriterionId; action?: CriterionAction; enabled?: boolean }>,
    targetProjectId?: string | null,
  ) {
    if (patches.length === 0) return;
    const projectId = targetProjectId === undefined ? (project?.id ?? null) : targetProjectId;
    const host = projectId ? session.projects.find((item) => item.id === projectId) : null;
    if (!host) {
      const byId = new Map(patches.map((patch) => [patch.id, patch]));
      session.updateRules({
        ...session.rules,
        criteria: session.rules.criteria.map((item) => {
          const patch = byId.get(item.id);
          return patch ? { ...item, action: patch.action ?? item.action, enabled: patch.enabled ?? item.enabled } : item;
        }),
      });
      return;
    }
    const base = effectiveRules(session.rules, host.rules);
    const criteria: NonNullable<ProjectRules["criteria"]> = { ...host.rules.criteria };
    for (const patch of patches) {
      const current = criterionOf(base, patch.id);
      const previous = host.rules.criteria?.[patch.id];
      criteria[patch.id] = {
        action: patch.action ?? previous?.action ?? current.action,
        enabled: patch.enabled ?? previous?.enabled ?? current.enabled,
      };
    }
    session.patchProjectRules(host.id, { criteria });
  }

  function resetProjectCriteria(ids: CriterionId[]) {
    if (!project || ids.length === 0) return;
    const criteria = { ...project.rules.criteria };
    for (const id of ids) delete criteria[id];
    session.patchProjectRules(project.id, { criteria });
  }

  function removeFromGroups(keys: string[]) {
    const drop = new Set(keys);
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        criteria: group.criteria.filter((item) => !drop.has(`${group.id}|${item.key}`)),
      })),
    );
    setPicked((current) => {
      const next = new Set(current);
      for (const key of keys) next.delete(key);
      return next;
    });
  }

  function openAdd(groupId?: string) {
    const target = visible.find((group) => group.id === groupId) ?? visible[0];
    if (!target) return;
    setNotice(null);
    setDialog({ kind: "criterion", groupId: target.id });
  }

  function itemOf(key: string) {
    const [groupId, itemKey] = key.split("|");
    const group = groups.find((item) => item.id === groupId);
    return group?.criteria.find((item) => item.key === itemKey) ?? null;
  }

  function liveState(item: GroupCriterion) {
    if (!item.builtinId) return { action: item.action, enabled: item.enabled };
    const current = criterionOf(applied, item.builtinId);
    return { action: current.action, enabled: current.enabled };
  }

  function patchItem(groupId: string, key: string, patch: Partial<GroupCriterion>) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, criteria: group.criteria.map((item) => (item.key === key ? { ...item, ...patch } : item)) }
          : group,
      ),
    );
  }

  function saveCriterion(draft: GroupCriterion, groupId: string, previousKey?: string) {
    const dest = groups.find((group) => group.id === groupId);
    if (!dest) return;
    const previous = previousKey
      ? groups.flatMap((group) => group.criteria.map((item) => ({ group, item }))).find((entry) => entry.item.key === previousKey)
      : undefined;
    const patches: Array<{ id: CriterionId; action?: CriterionAction; enabled?: boolean }> = [];
    const sameScope = previous && previous.group.scope === dest.scope && previous.group.projectId === dest.projectId;
    if (sameScope && previous.item.builtinId && previous.item.builtinId !== draft.builtinId) {
      patches.push({ id: previous.item.builtinId, enabled: false });
    }
    if (draft.builtinId) patches.push({ id: draft.builtinId, action: draft.action, enabled: draft.enabled });
    setGroups((current) =>
      current.map((group) => {
        const inDestScope = group.scope === dest.scope && group.projectId === dest.projectId;
        let criteria = group.criteria.filter((item) => item.key !== draft.key && item.key !== previousKey);
        if (inDestScope && draft.builtinId) criteria = criteria.filter((item) => item.builtinId !== draft.builtinId);
        if (group.id === dest.id) criteria = [...criteria, draft];
        return { ...group, criteria };
      }),
    );
    writeCriteria(patches, dest.projectId);
    setScopeId(dest.projectId ?? GLOBAL);
    setDialog(null);
    setNotice(null);
  }

  function deleteCriteria(keys: string[]) {
    if (keys.length === 0) return;
    const items = keys.map(itemOf).filter((item): item is GroupCriterion => Boolean(item));
    const names = items.map((item) => item.name).join(", ");
    const builtins = items.map((item) => item.builtinId).filter((id): id is CriterionId => Boolean(id));
    const onlyProjectOverrides = Boolean(project) && builtins.length === items.length;
    setConfirm({
      title: onlyProjectOverrides
        ? keys.length === 1
          ? "Restablecer criterio general"
          : "Restablecer criterios generales"
        : keys.length === 1
          ? "Eliminar criterio"
          : "Eliminar criterios",
      message:
        onlyProjectOverrides
          ? keys.length === 1
            ? `Se eliminará la excepción de «${names}» y el proyecto volverá a usar el criterio general.`
            : `Se eliminarán ${keys.length} excepciones y el proyecto volverá a usar los criterios generales.`
          : keys.length === 1
          ? `Se eliminará «${names}». Las decisiones anteriores se conservarán.`
          : `Se eliminarán ${keys.length} criterios: ${names}. Las decisiones anteriores se conservarán.`,
      onConfirm: () => {
        if (project) resetProjectCriteria(builtins);
        else writeCriteria(builtins.map((id) => ({ id, enabled: false })));
        removeFromGroups(keys);
        setConfirm(null);
      },
    });
  }

  const checks = (() => {
    const rows = session.rules.criteria
      .map((item) => criterionOf(applied, item.id))
      .filter((item) => item.enabled)
      .map((item) => ({
        name: CRITERION_LABEL[item.id],
        source: SYSTEM_CRITERION_ORDER.includes(item.id)
          ? "Sistema · Automático"
          : project?.rules.criteria?.[item.id]
            ? `${project.name} · Excepción`
            : project
              ? "Empresa · Heredado"
              : "Empresa",
      }));
    rows.push(
      ...visible.flatMap((group) =>
        group.criteria
          .filter((item) => !item.builtinId && item.enabled)
          .map((item) => ({
            name: item.currency ? `${item.name} · Solo ${item.currency}` : item.name,
            source: project?.name ?? "Empresa",
          })),
      ),
      { name: "Lectura válida del documento", source: "Sistema · Automático" },
    );
    return rows;
  })();

  return (
    <div className="cr-page">
      <header className="page-heading">
        <div>
          <h1>Criterios de aceptación</h1>
          <p>Define qué debe cumplir cada factura y qué ocurre si no cumple.</p>
        </div>
        <div className="heading-actions">
          <Button type="button" variant="primary" onClick={() => openAdd()}>
            <Plus className="icon" aria-hidden="true" /> Añadir criterio
          </Button>
        </div>
      </header>

      <section className="panel cr-context">
        <label className="field">
          <span>Gestionar criterios de</span>
          <SelectMenu
            label="Gestionar criterios de"
            value={project ? project.id : GLOBAL}
            options={[
              { value: GLOBAL, label: "Toda la empresa" },
              ...session.projects.map((item) => ({
                value: item.id,
                label: item.status === "archived" ? `${item.name} · Archivado` : item.name,
              })),
            ]}
            onChange={setScopeId}
          />
        </label>
        <div className="cr-context-copy">
          <strong>{project ? "Criterios del proyecto" : "Criterios generales"}</strong>
          <p>
            {project
              ? `Hereda ${BUSINESS_CRITERION_ORDER.length} políticas generales. Aquí solo gestionas sus excepciones y criterios adicionales.`
              : "Se aplican a todas las facturas, en todos los proyectos."}
          </p>
        </div>
        {project ? (
          <Link className="cr-global-link" href="/proyectos">
            Ver proyectos →
          </Link>
        ) : null}
      </section>

      {notice ? <p className="cr-banner">{notice}</p> : null}

      <div className="cr-layout">
        <div className="cr-main">
          <SettingsCard
            key={project?.id ?? GLOBAL}
            applied={applied}
            project={project}
            period={periodLabel()}
            onSave={(next) => {
              if (project) {
                session.patchProjectRules(project.id, next);
                return;
              }
              session.updateRules({ ...session.rules, ...next });
            }}
          />

          <section className="panel cr-editor">
            <div className="cr-section-head">
              <div>
                <h2>{project ? "Excepciones y criterios adicionales" : "Grupos de criterios"}</h2>
                <p className="cr-note">
                  {project
                    ? "Solo aparecen los criterios que cambian para este proyecto. Los demás mantienen la configuración general."
                    : "Consulta y configura los requisitos que se aplican en toda la empresa."}
                </p>
              </div>
            </div>
            {project ? (
              <div className="cr-inheritance">
                <div>
                  <strong>{BUSINESS_CRITERION_ORDER.length} políticas generales heredadas</strong>
                  <span>Se aplican automáticamente mientras no exista una excepción para este proyecto.</span>
                </div>
                <button type="button" className="cr-global-link" onClick={() => setScopeId(GLOBAL)}>
                  Ver criterios generales →
                </button>
              </div>
            ) : null}
            {visibleKeys.length > 0 ? <div className="cr-bulk">
              <SelectAll
                total={visibleKeys.length}
                picked={visibleKeys.filter((key) => picked.has(key)).length}
                onChange={(checked) => setPicked(checked ? new Set(visibleKeys) : new Set())}
              />
              <button
                type="button"
                className="btn cr-delete"
                disabled={picked.size === 0}
                onClick={() => deleteCriteria([...picked].filter((key) => visibleKeys.includes(key)))}
              >
                Quitar seleccionados{picked.size ? ` (${picked.size})` : ""}
              </button>
            </div> : null}

            {visible.length === 0 ? (
              <div className="cr-empty">
                <h3>{project ? "Este proyecto no tiene excepciones" : "No hay criterios disponibles en este contexto"}</h3>
                {project ? <p>Usa los criterios generales de la empresa sin modificaciones.</p> : null}
              </div>
            ) : (
              visible.map((group) => {
                const states = group.criteria.map((item) => liveState(item));
                const activeCount = states.filter((item) => item.enabled).length;
                const groupOn = group.criteria.length > 0 && activeCount === group.criteria.length;
                const mixed = activeCount > 0 && activeCount < group.criteria.length;
                return (
                  <section key={group.id} className={groupOn || mixed ? "cr-group" : "cr-group cr-group-off"}>
                    <div className="cr-group-head">
                      <div className="cr-title">
                        <span>
                          <strong>{group.name}</strong>
                          <small>
                            {group.scope === "global" ? "Toda la empresa" : project?.name} · {group.criteria.length}{" "}
                            {group.scope === "global" ? "criterios" : "excepciones o adicionales"}
                          </small>
                        </span>
                      </div>
                      <div className="cr-group-tools">
                        <label className="cr-toggle">
                          <IndeterminateCheckbox
                            checked={groupOn}
                            indeterminate={mixed}
                            label="Grupo activo"
                            onChange={(enabled) => {
                              writeCriteria(group.criteria.flatMap((item) => (item.builtinId ? [{ id: item.builtinId, enabled }] : [])));
                              setGroups((current) =>
                                current.map((item) =>
                                  item.id === group.id
                                    ? { ...item, criteria: item.criteria.map((criterion) => ({ ...criterion, enabled })) }
                                    : item,
                                ),
                              );
                            }}
                          />
                          Grupo activo
                        </label>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => openAdd(group.id)}
                        >
                          <Plus className="icon" aria-hidden="true" /> Añadir criterio
                        </Button>
                      </div>
                    </div>
                    <div>
                        {group.criteria.length === 0 ? (
                          <div className="cr-empty">
                            <h3>{project ? "Este proyecto no tiene excepciones" : "Este grupo aún no tiene criterios"}</h3>
                            {project ? <p>Usa los criterios generales de la empresa sin modificaciones.</p> : null}
                          </div>
                        ) : null}
                        {group.criteria.map((criterion) => {
                          const state = liveState(criterion);
                          const key = `${group.id}|${criterion.key}`;
                          const heading = criterion.builtinId ? policyHeading(criterion.builtinId, group.criteria) : undefined;
                          return (
                            <Fragment key={key}>
                              {heading ? (
                                <div className="cr-policy-heading">
                                  <strong>{heading.title}</strong>
                                  <span>{heading.detail}</span>
                                </div>
                              ) : null}
                              <article className={state.enabled ? "cr-row" : "cr-row cr-disabled"}>
                              <label className="cr-pick">
                                <input
                                  type="checkbox"
                                  aria-label={`Seleccionar ${criterion.name}`}
                                  checked={picked.has(key)}
                                  onChange={(event) =>
                                    setPicked((current) => {
                                      const next = new Set(current);
                                      if (event.target.checked) next.add(key);
                                      else next.delete(key);
                                      return next;
                                    })
                                  }
                                />
                              </label>
                              <div className="cr-row-copy">
                                <strong>{criterion.name}</strong>
                                <small>{criterionDetail(criterion)}</small>
                              </div>
                              <div className="cr-controls">
                                <OutcomeSwitch
                                  name={criterion.name}
                                  action={state.action}
                                  onChange={(action) => {
                                    if (criterion.builtinId) writeCriteria([{ id: criterion.builtinId, action }]);
                                    else patchItem(group.id, criterion.key, { action });
                                  }}
                                />
                                <label className="cr-toggle">
                                  <input
                                    type="checkbox"
                                    checked={state.enabled}
                                    onChange={(event) => {
                                      if (criterion.builtinId) writeCriteria([{ id: criterion.builtinId, enabled: event.target.checked }]);
                                      else patchItem(group.id, criterion.key, { enabled: event.target.checked });
                                    }}
                                  />
                                  Activo
                                </label>
                                <div className="cr-row-actions">
                                  <button
                                    type="button"
                                    className="btn cr-icon"
                                    aria-label={`Editar ${criterion.name}`}
                                    onClick={() => setDialog({ kind: "criterion", groupId: group.id, key: criterion.key })}
                                  >
                                    <Pencil className="icon" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn cr-delete"
                                    aria-label={project && criterion.builtinId ? `Restablecer ${criterion.name}` : `Eliminar ${criterion.name}`}
                                    onClick={() => deleteCriteria([key])}
                                  >
                                    {project && criterion.builtinId ? (
                                      <RotateCcw className="icon" aria-hidden="true" />
                                    ) : (
                                      <Trash2 className="icon" aria-hidden="true" />
                                    )}
                                    <span>{project && criterion.builtinId ? "Restablecer" : "Eliminar"}</span>
                                  </button>
                                </div>
                              </div>
                              </article>
                            </Fragment>
                          );
                        })}
                    </div>
                  </section>
                );
              })
            )}
            <SystemChecks />
          </section>
        </div>

        <aside className="cr-side">
          <section className="panel">
            <h2>Para pasar a Pagado</h2>
            <p>La factura debe cumplir todos los criterios que le correspondan.</p>
            <div className="cr-list-count">{checks.length} requisitos activos</div>
            <div className="cr-checks-scroll" tabIndex={0} role="region" aria-label="Lista completa de criterios activos">
              <ul className="cr-checks">
                {checks.map((item) => (
                  <li key={`${item.source}-${item.name}`}>
                    <span aria-hidden="true">✓</span>
                    <div>
                      {item.name}
                      <small>{item.source}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <p className="cr-note">
              {project
                ? "La lista combina los criterios generales con las excepciones de este proyecto."
                : "Al identificar un proyecto también se añaden su presupuesto, monedas y condiciones específicas."}
            </p>
          </section>
        </aside>
      </div>

      {dialog?.kind === "criterion" ? (
        <CriterionDialog
          groups={groups}
          projects={session.projects}
          companyRules={session.rules}
          groupId={dialog.groupId}
          criterion={groups.find((group) => group.id === dialog.groupId)?.criteria.find((item) => item.key === dialog.key)}
          action={
            dialog.key
              ? liveState(
                  groups.find((group) => group.id === dialog.groupId)?.criteria.find((item) => item.key === dialog.key) ??
                    seedCriterion("duplicate"),
                ).action
              : "ESCALATED"
          }
          onCancel={() => setDialog(null)}
          onSave={(draft, nextGroupId) => saveCriterion(draft, nextGroupId, dialog.key)}
        />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      ) : null}
    </div>
  );
}

function SystemChecks() {
  return (
    <section className="cr-system" aria-labelledby="system-checks-title">
      <div className="cr-system-head">
        <div>
          <h3 id="system-checks-title">Comprobaciones automáticas del sistema</h3>
          <p>No son políticas empresariales y no se pueden eliminar. Protegen la integridad de cada evaluación.</p>
        </div>
        <span>Siempre activas</span>
      </div>
      <ul>
        <li>
          <strong>Lectura válida del documento</strong>
          <span>Comprueba que existan los datos mínimos para evaluar la factura.</span>
        </li>
        <li>
          <strong>Importes y total coherentes</strong>
          <span>Rechaza la factura cuando subtotal, impuestos y total no cuadran.</span>
        </li>
        <li>
          <strong>Tasa de conversión disponible</strong>
          <span>Deja el pago pendiente si no puede calcularse su equivalente en USD.</span>
        </li>
        <li>
          <strong>Integridad de la evaluación</strong>
          <span>Conserva evidencia, reglas aplicadas y resultado para auditoría.</span>
        </li>
      </ul>
    </section>
  );
}

function OutcomeSwitch({
  name,
  action,
  onChange,
}: {
  name: string;
  action: CriterionAction;
  onChange: (action: CriterionAction) => void;
}) {
  const blocked = action === "BLOCKED";
  return (
    <div className="cr-outcome">
      <span>Si no cumple</span>
      <label className="cr-switch">
        <input
          type="checkbox"
          role="switch"
          aria-checked={blocked}
          aria-label={`Si no cumple ${name}. Ahora: ${blocked ? "Rechazado" : "Por revisar"}`}
          checked={blocked}
          onChange={(event) => onChange(event.target.checked ? "BLOCKED" : "ESCALATED")}
        />
        <i aria-hidden="true" />
        <b>{blocked ? "Rechazado" : "Por revisar"}</b>
      </label>
    </div>
  );
}

function SettingsCard({
  applied,
  project,
  period,
  onSave,
}: {
  applied: CompanyRules;
  project: Project | null;
  period: string;
  onSave: (next: Pick<CompanyRules, "maxAutoApproveUsd" | "monthlyBudgetUsd" | "jevConfidenceThreshold">) => void;
}) {
  const [limit, setLimit] = useState(String(applied.maxAutoApproveUsd));
  const [budget, setBudget] = useState(String(applied.monthlyBudgetUsd));
  const [confidence, setConfidence] = useState(Math.round(applied.jevConfidenceThreshold * 100));
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const nextLimit = Number(limit);
    const nextBudget = Number(budget);
    if (!Number.isFinite(nextLimit) || !Number.isFinite(nextBudget) || nextLimit <= 0 || nextBudget <= 0) {
      setError("Introduce importes mayores que cero.");
      return;
    }
    if (confidence < 50 || confidence > 99) {
      setError("La confianza mínima va de 50% a 99%.");
      return;
    }
    setError("");
    onSave({
      maxAutoApproveUsd: nextLimit,
      monthlyBudgetUsd: nextBudget,
      jevConfidenceThreshold: confidence / 100,
    });
  }

  return (
    <section className="panel cr-settings">
      <h2>{project ? "Importes del proyecto" : "Importes y confianza"}</h2>
      <form onSubmit={submit}>
        <div className="cr-form-grid">
          <label className="field">
            <span>Límite por factura · USD</span>
            <input name="limit" type="number" min={1} step={1} required value={limit} onChange={(event) => setLimit(event.target.value)} />
          </label>
          <label className="field">
            <span>
              Presupuesto · {period} · USD
            </span>
            <input name="budget" type="number" min={1} step={1} required value={budget} onChange={(event) => setBudget(event.target.value)} />
          </label>
        </div>
        <label className="field cr-confidence">
          <span>
            Confianza mínima <output>{confidence}%</output>
          </span>
          <input
            name="confidence"
            type="range"
            min={50}
            max={99}
            value={confidence}
            onChange={(event) => setConfidence(Number(event.target.value))}
          />
          <small>Si la revisión queda por debajo de este porcentaje, la factura no cumple ese criterio.</small>
        </label>
        <p className="field-error" role="alert">
          {error}
        </p>
        <Button type="submit">Guardar</Button>
      </form>
    </section>
  );
}

function SelectAll({ total, picked, onChange }: { total: number; picked: number; onChange: (checked: boolean) => void }) {
  return (
    <label>
      <IndeterminateCheckbox
        checked={total > 0 && picked === total}
        indeterminate={picked > 0 && picked < total}
        label="Seleccionar todos"
        onChange={onChange}
      />
      Seleccionar todos
    </label>
  );
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function CriterionDialog({
  groups,
  projects,
  companyRules,
  groupId,
  criterion,
  action,
  onCancel,
  onSave,
}: {
  groups: RuleGroup[];
  projects: Project[];
  companyRules: CompanyRules;
  groupId: string;
  criterion?: GroupCriterion;
  action: CriterionAction;
  onCancel: () => void;
  onSave: (draft: GroupCriterion, groupId: string) => void;
}) {
  const titleId = useId();
  const [field, setField] = useState(criterion?.field ?? "reference");
  const [operator, setOperator] = useState<Operator>(criterion?.operator ?? "present");
  const [currency, setCurrency] = useState(criterion?.currency ?? "");
  const [name, setName] = useState(criterion?.name ?? "");
  const [customName, setCustomName] = useState(criterion?.customName ?? "");
  const [expected, setExpected] = useState(criterion?.value ?? "");
  const [consequence, setConsequence] = useState(action);
  const [error, setError] = useState("");
  const currencies = useMemo(
    () => [
      { value: "", label: "Todas" },
      ...currencyChoices().map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` })),
    ],
    [],
  );
  const destinations = [
    {
      label: "Toda la empresa",
      options: groups.filter((group) => group.scope === "global").map((group) => ({ value: group.id, label: group.name })),
    },
    ...projects.map((item) => ({
      label: item.name,
      options: groups.filter((group) => group.projectId === item.id).map((group) => ({ value: group.id, label: group.name })),
    })),
  ].filter((group) => group.options.length);
  const known = [
    {
      label: "Toda la empresa",
      options: groups
        .filter((group) => group.scope === "global")
        .flatMap((group) => group.criteria.map((item) => ({ value: `copy:${group.id}|${item.key}`, label: item.name }))),
    },
    ...projects.map((item) => ({
      label: item.name,
      options: groups
        .filter((group) => group.projectId === item.id)
        .flatMap((group) => group.criteria.map((entry) => ({ value: `copy:${group.id}|${entry.key}`, label: entry.name }))),
    })),
    {
      label: "Políticas disponibles",
      options: BUSINESS_CRITERION_ORDER.map((id) => ({ value: `builtin:${id}`, label: CRITERION_LABEL[id] })),
    },
  ].filter((group) => group.options.length);
  const builtin = field.startsWith("builtin:");
  const builtinId = builtin ? (field.slice("builtin:".length) as CriterionId) : null;

  function chooseField(value: string) {
    if (!value.startsWith("copy:")) {
      setField(value);
      return;
    }
    const [sourceGroupId, sourceKey] = value.slice("copy:".length).split("|");
    const sourceGroup = groups.find((group) => group.id === sourceGroupId);
    const source = sourceGroup?.criteria.find((item) => item.key === sourceKey);
    if (!source || !sourceGroup) return;
    const host = sourceGroup.scope === "global" ? undefined : projects.find((item) => item.id === sourceGroup.projectId)?.rules;
    setName(source.name);
    setCustomName(source.customName);
    setOperator(source.operator);
    setExpected(source.value);
    setCurrency(source.currency);
    setField(source.field);
    setConsequence(source.builtinId ? criterionOf(effectiveRules(companyRules, host), source.builtinId).action : source.action);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const trimmed = name.trim();
    const custom = customName.trim();
    const value = expected.trim();
    const nextGroupId = String(form.get("group") ?? groupId);
    if (!trimmed) {
      setError("Escribe el nombre del criterio.");
      return;
    }
    if (field === "custom" && !custom) {
      setError("Escribe el nombre del dato adicional.");
      return;
    }
    if (!builtin && operator !== "present" && !value) {
      setError("Escribe el valor esperado.");
      return;
    }
    onSave(
      {
        key: criterion?.key ?? builtinId ?? `c-${Date.now()}`,
        builtinId,
        name: trimmed,
        field,
        customName: custom,
        operator: builtin ? "present" : operator,
        value: builtin || operator === "present" ? "" : value,
        currency,
        action: consequence,
        enabled: criterion?.enabled ?? true,
      },
      nextGroupId,
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card cr-dialog" role="dialog" aria-labelledby={titleId} onSubmit={submit}>
        <h2 id={titleId}>{criterion ? "Editar criterio" : "Añadir criterio"}</h2>
        <RequiredNote />
        <label className="field">
          <span>
            Grupo
            <RequiredMark />
          </span>
          <SelectMenu
            required
            label="Grupo"
            name="group"
            defaultValue={groupId}
            options={[]}
            groups={destinations}
          />
        </label>
        <label className={`field${!name.trim() && error ? " invalid" : ""}`}>
          <span>
            Nombre del criterio
            <RequiredMark />
          </span>
          <input
            name="name"
            required
            aria-required="true"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej.: Orden de compra obligatoria"
            autoFocus
          />
        </label>
        <label className="field">
          <span>
            Dato que se comprueba
            <RequiredMark />
          </span>
          <SelectMenu
            required
            label="Dato que se comprueba"
            name="field"
            value={field}
            onChange={chooseField}
            options={Object.entries(FIELDS).map(([value, label]) => ({ value, label }))}
            groups={known}
          />
        </label>
        {field === "custom" ? (
          <label className={`field${error && !customName.trim() ? " invalid" : ""}`}>
            <span>
              Nombre del dato adicional
              <RequiredMark />
            </span>
            <input
              name="custom"
              required
              aria-required="true"
              maxLength={80}
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="Ej.: Orden de compra"
            />
          </label>
        ) : null}
        {builtin ? null : (
          <div className="cr-form-grid">
            <label className="field">
              <span>
                Condición
                <RequiredMark />
              </span>
              <SelectMenu
                required
                label="Condición"
                name="operator"
                value={operator}
                onChange={(value) => setOperator(value as Operator)}
                options={Object.entries(OPERATORS).map(([value, label]) => ({ value, label }))}
              />
            </label>
            {operator === "present" ? null : (
              <label className={`field${error && !expected.trim() ? " invalid" : ""}`}>
                <span>
                  Valor esperado
                  <RequiredMark />
                </span>
                <input name="value" required aria-required="true" value={expected} onChange={(event) => setExpected(event.target.value)} />
              </label>
            )}
          </div>
        )}
        <div className="cr-form-grid">
          <label className="field">
            <span>
              Si no cumple
              <RequiredMark />
            </span>
            <SelectMenu
              required
              className="opens-up"
              label="Si no cumple"
              name="action"
              value={consequence}
              onChange={(value) => setConsequence(value as CriterionAction)}
              options={[
                { value: "ESCALATED", label: "Por revisar" },
                { value: "BLOCKED", label: "Rechazado" },
              ]}
            />
          </label>
          <label className="field">
            <span>Aplicar en moneda</span>
            <SearchMenu
              className="opens-up"
              label="Aplicar en moneda"
              name="currency"
              placeholder="Todas"
              value={currency}
              options={currencies}
              onChange={setCurrency}
            />
            <small>Si eliges Todas, el criterio aplica a cualquier moneda.</small>
          </label>
        </div>
        <p className="field-error" role="alert">
          {error}
        </p>
        <div className="button-row">
          <Button type="button" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit">
            Guardar criterio
          </Button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card cr-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        <p>{message}</p>
        <div className="button-row">
          <Button type="button" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" type="button" onClick={onConfirm}>
            Eliminar
          </Button>
        </div>
      </div>
    </div>
  );
}

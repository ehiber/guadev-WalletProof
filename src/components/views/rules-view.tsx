"use client";

import { useSession } from "@/components/session/session-provider";
import { Button, RequiredMark, RequiredNote } from "@/components/ui/ui";
import { SearchMenu, SelectMenu } from "@/components/ui/select-menu";
import { CRITERION_LABEL, CRITERION_ORDER, criterionOf } from "@/lib/engine/criteria";
import { currencyChoices } from "@/lib/engine/currency";
import { effectiveRules } from "@/lib/mock-data/projects";
import type { CompanyRules, CriterionAction, CriterionId, Project, ProjectRules } from "@/types/blinka";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

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

type DialogState =
  | { kind: "group"; groupId?: string }
  | { kind: "criterion"; groupId: string; key?: string }
  | null;

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

function seedGroups(projects: Project[]): RuleGroup[] {
  return [
    {
      id: "company",
      name: "Criterios generales",
      scope: "global",
      projectId: null,
      criteria: CRITERION_ORDER.map(seedCriterion),
    },
    ...projects.map((project) => ({
      id: `rules-${project.id}`,
      name: "Criterios del proyecto",
      scope: "project" as const,
      projectId: project.id,
      criteria: CRITERION_ORDER.map(seedCriterion),
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
  duplicate: "Referencia y proveedor únicos",
  budget: "El pago cabe en el presupuesto del periodo",
  anomalyHigh: "La cuenta de cobro coincide y el pedido no parece manipulado",
  whitelist: "El proveedor está activo en la lista",
  project: "La factura tiene un proyecto asignado",
  projectVendor: "El proveedor pertenece a ese proyecto",
  fx: "Hay tasa para la moneda en el día de pago",
  limit: "El total no supera el límite por factura",
  lineCheck: "Las líneas coinciden con el total",
  contract: "El concepto corresponde al servicio contratado",
  semanticDuplicate: "No repite el mismo entregable de otra factura",
};

function periodLabel() {
  return new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(new Date());
}

export function RulesView() {
  const session = useSession();
  const [scopeId, setScopeId] = useState(GLOBAL);
  const [groups, setGroups] = useState<RuleGroup[]>(() => seedGroups(session.projects));
  const [openId, setOpenId] = useState<string | null>("company");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const project = scopeId === GLOBAL ? null : (session.projects.find((item) => item.id === scopeId) ?? null);
  const applied = project ? effectiveRules(session.rules, project.rules) : session.rules;
  const visible = groups.filter((group) => (project ? group.scope === "project" && group.projectId === project.id : group.scope === "global"));
  const visibleKeys = visible.flatMap((group) => group.criteria.map((item) => `${group.id}|${item.key}`));

  useEffect(() => {
    const projectId = scopeId === GLOBAL ? null : scopeId;
    const inScope = groups.filter((group) =>
      projectId ? group.scope === "project" && group.projectId === projectId : group.scope === "global",
    );
    setOpenId((current) => {
      if (current && inScope.some((group) => group.id === current)) return current;
      if (current === null) return null;
      return inScope[0]?.id ?? null;
    });
  }, [groups, scopeId]);

  useEffect(() => {
    setGroups(seedGroups(session.projects));
    setOpenId("company");
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
          criteria: CRITERION_ORDER.map(seedCriterion),
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
    const criteria: NonNullable<ProjectRules["criteria"]> = {};
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
    if (!target) {
      setDialog({ kind: "group" });
      return;
    }
    setNotice(null);
    setDialog({ kind: "criterion", groupId: target.id });
  }

  function saveGroup(name: string, groupId?: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (groupId) {
      setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group)));
    } else {
      const id = `group-${Date.now()}`;
      setGroups((current) => [
        ...current,
        {
          id,
          name: trimmed,
          scope: project ? "project" : "global",
          projectId: project?.id ?? null,
          criteria: [],
        },
      ]);
      setOpenId(id);
    }
    setDialog(null);
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
    setOpenId(dest.id);
    setDialog(null);
    setNotice(null);
  }

  function deleteCriteria(keys: string[]) {
    if (keys.length === 0) return;
    const names = keys.map((key) => itemOf(key)?.name ?? "criterio").join(", ");
    setConfirm({
      title: keys.length === 1 ? "Eliminar criterio" : "Eliminar criterios",
      message:
        keys.length === 1
          ? `Se eliminará «${names}». Las decisiones anteriores se conservarán.`
          : `Se eliminarán ${keys.length} criterios: ${names}. Las decisiones anteriores se conservarán.`,
      onConfirm: () => {
        const builtins = keys.map((key) => itemOf(key)?.builtinId).filter((id): id is CriterionId => Boolean(id));
        writeCriteria(builtins.map((id) => ({ id, enabled: false })));
        removeFromGroups(keys);
        setConfirm(null);
      },
    });
  }

  function deleteGroup(group: RuleGroup) {
    setConfirm({
      title: "Eliminar grupo",
      message: `Se eliminará «${group.name}» y sus ${group.criteria.length} criterios. Las decisiones anteriores se conservarán.`,
      onConfirm: () => {
        writeCriteria(group.criteria.flatMap((item) => (item.builtinId ? [{ id: item.builtinId, enabled: false }] : [])));
        setGroups((current) => current.filter((item) => item.id !== group.id));
        setPicked((current) => {
          const next = new Set(current);
          for (const item of group.criteria) next.delete(`${group.id}|${item.key}`);
          return next;
        });
        setConfirm(null);
      },
    });
  }

  const checks = useMemo(() => {
    const rows = visible.flatMap((group) =>
      group.criteria
        .filter((item) => liveState(item).enabled)
        .map((item) => ({
          name: item.currency ? `${item.name} · Solo ${item.currency}` : item.name,
          source: group.scope === "global" ? "Empresa" : (project?.name ?? "Proyecto"),
        })),
    );
    rows.push(
      { name: "Tasa válida para la evaluación", source: "Comprobación necesaria" },
      { name: "Proveedor no excluido", source: "Comprobación necesaria" },
    );
    if (project) rows.push({ name: "Proyecto identificado y activo", source: project.name });
    return rows;
  }, [applied, project, visible]);

  return (
    <div className="cr-page">
      <header className="page-heading">
        <div>
          <h1>Criterios de aceptación</h1>
          <p>Define qué debe cumplir cada factura y qué ocurre si no cumple.</p>
        </div>
        <Button type="button" variant="primary" onClick={() => openAdd()}>
          ＋ Añadir criterio
        </Button>
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
          <p>{project ? "Los criterios generales de empresa también se aplican." : "Se aplican a todas las facturas, en todos los proyectos."}</p>
        </div>
        {project ? (
          <Link className="btn" href={`/proyectos/${project.id}`}>
            Ver proyecto
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
                <h2>Grupos de criterios</h2>
                <p className="cr-note">Organiza los requisitos que se aplican en este contexto.</p>
              </div>
              <Button type="button" onClick={() => setDialog({ kind: "group" })}>
                ＋ Crear grupo
              </Button>
            </div>
            {project ? (
              <button type="button" className="cr-global-link" onClick={() => setScopeId(GLOBAL)}>
                Ver y editar criterios generales de empresa →
              </button>
            ) : null}
            <div className="cr-bulk">
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
                Eliminar seleccionados{picked.size ? ` (${picked.size})` : ""}
              </button>
            </div>

            {visible.length === 0 ? (
              <div className="cr-empty">
                <h3>Aún no hay grupos en este contexto</h3>
                <p>Crea un grupo para organizar los criterios que se añaden a los generales.</p>
              </div>
            ) : (
              visible.map((group) => {
                const states = group.criteria.map((item) => liveState(item));
                const activeCount = states.filter((item) => item.enabled).length;
                const groupOn = group.criteria.length > 0 && activeCount === group.criteria.length;
                const mixed = activeCount > 0 && activeCount < group.criteria.length;
                const open = openId === group.id;
                const panelId = `grupo-${group.id}`;
                return (
                  <section key={group.id} className={groupOn || mixed ? "cr-group" : "cr-group cr-group-off"}>
                    <div className="cr-group-head">
                      <div className="cr-title">
                        <button
                          type="button"
                          className="cr-fold"
                          aria-expanded={open}
                          aria-controls={panelId}
                          onClick={() => setOpenId(open ? null : group.id)}
                        >
                          <ChevronDown className={open ? "icon" : "icon cr-chevron-closed"} aria-hidden="true" />
                          <span>
                            <strong>{group.name}</strong>
                            <small>
                              {group.scope === "global" ? "Toda la empresa" : project?.name} · {group.criteria.length} criterios
                            </small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn cr-icon"
                          aria-label={`Editar grupo ${group.name}`}
                          onClick={() => setDialog({ kind: "group", groupId: group.id })}
                        >
                          <Pencil className="icon" aria-hidden="true" />
                        </button>
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
                          onClick={() => {
                            setOpenId(group.id);
                            openAdd(group.id);
                          }}
                        >
                          ＋ Añadir criterio
                        </Button>
                        <button type="button" className="btn cr-delete" aria-label={`Eliminar grupo ${group.name}`} onClick={() => deleteGroup(group)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                    {open ? (
                      <div id={panelId}>
                        {group.criteria.length === 0 ? <p className="cr-empty">Este grupo aún no tiene criterios.</p> : null}
                        {group.criteria.map((criterion) => {
                          const state = liveState(criterion);
                          const key = `${group.id}|${criterion.key}`;
                          return (
                            <article key={key} className={state.enabled ? "cr-row" : "cr-row cr-disabled"}>
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
                                  <button type="button" className="btn cr-delete" aria-label={`Eliminar ${criterion.name}`} onClick={() => deleteCriteria([key])}>
                                    <Trash2 className="icon" aria-hidden="true" />
                                    <span>Eliminar</span>
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })
            )}
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
                ? "Estos criterios se suman a los generales de la empresa."
                : "Al identificar un proyecto también se añaden su presupuesto, monedas y condiciones específicas."}
            </p>
          </section>
        </aside>
      </div>

      {dialog?.kind === "group" ? (
        <GroupDialog
          name={groups.find((group) => group.id === dialog.groupId)?.name ?? ""}
          title={dialog.groupId ? "Editar grupo" : "Crear grupo"}
          scopeLabel={project ? project.name : "Toda la empresa"}
          onCancel={() => setDialog(null)}
          onSave={(name) => saveGroup(name, dialog.groupId)}
        />
      ) : null}
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

function GroupDialog({
  name,
  title,
  scopeLabel,
  onCancel,
  onSave,
}: {
  name: string;
  title: string;
  scopeLabel: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const titleId = useId();
  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal-card cr-dialog"
        role="dialog"
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(String(new FormData(event.currentTarget).get("name") ?? ""));
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <RequiredNote />
        <label className="field">
          <span>
            Nombre del grupo
            <RequiredMark />
          </span>
          <input name="name" required maxLength={80} defaultValue={name} placeholder="Ej.: Requisitos de contratación" autoFocus aria-required="true" />
        </label>
        <p className="cr-note">Se aplica a {scopeLabel}. Los grupos de empresa se evalúan en todas las facturas. Los del proyecto se suman a los generales.</p>
        <div className="button-row">
          <Button type="button" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit">
            Guardar grupo
          </Button>
        </div>
      </form>
    </div>
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
      label: "Comprobaciones del sistema",
      options: CRITERION_ORDER.map((id) => ({ value: `builtin:${id}`, label: CRITERION_LABEL[id] })),
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

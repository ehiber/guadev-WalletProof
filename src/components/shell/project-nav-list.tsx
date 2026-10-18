"use client";

import type { Project } from "@/types/blinka";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function ProjectNavList({
  projects,
  activeId,
  overflow,
  onOpen,
  onPlace,
  onUnfavorite,
}: {
  projects: Project[];
  activeId: string;
  overflow: boolean;
  onOpen: (id: string) => void;
  onPlace: (fromId: string, toId: string) => void;
  onUnfavorite: (id: string) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const origin = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null);
  const overRef = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(`nav-project-${id}`)?.focus();
  });

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".ws-menu")) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const move = (id: string, direction: -1 | 1) => {
    const index = projects.findIndex((project) => project.id === id);
    const target = projects[index + direction];
    if (!target) return;
    pendingFocus.current = id;
    onPlace(id, target.id);
    setMenu(null);
  };

  return (
    <>
      <span className="visually-hidden">Arrastra un proyecto para cambiar el orden. Con el teclado, Alt más flecha arriba o abajo.</span>
      {projects.map((project, index) => {
        const dragging = dragId === project.id;
        const drop = overId === project.id && dragId !== null && dragId !== project.id;
        return (
          <div
            className={`ws-project-link${dragging ? " ws-dragging" : ""}${drop ? " ws-drop" : ""}`}
            key={project.id}
            data-project-id={project.id}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              if (event.target instanceof Element && event.target.closest(".ws-menu")) return;
              origin.current = { id: project.id, x: event.clientX, y: event.clientY, active: false };
            }}
            onPointerMove={(event) => {
              const start = origin.current;
              if (!start || start.id !== project.id) return;
              if (!start.active) {
                if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) return;
                start.active = true;
                suppressClick.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragId(project.id);
                overRef.current = project.id;
                setOverId(project.id);
                setMenu(null);
              }
              const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-project-id]");
              const next = hit?.dataset.projectId;
              if (!next || next === overRef.current) return;
              overRef.current = next;
              setOverId(next);
            }}
            onPointerUp={() => {
              const start = origin.current;
              if (!start || start.id !== project.id) return;
              const to = overRef.current;
              const commit = start.active && to != null && to !== start.id;
              origin.current = null;
              if (start.active) {
                setDragId(null);
                setOverId(null);
                overRef.current = null;
                window.setTimeout(() => {
                  suppressClick.current = false;
                }, 50);
              }
              if (commit && to) onPlace(start.id, to);
            }}
            onPointerCancel={() => {
              if (origin.current?.id !== project.id) return;
              origin.current = null;
              setDragId(null);
              setOverId(null);
              overRef.current = null;
              suppressClick.current = false;
            }}
          >
            <Link
              id={`nav-project-${project.id}`}
              draggable={false}
              href={`/proyectos/${project.id}`}
              aria-current={activeId === project.id ? "page" : undefined}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              onClick={(event) => {
                if (suppressClick.current) {
                  event.preventDefault();
                  suppressClick.current = false;
                  return;
                }
                onOpen(project.id);
              }}
              onKeyDown={(event) => {
                if (!event.altKey) return;
                const direction = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
                if (!direction) return;
                event.preventDefault();
                move(project.id, direction);
              }}
            >
              <span className="ws-project-dot" />
              {project.name}
            </Link>
            {overflow ? (
              <div className="ws-menu">
                <button
                  type="button"
                  aria-label={`Opciones de ${project.name}`}
                  aria-expanded={menu === project.id}
                  onClick={() => setMenu((current) => (current === project.id ? null : project.id))}
                >
                  ⋯
                </button>
                {menu === project.id ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        onUnfavorite(project.id);
                        setMenu(null);
                      }}
                    >
                      Quitar de favoritos
                    </button>
                    <button type="button" disabled={index === 0} onClick={() => move(project.id, -1)}>
                      Subir
                    </button>
                    <button type="button" disabled={index === projects.length - 1} onClick={() => move(project.id, 1)}>
                      Bajar
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

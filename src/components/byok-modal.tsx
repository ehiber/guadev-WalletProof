"use client";

import type { ByokKeys } from "@/lib/engine/model-provider";

export function ByokModal({
  open,
  keys,
  onClose,
  onSave,
}: {
  open: boolean;
  keys: ByokKeys;
  onClose: () => void;
  onSave: (keys: ByokKeys) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#121826]/40 p-4">
      <form
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSave({
            gemini: String(data.get("gemini") ?? "").trim() || undefined,
            groq: String(data.get("groq") ?? "").trim() || undefined,
            jev: String(data.get("jev") ?? "").trim() || undefined,
          });
        }}
      >
        <h2 className="text-lg font-semibold text-[#121826]">Bring Your Own Key</h2>
        <p className="mt-1 text-sm text-[#5c6575]">
          Las claves se quedan en este navegador. Si faltan, el pipeline usa el snapshot.
        </p>
        <label className="mt-4 block text-sm">
          GEMINI_API_KEY
          <input className="field" name="gemini" defaultValue={keys.gemini ?? ""} autoComplete="off" />
        </label>
        <label className="mt-3 block text-sm">
          GROQ_API_KEY
          <input className="field" name="groq" defaultValue={keys.groq ?? ""} autoComplete="off" />
        </label>
        <label className="mt-3 block text-sm">
          TYPESAFE_JEV_KEY
          <input className="field" name="jev" defaultValue={keys.jev ?? ""} autoComplete="off" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose} type="button">
            Cerrar
          </button>
          <button className="btn btn-hot" type="submit">
            Guardar en este navegador
          </button>
        </div>
      </form>
    </div>
  );
}

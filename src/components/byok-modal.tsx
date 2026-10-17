"use client";

import { emptyLayer, type ByokKeys, type LayerConfig } from "@/lib/engine/model-provider";
import { useState } from "react";

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
  return <ByokForm keys={keys} onClose={onClose} onSave={onSave} />;
}

function ByokForm({
  keys,
  onClose,
  onSave,
}: {
  keys: ByokKeys;
  onClose: () => void;
  onSave: (keys: ByokKeys) => void;
}) {
  const [read, setRead] = useState<LayerConfig>(keys.read ?? emptyLayer());
  const [explain, setExplain] = useState<LayerConfig>(keys.explain ?? emptyLayer());
  const [jev, setJev] = useState(keys.jev ?? "");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#121826]/40 p-4">
      <form
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            read: { ...read, apiKey: read.apiKey?.trim() || undefined },
            explain: { ...explain, apiKey: explain.apiKey?.trim() || undefined },
            jev: jev.trim() || undefined,
          });
        }}
      >
        <h2 className="text-lg font-semibold text-[#121826]">Claves por capa</h2>
        <p className="mt-1 text-sm text-[#5c6575]">
          La lectura y la redacción usan OpenAI. Puedes repetir la misma clave en las dos capas. Las claves se quedan en
          este navegador. JEV sigue siendo TypeSafe.
        </p>
        <LayerFields title="Lectura" layer={read} onChange={setRead} />
        <LayerFields title="Redacción" layer={explain} onChange={setExplain} />
        <label className="mt-4 block text-sm">
          TYPESAFE_JEV_KEY
          <input className="field" value={jev} autoComplete="off" onChange={(event) => setJev(event.target.value)} />
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

function LayerFields({
  title,
  layer,
  onChange,
}: {
  title: string;
  layer: LayerConfig;
  onChange: (layer: LayerConfig) => void;
}) {
  return (
    <fieldset className="mt-4 space-y-2 rounded-lg border border-[#e6e8ee] p-3">
      <legend className="px-1 text-sm font-medium text-[#121826]">{title}</legend>
      <label className="block text-sm">
        Modelo
        <input
          className="field"
          value={layer.model}
          autoComplete="off"
          onChange={(event) => onChange({ ...layer, model: event.target.value })}
        />
      </label>
      <label className="block text-sm">
        Modelo de reintento
        <input
          className="field"
          value={layer.fallbackModel}
          autoComplete="off"
          onChange={(event) => onChange({ ...layer, fallbackModel: event.target.value })}
        />
      </label>
      <label className="block text-sm">
        API key de OpenAI
        <input
          className="field"
          value={layer.apiKey ?? ""}
          autoComplete="off"
          onChange={(event) => onChange({ ...layer, apiKey: event.target.value })}
        />
      </label>
    </fieldset>
  );
}

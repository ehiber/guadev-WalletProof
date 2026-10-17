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
    <div className="modal-backdrop">
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            read: { ...read, apiKey: read.apiKey?.trim() || undefined },
            explain: { ...explain, apiKey: explain.apiKey?.trim() || undefined },
            jev: jev.trim() || undefined,
          });
        }}
      >
        <h2>Claves por capa</h2>
        <p className="decision-explanation">
          La lectura y la redacción usan OpenAI. Puedes repetir la misma clave en las dos capas. Las claves se quedan en
          este navegador. JEV sigue siendo TypeSafe.
        </p>
        <LayerFields title="Lectura" layer={read} onChange={setRead} />
        <LayerFields title="Redacción" layer={explain} onChange={setExplain} />
        <label className="field">
          <span>TYPESAFE_JEV_KEY</span>
          <input value={jev} autoComplete="off" onChange={(event) => setJev(event.target.value)} />
        </label>
        <div className="button-row">
          <button className="btn" onClick={onClose} type="button">
            Cerrar
          </button>
          <button className="btn primary" type="submit">
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
    <fieldset>
      <legend>{title}</legend>
      <label className="field">
        <span>Modelo</span>
        <input value={layer.model} autoComplete="off" onChange={(event) => onChange({ ...layer, model: event.target.value })} />
      </label>
      <label className="field">
        <span>Modelo de reintento</span>
        <input
          value={layer.fallbackModel}
          autoComplete="off"
          onChange={(event) => onChange({ ...layer, fallbackModel: event.target.value })}
        />
      </label>
      <label className="field">
        <span>API key de OpenAI</span>
        <input value={layer.apiKey ?? ""} autoComplete="off" onChange={(event) => onChange({ ...layer, apiKey: event.target.value })} />
      </label>
    </fieldset>
  );
}

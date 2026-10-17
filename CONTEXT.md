# 🛡️ Blinka Guard: Autonomous AP Agent with Deterministic Rules & System-1 Cognitive Guardrails (JEV)

> **Hackathon 30X — Reto Blinka (+ Integración nativa con JEV de TypeSafe AI & OpenClaw)**
> Agente financiero autónomo que procesa cuentas por pagar (PDFs corporativos, tickets térmicos arrugados, recibos hechos a mano y capturas de chat), valida políticas corporativas con **0% de margen de error matemático**, trazabilidad cambiaria diaria e inmutabilidad criptográfica en cada decisión.

---

## 🎯 1. El Problema y Nuestra Tesis de Arquitectura
Las empresas constituidas en EE. UU. que operan con equipos, proveedores y contratistas en Latinoamérica procesan decenas de facturas mensuales en múltiples monedas y formatos no estructurados. 

**Por qué fallan los agentes tradicionales en finanzas:**
Confiar la aprobación de un pago únicamente al *prompt* de un LLM tradicional es un riesgo crítico: los LLMs alucinan en la aritmética, confunden el `subtotal` con el `total a pagar` (ignorando impuestos) y no garantizan determinismo ante límites presupuestarios. En el Reto Blinka, **aprobar un solo pago fuera de las reglas es motivo de descalificación directa**.

**La Solución — Pipeline Híbrido de 4 Capas:**
Separamos la percepción visual, la validación matemática, el juicio semántico rápido y la explicabilidad en 4 capas especializadas:

1. **Capa 1 — Extracción Multimodal Estricta (Vision LLM + Zod):** Lee PDFs, fotos de tickets arrugados, notas a mano o chats y extrae un JSON tipado separando explícitamente `subtotal`, `taxAmount` y `totalPayable`.
2. **Capa 2 — Motor Determinista + FX Ledger (TypeScript Puro):** Ejecuta validaciones matemáticas exactas sobre `totalPayable`, convierte divisas latinoamericanas a USD usando la tasa oficial auditada del día (`FX_LEDGER`), valida la *Whitelist* de proveedores, verifica duplicados exactos (hash/referencia) y controla el saldo del presupuesto mensual. **Garantiza 0% de pagos indebidos.**
3. **Capa 3 — Guardrail Cognitivo Rápido (JEV de TypeSafe AI - System 1):** En ~110ms y por fracciones de centavo ($0.00004 USD), evalúa en una sola pasada (*Single-Pass*) las trampas contextuales que el código rígido no ve: coherencia semántica entre lo cobrado y el contrato del proveedor (`Noul`), duplicados semánticos (`Noul`), nivel de anomalía/ingeniería social en el mensaje (`Score`) y categorización de centro de costo (`Choice`).
4. **Capa 4 — Explicabilidad Auditable e Inmutable (Groq LLM + SHA-256 Audit Hash):** Redacta la justificación ejecutiva en lenguaje natural para el equipo de finanzas sin necesidad de abrir el código, firma el registro con un hash inmutable de las reglas vigentes, notifica vía **OpenClaw** y permite exportar la conciliación contable en `.CSV`.

---

## 🧠 2. Stack de Modelos y Tecnologías Recomendadas

| Capa del Pipeline | Rol Específico | Modelo / Tecnología | Latencia Objetivo |
| :--- | :--- | :--- | :--- |
| **Capa 1: Ingesta & OCR** | Extracción estructurada desde PDF/Imagen a JSON validado con `Zod`. | `gemini-2.5-flash` o `gpt-4o-mini` (Soporte multimodal nativo de baja latencia). | 800ms – 1.4s |
| **Capa 2: Reglas Duras & FX** | Aritmética sobre `totalPayable`, conversión con tasa histórica del día (`FX_LEDGER`), topes, presupuesto y Whitelist. | **TypeScript Puro (Motor Determinista)**. *Prohibido usar IA para cálculos numéricos o fechas.* | < 5ms |
| **Capa 3: Guardrail Semántico** | Detección de incoherencia contractual, duplicados semánticos y fraude/urgencia en chats. | **JEV (TypeSafe AI - System 1)** vía Vercel AI Gateway / REST API (`Noul`, `Score`, `Choice`). | 70ms – 200ms |
| **Capa 4: Explicabilidad** | Generación del registro de auditoría legible por humanos a partir de las salidas de Capa 2 y 3. | `llama-3.3-70b-versatile` vía **Groq API** (con *fallback* determinista instantáneo). | 180ms – 350ms |

---

## 🔒 3. Compuerta Lógica de Seguridad y Trazabilidad Financiera

### 3.1 Compuerta Determinista de Decisión (`src/lib/engine/pipeline.ts`)
Ningún modelo de IA puede aprobar un pago si falla una sola regla en código. La función de veredicto aplica un `AND` lógico estricto:

1. **Normalización Cambiaria Auditada:**
   - Si `invoice.currency !== 'USD'`, se consulta `FX_LEDGER[invoice.issueDate][invoice.currency]`.
   - `totalPayableUsd = Number((invoice.totalPayable / fxRate.rateToUsd).toFixed(2))`.
2. **Evaluación de Reglas Duras (`2-hard-rules.ts`):**
   - `isExactDuplicate`: ¿Existe el mismo `invoiceNumber` + `vendorId` o el mismo hash de documento? → Si es `true`, estado directo a **`BLOCKED` (Frenado)**.
   - `isVendorWhitelisted`: ¿El proveedor está activo en la lista permitida? → Si es `false`, estado a **`ESCALATED` (Requiere aprobación humana)**.
   - `isWithinSingleLimit`: ¿`totalPayableUsd <= rules.maxAutoApproveUsd`? → Si es `false`, estado a **`ESCALATED`**.
   - `isWithinPeriodBudget`: ¿`currentPeriodSpentUsd + totalPayableUsd <= rules.monthlyBudgetUsd`? → Si es `false`, estado a **`BLOCKED / ESCALATED`** (Presupuesto insuficiente).
3. **Evaluación Cognitiva con JEV (`3-jev-client.ts`):**
   - Solo si todas las reglas duras pasan (`HardRules.passed === true`), se evalúan las probabilidades calibradas de JEV:
   - `coherenceOk`: `jev.contractCoherence.answer === true && jev.contractCoherence.probability >= rules.jevConfidenceThreshold` (ej. `0.85`).
   - `notSemanticDuplicate`: `jev.semanticDuplicate.answer === false && jev.semanticDuplicate.probability >= 0.80`.
   - `lowAnomalyRisk`: `jev.socialEngineeringRisk.score === 'LOW'`.
   - Si las 3 condiciones de JEV se cumplen → **`APPROVED` (Pagado automáticamente)**.
   - Si JEV detecta anomalía `HIGH` (ej. cambio sospechoso de cuenta bancaria por chat) → **`BLOCKED`**.
   - Si JEV tiene baja confianza o incoherencia de contrato → **`ESCALATED`**.

### 3.2 Esquema de Preguntas Tipadas para JEV
En cada ejecución de la Capa 3, se envía a JEV el estado (`Factura Extraída + Resumen del Contrato del Proveedor + Últimas 5 facturas del proveedor`) y se consultan 4 preguntas en una sola pasada:
- **`Q1_CONTRACT_COHERENCE` (`Noul`):** *¿El concepto y los ítems cobrados en esta factura corresponden semánticamente al giro y servicios acordados en el contrato de este proveedor?*
- **`Q2_SEMANTIC_DUPLICATE` (`Noul`):** *¿Esta factura cobra exactamente el mismo entregable y periodo que alguna de las facturas previas registradas para este proveedor, aunque use diferente redacción o formato?*
- **`Q3_ANOMALY_SCORE` (`Score`: `LOW` | `MEDIUM` | `HIGH`):** *¿Qué nivel de riesgo de manipulación, urgencia atípica o cambio no autorizado de datos bancarios presenta el documento o mensaje adjunto?*
- **`Q4_COST_CENTER` (`Choice`: `Cloud & Infra` | `Marketing & Growth` | `Software Development` | `Legal & Admin` | `Facilities & Maintenance` | `Other`):** *¿A qué partida presupuestaria pertenece este gasto?*

### 3.3 Inmutabilidad del Registro (`SHA-256 Audit Hash`)
Cada decisión genera un objeto `AuditRecord` que congela:
- `rulesSnapshot`: Los topes y umbrales exactos que estaban activos en ese segundo.
- `fxSnapshot`: La tasa de cambio exacta, fecha y fuente utilizada para convertir a USD.
- `auditHash`: Hash SHA-256 generado sobre `JSON.stringify({ invoiceId, totalPayableUsd, rulesSnapshot, fxSnapshot, hardRulesResult, jevResult, finalStatus })`. Esto garantiza que cualquier auditor pueda verificar *a posteriori* bajo qué condiciones exactas se tomó la decisión.

---

## 🔓 4. Arquitectura de Demo para Jueces ("Hybrid Live Sandbox")
Para evitar fricción en la evaluación (cero pantallas de login) y demostrar con total transparencia que el agente funciona en vivo y **no está cableado**:

1. **Zero-Login Instant Sandbox:** La app abre directamente en el panel financiero de **"NovaLatam Holdings LLC"** (empresa de EE. UU. con operaciones en Colombia, México, Venezuela y Argentina).
2. **Transparencia Dual (`⚡ Audit Snapshot` vs. `🔥 Live AI Execution`):**
   - Al cargar la página, las 8 facturas del set de prueba se muestran con un badge `⚡ Pre-Computed Snapshot (0ms)` para que el jurado explore la interfaz, los filtros y las explicaciones al instante sin esperar tiempos de carga iniciales.
   - Cada fila (y la cabecera global) tiene el botón **`🔥 Ejecutar Pipeline IA en Vivo`**, el cual limpia el snapshot y ejecuta en tiempo real las llamadas a **Vision OCR → Motor Determinista → JEV API → Groq**, mostrando un *Live Stepper* con los milisegundos reales de cada capa y una pestaña **`{ } Raw Telemetry & Payloads`** con los JSON reales devueltos por los modelos.
   - Cuando el juez mueve cualquier *slider* del **Rule Builder** o cambia el umbral de JEV, el motor determinista recalcula los estados y KPIs en vivo en `< 5ms`.
3. **Configuración Opcional BYOK (`⚙️ API Keys`):**
   - El despliegue en producción incluye las API Keys del equipo en variables de entorno protegidas por un *rate-limiter* ligero para que funcione de inmediato.
   - Adicionalmente, incluye un modal `⚙️ Bring Your Own Key` donde un juez puede pegar su propia `GROQ_API_KEY`, `GEMINI_API_KEY` o `TYPESAFE_JEV_KEY` (almacenadas solo en su navegador) si desea hacer pruebas intensivas.
4. **Controles de Evaluación Rápida:**
   - **`🔄 Restaurar Estado Inicial`:** Devuelve las reglas, presupuestos y facturas a su estado limpio en 1 clic.
   - **`📥 Exportar Conciliación (.CSV)`:** Descarga la hoja de cálculo conciliada lista para contabilidad con montos originales, tasas FX aplicadas, montos en USD, estado, explicación y `Audit Hash`.

---

## 🦞 5. Integración Conversacional con OpenClaw (`/openclaw-skills`)
Dado que las facturas en la vida real llegan por chat o correo y las aprobaciones suelen pedirse por mensajería, integramos **OpenClaw** manteniendo la instancia privada del equipo segura:

1. **Skills Oficiales en el Repositorio (`/openclaw-skills/`):**
   - `blinka-ingest-invoice.skill.json`: Permite enviar una foto de recibo, PDF o texto de cobro a OpenClaw por WhatsApp/Telegram y disparar un `POST /api/webhooks/openclaw` hacia Blinka Guard.
   - `blinka-human-approval.skill.json`: Cuando una factura queda en estado `ESCALATED`, el agente envía al CFO un resumen ejecutivo con la tasa FX aplicada, el veredicto de JEV y comandos rápidos para aprobar o rechazar la excepción desde el chat.
2. **Simulador y Monitor en Vivo ("OpenClaw Live Drawer"):**
   - El endpoint `/api/webhooks/openclaw` valida el header `x-openclaw-secret` para conectarse con nuestra instancia real durante la demo.
   - Para que los jueces puedan probar el flujo conversacional desde la web sin necesitar acceso a nuestro servidor privado de OpenClaw, el dashboard incluye un *Drawer* interactivo que muestra los eventos webhook en vivo y permite simular tanto el envío de una factura por chat como la respuesta de aprobación humana.

---

## 📂 6. Dataset 100% Sintético de Facturas Realistas (`/public/demo-invoices`)
> **CUMPLIMIENTO ESTRICTO DE REGLAS:** Queda estrictamente prohibido usar datos reales de empresas o clientes, así como datasets públicos con recibos de comercios reales (ej. SROIE/CORD).
> El proyecto incluye una utilidad interna en `/dev/invoice-generator` que renderiza y exporta estos 8 documentos 100% sintéticos con texturas realistas (papel térmico arrugado, caligrafía a mano con bolígrafo, capturas de WhatsApp y PDFs corporativos).

| ID | Formato y Estado Visual Sintético | Proveedor Ficticio | Desglose Monetario y Tasa FX | Escenario que Prueba | Veredicto Esperado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `INV-01` | **PDF Corporativo Limpio** | CloudNova Infrastructure LLC (EE. UU.) | Subtotal: `$420` + Tax: `$0` = **`$420.00 USD`** | **Caso Normal:** Proveedor en Whitelist, bajo el límite automático ($500), coherencia JEV 98%. | `APPROVED` (Autopilot) |
| `INV-02` | **Cuenta de Cobro PDF (Moneda Local)** | Estudio Pixel Sur S.A.S. (Colombia) | Total: **`$1,680,000 COP`** → Tasa día (`4,200 COP/USD`) = **`$400.00 USD`** | **Caso Normal Multimoneda:** Conversión con trazabilidad en `FX_LEDGER` dentro de reglas. | `APPROVED` (Autopilot) |
| `INV-03` | **PDF Corporativo (Trampa de Impuestos)** | AndesSoft Devs LLC (México/EE. UU.) | Subtotal: `$460` + IVA: `$73.60` = **`$533.60 USD`** | **Trampa 1 — Supera Límite por Impuestos:** El subtotal es menor a $500, pero el `totalPayable` supera el límite automático. | `ESCALATED` (Regla Dura) |
| `INV-04` | **Foto de Recibo Hecho a Mano** (Letra manuscrita y sombras de celular) | "Carlos Méndez — Refrigeración y Eléctricos" | Total en nota: **`$145.00 USD`** | **Trampa 2 — Beneficiario Nuevo:** Monto pequeño, pero el proveedor no está en la *Whitelist* autorizada. | `ESCALATED` (Regla Dura) |
| `INV-05` | **Foto de Ticket Térmico Arrugado** (Estilo impresora POS) | CloudNova Infrastructure LLC | Total: **`$420.00 USD`** (Misma ref/periodo que `INV-01`) | **Trampa 3 — Cobro Duplicado:** Intento de cobrar dos veces el mismo servicio mediante distinto formato de archivo. | `BLOCKED` (Regla Dura + JEV) |
| `INV-06` | **Factura PDF Estándar** | Estudio Pixel Sur S.A.S. (Agencia de Diseño UX) | Total: **`$390.00 USD`** | **Trampa 4 — No cuadra con lo acordado:** Agencia de diseño gráfico facturando *"Auditoría Forense de Servidores Linux"*. | `ESCALATED` (Frenado por **JEV**: Incoherencia Semántica) |
| `INV-07` | **Captura Sintética de Chat (WhatsApp)** | AndesSoft Devs LLC | Total pedido: **`$450.00 USD`** | **Trampa 5 — Ingeniería Social / Anomalía:** El mensaje pide pagar urgente a una cuenta bancaria nueva distinta a la registrada. | `BLOCKED` (Frenado por **JEV**: `Anomaly Score = HIGH`) |
| `INV-08` | **Factura PDF Corporativa** | LexGlobal Advisory Partners | Total: **`$1,800.00 USD`** | **Trampa 6 — Presupuesto Insuficiente:** La factura excede el saldo disponible del presupuesto mensual de la empresa. | `BLOCKED` (Regla Dura: Saldo insuficiente) |

---

## 🖥️ 7. Especificación de Diseño UX/UI (3 Módulos Clave)
Interfaz construida en **Next.js (App Router) + TypeScript + Tailwind CSS + Shadcn/UI + Lucide Icons**, inspirada en el estándar visual de *Ramp / Brex / Linear*:

### Módulo 1: "Live Policy Builder & FX Ticker" (Cabecera Interactiva)
- **Sliders de Gobernanza en Tiempo Real:**
  - *Límite de Pago Automático por Factura:* (`$100 USD` a `$2,000 USD` — Default: `$500 USD`).
  - *Presupuesto Total del Periodo:* (`$1,000 USD` a `$10,000 USD` — Default: `$2,500 USD`).
  - *Umbral Mínimo de Confianza Cognitiva JEV:* (`50%` a `99%` — Default: `85%`).
- **Simulador "What-If" Instantáneo:** Al arrastrar un slider, un indicador muestra al instante cómo cambia el **% de Autonomía** (cuántas facturas se pagan solas vs. cuántas se escalan a humano), manteniendo siempre **0 pagos fuera de regla**.
- **Barra de Consumo Presupuestario y Ticker `FX_LEDGER`:** Visualización segmentada del presupuesto (Consumido vs. Retenido en Escalados vs. Disponible) y píldoras con las tasas oficiales del día (`USD/COP`, `USD/MXN`, `USD/VES`, `USD/ARS`).

### Módulo 2: Bandeja de Decisiones y Conciliación
- **Tarjetas de KPIs de Éxito (Criterios del Jurado):**
  1. `Autonomía Operativa (%)` — Facturas resueltas sin intervención humana.
  2. `Seguridad / Pagos Indebidos (0)` — Contador estricto de violaciones de política.
  3. `Velocidad Cognitiva JEV (~115ms)` — Latencia media de validación semántica.
  4. `Presupuesto Disponible ($ USD)` — Saldo restante en tiempo real.
- **Tabla Auditable con Filtros Rápidos:** Pestañas para `Todas (8)`, `Pagadas Automáticamente`, `Escaladas a Humano (Requieren Acción)` y `Frenadas / Bloqueadas`.

### Módulo 3: "Split-Screen Explainability Inspector" (Detalle de Factura)
Al hacer clic en cualquier factura, se abre un panel dividido de alta claridad:
- **Columna Izquierda (Evidencia Documental y Extracción):**
  - Visor de alta resolución del documento original (PDF, ticket térmico arrugado, nota a mano o captura de chat).
  - Tarjeta de datos extraídos: `Subtotal`, `Impuestos`, `Total Moneda Original`, `Tasa FX Aplicada (con fecha)` y **`Total Equivalente en USD`**.
- **Columna Derecha (Anatomía de la Decisión):**
  - **Bloque A — Checklist Determinista (Código):** Lista tipo semáforo con `[✓]` o `[✗]` para: *Proveedor en Whitelist*, *Verificación Anti-Duplicado Exacto*, *Conversión FX Validada*, *Límite Individual* y *Presupuesto Mensual*.
  - **Bloque B — Telemetría Cognitiva JEV (System 1):** Visualización de barras de probabilidad calibradas para `Coherencia con Contrato (%)`, `Riesgo de Duplicado Semántico (%)`, `Nivel de Anomalía en Mensaje (LOW/MED/HIGH)` y `Centro de Costo Asignado`.
  - **Bloque C — Explicación en Lenguaje Natural + Sello Criptográfico:** Párrafo ejecutivo claro explicando el porqué de la decisión, acompañado del badge `SHA-256 Audit Hash` y la pestaña `{ } Ver JSON Crudo / Telemetría`.
  - **Bloque D — Acciones Human-in-the-Loop:** Si la factura está en `ESCALATED`, muestra los botones **`[Aprobar Excepción con Nota Obligatoria]`** y **`[Rechazar Definitivamente]`**.

---

## 📁 8. Estructura de Archivos del Proyecto
```text
├── public/
│   └── demo-invoices/                  # Las 8 facturas 100% sintéticas (SVG/PNG/PDF)
├── openclaw-skills/                    # Skills listas para importar en OpenClaw
│   ├── blinka-ingest-invoice.skill.json
│   ├── blinka-human-approval.skill.json
│   └── README-OPENCLAW.md
├── src/
│   ├── types/
│   │   └── blinka.ts                   # Tipos estrictos: Rules, FXRate, Invoice, JevResult, AuditRecord
│   ├── app/
│   │   ├── page.tsx                    # Dashboard principal (Rule Builder + Inbox + Split Inspector)
│   │   ├── dev/
│   │   │   └── invoice-generator/      # Generador visual de facturas sintéticas sucias/manuscritas
│   │   └── api/
│   │       ├── evaluate/               # POST: Ejecuta en vivo Capas 1, 2, 3 (JEV) y 4 (Groq)
│   │       └── webhooks/
│   │           └── openclaw/           # POST/GET: Webhook bidireccional con OpenClaw
│   ├── components/
│   │   ├── navbar/                     # Header con botones Reset Demo, Export CSV, OpenClaw y BYOK Modal
│   │   ├── rule-builder/               # Sliders interactivos, FX Ledger Ticker y barra de presupuesto
│   │   ├── invoice-inbox/              # Tabla de facturas con badges de veredicto y botón Re-Run Live
│   │   ├── audit-inspector/            # Vista Split-Screen: Visor doc + Checklist + Barras JEV + Hash
│   │   └── openclaw-drawer/            # Panel lateral que muestra y simula la interacción con OpenClaw
│   └── lib/
│       ├── engine/
│       │   ├── 1-extractor.ts          # Extracción multimodal con esquema Zod (subtotal/tax/total)
│       │   ├── 2-hard-rules.ts         # Motor determinista puro en TS + Conversión FX + SHA-256 Hash
│       │   ├── 3-jev-client.ts         # Integración con TypeSafe JEV (Noul, Score, Choice)
│       │   ├── 4-explainer.ts          # Generador de explicación humana vía Groq + Fallback limpio
│       │   └── pipeline.ts             # Orquestador que une las 4 capas y mide milisegundos por etapa
│       ├── utils/
│       │   └── export-csv.ts           # Exportador de conciliación contable a CSV
│       └── mock-data/
│           ├── fx-ledger.ts            # Libro diario de tasas de cambio auditadas por fecha
│           ├── company-rules.ts        # Reglas iniciales y Whitelist con contratos de proveedores
│           └── initial-dataset.ts      # Los 8 casos con sus documentos y snapshots iniciales
```

---

## 🚀 9. Plan de Implementación Paso a Paso para Cursor

Sigue estrictamente esta secuencia al generar el código:

1. **Paso 1 — Tipos y Datos Base (`src/types/blinka.ts` y `src/lib/mock-data/`):**
* Definir todas las interfaces TypeScript.
* Crear `fx-ledger.ts` con tasas diarias para `USD`, `COP`, `MXN`, `VES` y `ARS`.
* Crear `company-rules.ts` con la lista de proveedores autorizados, sus rubros contractuales y límites iniciales.
* Crear `initial-dataset.ts` con los 8 casos de prueba completos (incluyendo las representaciones visuales de los tickets, notas a mano y chats para que el visor funcione desde el minuto 1).


2. **Paso 2 — El Motor Determinista Inquebrantable (`src/lib/engine/2-hard-rules.ts`):**
* Implementar la validación matemática pura sobre `totalPayableUsd`, el control de presupuesto acumulado, la detección de duplicados y el generador del `auditHash`.


3. **Paso 3 — Clientes de IA, JEV y Pipeline (`1-extractor.ts`, `3-jev-client.ts`, `4-explainer.ts`, `pipeline.ts`):**
* Conectar las llamadas reales a las APIs con soporte para keys de entorno o keys enviadas desde el modal BYOK, asegurando un *fallback* elegante y transparente si se ejecuta sin conexión.
* Crear el endpoint `/api/evaluate` y el webhook `/api/webhooks/openclaw`.


4. **Paso 4 — Interfaz de Usuario Financiera (`src/app/page.tsx` y `src/components/`):**
* Construir el Dashboard completo con el *Rule Builder* reactivo, la tabla con filtros, el *Split-Screen Inspector*, el exportador `.CSV`, el simulador de **OpenClaw** y los archivos en `/openclaw-skills/`.
import { isPayableCurrency } from "@/lib/engine/currency";
import { completeWithRetry, normalizeKeys, resolveKeys, stripJson } from "@/lib/engine/model-provider";
import { VENDOR_CATEGORIES, type VendorDraft } from "@/lib/vendors/directory";
import { z } from "zod";

const CURRENCIES = ["USD", "EUR", "BRL", "ARS", "PEN", "CRC", "COP", "MXN", "CLP", "BOB", "ZAR", "BTC", "ETH", "USDT", "USDC"] as const;

function isCorridor(code: string): code is (typeof CURRENCIES)[number] {
  return (CURRENCIES as readonly string[]).includes(code);
}

const looseSchema = z.object({
  name: z.string(),
  legal: z.string().optional(),
  email: z.string().optional(),
  country: z.string(),
  service: z.string().optional(),
  category: z.string().optional(),
  currencies: z.union([z.array(z.string()), z.string()]).optional(),
  bank: z.string(),
  holder: z.string().optional(),
  bankCountry: z.string().optional(),
  accountCurrency: z.string().optional(),
  identifier: z.string().optional(),
});

function asDraft(value: unknown): VendorDraft | null {
  const parsed = looseSchema.safeParse(value);
  if (!parsed.success) return null;
  const raw = parsed.data;
  const name = raw.name.trim().slice(0, 80);
  const country = raw.country.trim().slice(0, 80);
  const bank = raw.bank.trim().slice(0, 80);
  if (name.length < 2 || country.length < 2 || bank.length < 2) return null;
  const listed = (Array.isArray(raw.currencies) ? raw.currencies : String(raw.currencies ?? "").split(","))
    .map((item) => item.trim().toUpperCase())
    .filter((item) => isCorridor(item) && isPayableCurrency(item));
  const accountCurrency = raw.accountCurrency?.trim().toUpperCase() ?? "";
  const currency = isCorridor(accountCurrency) ? accountCurrency : (listed[0] ?? "USD");
  const currencies = [...new Set([currency, ...listed])].slice(0, 3);
  const digits = raw.identifier?.replace(/\D/g, "").slice(-4);
  const identifier = `SYN-${digits && digits.length === 4 ? digits : String(1000 + Math.floor(Math.random() * 9000))}`;
  const category = VENDOR_CATEGORIES.find((item) => item === raw.category?.trim()) ?? "Por confirmar";
  return {
    name,
    legal: (raw.legal?.trim() || name).slice(0, 120),
    email: raw.email?.trim() || "proveedor@proveedor.example",
    country,
    service: (raw.service?.trim() || "Servicio ficticio para la demo.").slice(0, 400),
    category,
    currencies,
    bank,
    holder: (raw.holder?.trim() || name).slice(0, 120),
    bankCountry: (raw.bankCountry?.trim() || country).slice(0, 80),
    accountCurrency: currency,
    identifier,
  };
}

const SYSTEM = [
  "Inventa un proveedor que no exista, solo para una demo de pagos.",
  "Prohibido usar empresas, bancos, marcas o personas reales.",
  "El correo termina en @proveedor.example.",
  "La cuenta es ficticia: identificador SYN- y cuatro dígitos, por ejemplo SYN-4821.",
  `Monedas: como máximo tres códigos de esta lista, fiat o cripto: ${CURRENCIES.join(", ")}.`,
  `Categoría, una sola, de esta lista: ${VENDOR_CATEGORIES.join(", ")}.`,
  "Responde solo JSON con name, legal, email, country, service, category, currencies, bank, holder, bankCountry, accountCurrency, identifier.",
].join(" ");

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { keys?: unknown } | null;
  const read = resolveKeys(normalizeKeys(body?.keys)).read;
  if (!read?.apiKey) {
    return Response.json({ error: "Falta la clave de OpenAI para crear el proveedor." }, { status: 400 });
  }

  let draft: VendorDraft | null = null;
  let reason = "OpenAI no devolvió un proveedor ficticio válido.";
  try {
    await completeWithRetry(
      read,
      { system: SYSTEM, user: "Crea un proveedor ficticio distinto, con su cuenta de cobro." },
      (text) => {
        const next = asDraft(readJson(text));
        if (!next) {
          reason = "OpenAI no devolvió un proveedor ficticio válido.";
          return false;
        }
        draft = next;
        return true;
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI no pudo inventar el proveedor.";
    return Response.json({ error: message }, { status: 502 });
  }

  if (!draft) {
    return Response.json({ error: reason }, { status: 502 });
  }
  return Response.json({ draft });
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(stripJson(text));
  } catch {
    return null;
  }
}

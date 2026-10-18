const TEN_MINUTES = 10 * 60_000;
const ONE_HOUR = 60 * 60_000;
const PER_IP = 60;
const GLOBAL_MAX = 500;

type Bucket = { count: number; resetAt: number };

function budget() {
  const root = globalThis as typeof globalThis & {
    blinkaLiveBudget?: { ips: Map<string, Bucket>; global: Bucket };
  };
  root.blinkaLiveBudget ??= { ips: new Map(), global: { count: 0, resetAt: 0 } };
  return root.blinkaLiveBudget;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function takeLiveSlot(ip: string): string | null {
  const now = Date.now();
  const state = budget();
  if (state.global.resetAt < now) state.global = { count: 0, resetAt: now + ONE_HOUR };
  if (state.global.count >= GLOBAL_MAX) {
    return "La demo llegó al tope de pruebas en vivo de esta hora. Espera un poco y vuelve a intentar.";
  }
  const current = state.ips.get(ip);
  if (!current || current.resetAt < now) {
    state.ips.set(ip, { count: 1, resetAt: now + TEN_MINUTES });
    state.global.count += 1;
    return null;
  }
  if (current.count >= PER_IP) {
    return "Demasiadas pruebas en vivo desde aquí. Espera unos minutos.";
  }
  current.count += 1;
  state.global.count += 1;
  return null;
}

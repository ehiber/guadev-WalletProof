const MONTHS: Record<string, number> = {
  enero: 1,
  ene: 1,
  jan: 1,
  january: 1,
  febrero: 2,
  feb: 2,
  february: 2,
  marzo: 3,
  mar: 3,
  march: 3,
  abril: 4,
  abr: 4,
  apr: 4,
  april: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  june: 6,
  julio: 7,
  jul: 7,
  july: 7,
  agosto: 8,
  ago: 8,
  aug: 8,
  august: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  sept: 9,
  september: 9,
  octubre: 10,
  oct: 10,
  october: 10,
  noviembre: 11,
  nov: 11,
  november: 11,
  diciembre: 12,
  dic: 12,
  dec: 12,
  december: 12,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function expandYear(value: string): number {
  const year = Number(value);
  if (value.length === 4) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function ymd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function monthNumber(name: string): number | undefined {
  return MONTHS[name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()];
}

export function parseIssueDate(input: string): string | null {
  const withoutTime = input
    .trim()
    .replace(/[Tt ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?$/u, "")
    .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?$/iu, "")
    .trim();
  if (!withoutTime) return null;

  let match = withoutTime.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return ymd(Number(match[1]), Number(match[2]), Number(match[3]));

  match = withoutTime.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = expandYear(match[3]);
    if (first > 12 && second <= 12) return ymd(year, second, first);
    if (second > 12 && first <= 12) return ymd(year, first, second);
    if (first <= 12 && second <= 12) return ymd(year, second, first);
    return null;
  }

  match = withoutTime.match(/^(\d{1,2})\s+de\s+([a-zA-Záéíóúñ]+)\s+de\s+(\d{4})$/iu);
  if (match) {
    const month = monthNumber(match[2]);
    if (month) return ymd(Number(match[3]), month, Number(match[1]));
  }

  match = withoutTime.match(/^(\d{1,2})[-\s/]([a-zA-Záéíóúñ]{3,})[-\s/](\d{2,4})$/iu);
  if (match) {
    const month = monthNumber(match[2]);
    if (month) return ymd(expandYear(match[3]), month, Number(match[1]));
  }

  match = withoutTime.match(/^([a-zA-Záéíóúñ]+)\s+(\d{1,2}),?\s+(\d{4})$/iu);
  if (match) {
    const month = monthNumber(match[1]);
    if (month) return ymd(Number(match[3]), month, Number(match[2]));
  }

  return null;
}

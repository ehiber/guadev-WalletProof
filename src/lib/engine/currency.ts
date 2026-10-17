const ISO_4217 = new Set(
  `AED,AFN,ALL,AMD,ANG,AOA,ARS,AUD,AWG,AZN,BAM,BBD,BDT,BGN,BHD,BIF,BMD,BND,BOB,BRL,BSD,BTN,BWP,BYN,BZD,CAD,CDF,CHF,CLP,CNY,COP,CRC,CUP,CVE,CZK,DJF,DKK,DOP,DZD,EGP,ERN,ETB,EUR,FJD,FKP,GBP,GEL,GHS,GIP,GMD,GNF,GTQ,GYD,HKD,HNL,HTG,HUF,IDR,ILS,INR,IQD,IRR,ISK,JMD,JOD,JPY,KES,KGS,KHR,KMF,KPW,KRW,KWD,KYD,KZT,LAK,LBP,LKR,LRD,LSL,LYD,MAD,MDL,MGA,MKD,MMK,MNT,MOP,MRU,MUR,MVR,MWK,MXN,MYR,MZN,NAD,NGN,NIO,NOK,NPR,NZD,OMR,PAB,PEN,PGK,PHP,PKR,PLN,PYG,QAR,RON,RSD,RUB,RWF,SAR,SBD,SCR,SDG,SEK,SGD,SHP,SLE,SLL,SOS,SRD,STN,SYP,SZL,THB,TJS,TMT,TND,TOP,TRY,TTD,TWD,TZS,UAH,UGX,USD,UYU,UZS,VES,VND,VUV,WST,XAF,XCD,XOF,XPF,YER,ZAR,ZMW,ZWL`.split(
    ",",
  ),
);

const ALIASES: Record<string, string> = {
  "€": "EUR",
  EURO: "EUR",
  EUROS: "EUR",
  "US$": "USD",
  USDOLLAR: "USD",
  DOLLAR: "USD",
  DOLLARS: "USD",
  DOLAR: "USD",
  DOLARES: "USD",
  "R$": "BRL",
  REAL: "BRL",
  REAIS: "BRL",
  "£": "GBP",
  LIBRA: "GBP",
  "¥": "JPY",
  YEN: "JPY",
  "₹": "INR",
  "PESO COLOMBIANO": "COP",
  "PESO MEXICANO": "MXN",
  "PESO ARGENTINO": "ARS",
  "BOLIVAR": "VES",
  "BOLÍVAR": "VES",
};

export function isIsoCurrency(code: string): boolean {
  return ISO_4217.has(code);
}

export function normalizeCurrency(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const compact = trimmed.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  const alias = ALIASES[trimmed] ?? ALIASES[compact] ?? ALIASES[compact.replace(/[^A-Z$€£¥₹]/g, "")];
  const code = alias ?? compact.replace(/[^A-Z]/g, "");
  return ISO_4217.has(code) ? code : null;
}

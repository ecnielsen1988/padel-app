export type TorsdagBarEntry = {
  visningsnavn?: string | null;
  product?: string | null;
  Product?: string | null;
  amount_ore?: number | null;
  note?: string | null;
  qty?: number | null;
};

const PRIZE_PRODUCTS = new Set([
  "praemie_aften_1",
  "praemie_aften_2",
  "praemie_aften_3",
  "praemie_maaned_1",
  "praemie_maaned_2",
  "praemie_maaned_3",
  "praemie_maaned_mest_aktive",
]);

const BEVERAGE_PRODUCTS = new Set([
  "stor_fadoel",
  "lille_fadoel",
  "stor_oel",
  "lille_oel",
  "sodavand",
  "vin",
]);

const PRIZE_NOTE_PREFIXES = ["præmie", "praemie"];
const PRIZE_REDEEM_NOTE_PREFIXES = ["præmie indløst", "praemie indloest", "præmie udleveret", "praemie udleveret"];

function normalizeProduct(row: TorsdagBarEntry) {
  return String(row.product ?? row.Product ?? "")
    .trim()
    .toLowerCase();
}

function normalizeNote(row: TorsdagBarEntry) {
  return String(row.note ?? "")
    .trim()
    .toLowerCase();
}

function getQty(row: TorsdagBarEntry) {
  const qty = Number((row as { qty?: number | null }).qty ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function getPrizeKind(row: TorsdagBarEntry): "beer" | "soda" | null {
  const product = normalizeProduct(row);
  const note = normalizeNote(row);

  if (note.includes("sodavand")) return "soda";
  if (note.includes("øl") || note.includes("oel")) return "beer";

  if (product.includes("sodavand")) return "soda";
  if (
    product.includes("oel") ||
    product.includes("øl") ||
    product.includes("fadoel") ||
    product.includes("fadøl")
  ) {
    return "beer";
  }

  return null;
}

export function getAmountOre(row: TorsdagBarEntry) {
  const amount = Number(row.amount_ore ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function isPrizeEntry(row: TorsdagBarEntry) {
  return PRIZE_PRODUCTS.has(normalizeProduct(row));
}

export function isBeverageEntry(row: TorsdagBarEntry) {
  return BEVERAGE_PRODUCTS.has(normalizeProduct(row));
}

export function isPrizeBeverageEntry(row: TorsdagBarEntry) {
  const note = normalizeNote(row);
  return (
    (isBeverageEntry(row) || isPrizeEntry(row)) &&
    getAmountOre(row) > 0 &&
    PRIZE_NOTE_PREFIXES.some((prefix) => note.startsWith(prefix)) &&
    !PRIZE_REDEEM_NOTE_PREFIXES.some((prefix) => note.startsWith(prefix))
  );
}

export function isPrizeRedeemEntry(row: TorsdagBarEntry) {
  const note = normalizeNote(row);
  return (
    isBeverageEntry(row) &&
    getAmountOre(row) < 0 &&
    PRIZE_REDEEM_NOTE_PREFIXES.some((prefix) => note.startsWith(prefix))
  );
}

export function isFineEntry(row: TorsdagBarEntry) {
  const product = normalizeProduct(row);
  return product === "bøde" || product === "boede" || product.includes("bøde") || product.includes("boede");
}

export function isPaymentEntry(row: TorsdagBarEntry) {
  return normalizeProduct(row) === "indbetaling";
}

export function summarizeTorsdagEntries(entries: TorsdagBarEntry[]) {
  let totalOre = 0;
  let fineOre = 0;
  let paymentOre = 0;
  let prizeOre = 0;
  let beverageOre = 0;

  for (const row of entries) {
    const amount = getAmountOre(row);
    totalOre += amount;
    if (isFineEntry(row)) fineOre += amount;
    if (isPaymentEntry(row)) paymentOre += amount;
    if (isPrizeEntry(row)) prizeOre += amount;
    if (isBeverageEntry(row)) beverageOre += amount;
  }

  const fineBalanceOre = fineOre + paymentOre;
  const outstandingFineOre = Math.max(0, -fineBalanceOre);
  const outstandingCreditOre = Math.max(0, totalOre);
  const netDebtOre = Math.max(0, -totalOre);

  return {
    totalOre,
    fineOre,
    paymentOre,
    prizeOre,
    beverageOre,
    fineBalanceOre,
    outstandingFineOre,
    outstandingCreditOre,
    netDebtOre,
  };
}

export function getPrizeCounts(entries: TorsdagBarEntry[]) {
  let beerCount = 0;
  let sodaCount = 0;

  for (const row of entries) {
    const qty = getQty(row);
    const delta = isPrizeBeverageEntry(row) ? 1 : isPrizeRedeemEntry(row) ? -1 : 0;
    const kind = getPrizeKind(row);
    if (delta === 0) continue;
    if (!kind) continue;

    if (kind === "soda") {
      sodaCount += qty * delta;
      continue;
    }

    if (kind === "beer") {
      beerCount += qty * delta;
    }
  }

  return {
    beerCount: Math.max(0, beerCount),
    sodaCount: Math.max(0, sodaCount),
  };
}

export function formatOre(amountOre: number) {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
  }).format(amountOre / 100);
}

export function prizeHintFromCredit(amountOre: number) {
  if (amountOre >= 4000) return "Nok til et par øl eller flere sodavand";
  if (amountOre >= 2000) return "Du har mindst en sodavand eller øl til gode";
  if (amountOre > 0) return "Du har lidt stående i præmier";
  return "Ingen præmier til gode lige nu";
}

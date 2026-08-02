export type TorsdagFineRow = {
  id: string;
  visningsnavn: string;
  fine_type?: string | null;
  reason: string;
  amount_ore: number;
  status?: string | null;
  event_date?: string | null;
  created_at?: string | null;
  minutes_late?: number | null;
};

export type TorsdagDrinkRow = {
  id: string;
  visningsnavn: string;
  drink_type: string;
  direction: string;
  quantity: number;
  note?: string | null;
  event_date?: string | null;
  created_at?: string | null;
};

export function formatOre(amountOre: number) {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
  }).format(amountOre / 100);
}

function normalizeStatus(value?: string | null) {
  return String(value ?? "open").trim().toLowerCase();
}

function normalizeDrinkType(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDirection(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function summarizeFineRows(rows: TorsdagFineRow[]) {
  let outstandingFineOre = 0;

  for (const row of rows) {
    const status = normalizeStatus(row.status);
    const amount = Number(row.amount_ore ?? 0);
    if (status !== "open") continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    outstandingFineOre += amount;
  }

  return {
    outstandingFineOre,
  };
}

export function summarizeDrinkRows(rows: TorsdagDrinkRow[]) {
  let beerCount = 0;
  let sodaCount = 0;

  for (const row of rows) {
    const drinkType = normalizeDrinkType(row.drink_type);
    const direction = normalizeDirection(row.direction);
    const qty = Number(row.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const delta = direction === "earned" ? qty : direction === "redeemed" ? -qty : 0;
    if (delta === 0) continue;

    if (drinkType === "beer") beerCount += delta;
    if (drinkType === "soda") sodaCount += delta;
  }

  return {
    beerCount: Math.max(0, beerCount),
    sodaCount: Math.max(0, sodaCount),
  };
}

export function buildAdminHistory(fines: TorsdagFineRow[], drinks: TorsdagDrinkRow[]) {
  const fineHistory = fines.map((row) => ({
    id: row.id,
    entryType: "fine" as const,
    title: row.reason,
    subtitle: row.event_date ?? row.created_at ?? "",
    amountLabel: formatOre(row.amount_ore),
    tone: "rose" as const,
    createdAt: row.created_at ?? "",
  }));

  const drinkHistory = drinks.map((row) => {
    const drinkEmoji = normalizeDrinkType(row.drink_type) === "soda" ? "🥤" : "🍺";
    const prefix = normalizeDirection(row.direction) === "redeemed" ? "-" : "+";
    const action =
      normalizeDirection(row.direction) === "redeemed"
        ? `Udleveret ${drinkEmoji}`
        : `Præmie ${drinkEmoji}`;

    return {
      id: row.id,
      entryType: "drink" as const,
      title: row.note?.trim() || action,
      subtitle: row.event_date ?? row.created_at ?? "",
      amountLabel: `${prefix}${row.quantity} ${drinkEmoji}`,
      tone: normalizeDirection(row.direction) === "redeemed" ? ("rose" as const) : ("emerald" as const),
      createdAt: row.created_at ?? "",
    };
  });

  return [...fineHistory, ...drinkHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}


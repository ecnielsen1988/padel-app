export type TorsdagFineRow = {
  id: string;
  visningsnavn: string;
  fine_type?: string | null;
  reason: string;
  amount_ore: number;
  paid_amount_ore?: number | null;
  status?: string | null;
  event_date?: string | null;
  created_at?: string | null;
  minutes_late?: number | null;
  payment_requested_at?: string | null;
  settled_at?: string | null;
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

export function getPaidFineOre(row: TorsdagFineRow) {
  const paid = Number(row.paid_amount_ore ?? 0);
  return Number.isFinite(paid) ? Math.max(0, paid) : 0;
}

export function getRemainingFineOre(row: TorsdagFineRow) {
  const amount = Number(row.amount_ore ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.max(0, amount - Math.min(amount, getPaidFineOre(row)));
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
  let openFineOre = 0;
  let outstandingFineOre = 0;
  let pendingFineOre = 0;
  let paidFineOre = 0;
  let openFineCount = 0;
  let pendingFineCount = 0;
  let paidFineCount = 0;

  for (const row of rows) {
    const status = normalizeStatus(row.status);
    const amount = getRemainingFineOre(row);
    if (amount <= 0) {
      paidFineOre += Number(row.amount_ore ?? 0);
      paidFineCount += 1;
      continue;
    }
    if (status === "open") {
      openFineOre += amount;
      outstandingFineOre += amount;
      openFineCount += 1;
    }
    if (status === "pending") {
      outstandingFineOre += amount;
      pendingFineOre += amount;
      pendingFineCount += 1;
    }
    if (status === "paid") {
      paidFineOre += Number(row.amount_ore ?? 0);
      paidFineCount += 1;
    }
  }

  return {
    openFineOre,
    outstandingFineOre,
    pendingFineOre,
    paidFineOre,
    openFineCount,
    pendingFineCount,
    paidFineCount,
    hasPending: pendingFineCount > 0,
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
    amountLabel:
      getRemainingFineOre(row) < Number(row.amount_ore ?? 0)
        ? `${formatOre(getRemainingFineOre(row))} / ${formatOre(Number(row.amount_ore ?? 0))}`
        : formatOre(row.amount_ore),
    tone:
      normalizeStatus(row.status) === "paid"
        ? ("emerald" as const)
        : normalizeStatus(row.status) === "pending"
          ? ("amber" as const)
          : ("rose" as const),
    status: normalizeStatus(row.status),
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
      status: null,
      createdAt: row.created_at ?? "",
    };
  });

  return [...fineHistory, ...drinkHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function buildDrinkHistory(drinks: TorsdagDrinkRow[]) {
  return [...drinks]
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .map((row) => {
      const drinkEmoji = normalizeDrinkType(row.drink_type) === "soda" ? "🥤" : "🍺";
      const isRedeemed = normalizeDirection(row.direction) === "redeemed";
      return {
        id: row.id,
        title: row.note?.trim() || (isRedeemed ? `Udleveret ${drinkEmoji}` : `Tildelt ${drinkEmoji}`),
        amountLabel: `${isRedeemed ? "-" : "+"}${row.quantity} ${drinkEmoji}`,
        tone: isRedeemed ? ("rose" as const) : ("emerald" as const),
        createdAt: row.created_at ?? "",
        eventDate: row.event_date ?? "",
      };
    });
}

export const PARTNER_FEE_OERE = 20_000;

export const WINTER_2027 = {
  id: "8296c11a-14e7-4c8e-b27d-f0a3bd4023e3",
  name: "Makkerliga 2027 Vinter",
  closes_on: "2026-12-04",
  program_on: "2026-12-07",
  play_date: "2027-02-13",
} as const;

export const PARTNER_DIVISIONS = {
  open: { name: "Åben", description: "Alle makkerpar kan deltage." },
  mix: { name: "Mix", description: "Én kvinde og én mand." },
  women: { name: "Kvinder", description: "To kvinder." },
} as const;

export type PartnerDivision = keyof typeof PARTNER_DIVISIONS;

export type PartnerRegistration = {
  id: string;
  tournament_id: string;
  payer_id: string;
  partner_id: string;
  division: PartnerDivision;
  status: "pending" | "paid" | "cancelled";
};

export type PartnerTournament = {
  id: string;
  name: string;
  play_date: string;
  closes_on: string;
  open: boolean;
};

export type TournamentSignupData = {
  userId: string;
  admin: boolean;
  preview?: true;
  paymentAvailable: boolean;
  testPayments: boolean;
  tournaments: PartnerTournament[];
  registrations: PartnerRegistration[];
  occupiedPlayers: Record<string, string[]>;
  confirmedPairs: Pick<PartnerRegistration, "tournament_id" | "payer_id" | "partner_id" | "division">[];
  players: { id: string; visningsnavn: string; koen: string | null }[];
};

export function isWoman(gender?: string | null) {
  return gender?.trim().toLowerCase() === "kvinde";
}

export const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function tournamentDateLabel(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "long", timeZone: "Europe/Copenhagen",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function copenhagenDate() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts();
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

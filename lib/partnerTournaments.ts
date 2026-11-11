export const PARTNER_FEE_OERE = 20_000;

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
  players: { id: string; visningsnavn: string; koen: string | null }[];
};

export const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function copenhagenDate() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts();
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

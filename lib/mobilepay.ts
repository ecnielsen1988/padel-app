export const MOBILEPAY_BOX_ID =
  process.env.NEXT_PUBLIC_MOBILEPAY_BOX_ID?.trim() || "2033WT";

const DEFAULT_MOBILEPAY_BOX_URL =
  "https://qr.mobilepay.dk/box/aad84999-9ff0-43c6-844f-723b298968a2/pay-in";

export const MOBILEPAY_BOX_URL =
  process.env.NEXT_PUBLIC_MOBILEPAY_BOX_URL?.trim() || DEFAULT_MOBILEPAY_BOX_URL;

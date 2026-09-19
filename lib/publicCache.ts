/**
 * Cache offentlige, ens svar på Netlifys delte CDN uden at gemme dem i
 * brugerens browser. `durable` gør cachen fælles på tværs af edge-lokationer,
 * så et cache-hit ikke starter en ny Netlify Function.
 */
export const PUBLIC_DATA_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Netlify-CDN-Cache-Control":
    "public, durable, max-age=60, stale-while-revalidate=300",
} as const;

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Netlify-CDN-Cache-Control": "no-store",
} as const;

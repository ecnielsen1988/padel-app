import { unstable_cache } from "next/cache";
import { beregnNyRangliste } from "@/lib/beregnNyRangliste";

/**
 * Deler den dyre ranglisteberegning mellem alle server-ruter i 60 sekunder.
 * Netlifys Next.js-adapter gemmer Next Data Cache på tværs af function-kald.
 */
export const getCachedRangliste = unstable_cache(
  async () => beregnNyRangliste(),
  ["public-rangliste-v1"],
  { revalidate: 60, tags: ["rangliste"] }
);

import type { RankingOverviewData } from "@/lib/rankingOverview";

const PREFETCH_TTL_MS = 5000;
let pending: Promise<RankingOverviewData> | undefined;
let prefetched: { data: RankingOverviewData; expiresAt: number } | undefined;

export function loadRankingOverview(): Promise<RankingOverviewData> {
  if (prefetched && prefetched.expiresAt > Date.now()) {
    const { data } = prefetched;
    prefetched = undefined;
    return Promise.resolve(data);
  }

  return requestRankingOverview();
}

function requestRankingOverview() {
  pending ??= fetch("/api/ranking-overview")
    .then((response) => {
      if (!response.ok) throw new Error(`Ranglisteoversigten svarede med ${response.status}`);
      return response.json() as Promise<RankingOverviewData>;
    })
    .finally(() => { pending = undefined; });
  return pending;
}

export function preloadRankingOverview() {
  if (pending || (prefetched && prefetched.expiresAt > Date.now())) return;
  void requestRankingOverview()
    .then((data) => { prefetched = { data, expiresAt: Date.now() + PREFETCH_TTL_MS }; })
    .catch(() => {});
}

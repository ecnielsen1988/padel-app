"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, PageShell, StatusPill } from "@/app/components/ui";
import { leagueStandings, type LeaguePool } from "@/lib/partnerLeague";
import { PARTNER_DIVISIONS, WINTER_2027 } from "@/lib/partnerTournaments";
import { matchCourtLabel, matchTimeLabel } from "@/lib/playerMatches";

const poolLabel = (pool: LeaguePool) => `${PARTNER_DIVISIONS[pool.division].name} · Pulje ${pool.number}`;

export function PoolView({ poolId }: { poolId?: string }) {
  const [pools, setPools] = useState<LeaguePool[]>();
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/makkerrangliste/puljer", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) {
          setLogin(response.status === 401);
          setError(data.error);
        } else {
          setPools(data.pools);
        }
      } catch {
        if (!controller.signal.aborted) setError("Puljerne kunne ikke hentes.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const pool = pools?.find((pool) => pool.id === poolId);

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <Link href={poolId ? "/makkerrangliste/puljer" : "/makkerrangliste"} className="font-semibold text-[var(--brand-strong)]">
          ← {poolId ? "Alle puljer" : "Makkerliga"}
        </Link>
        <PageHeader title={pool ? poolLabel(pool) : "Makkerligaens puljer"} description={WINTER_2027.name}
          action={<Link href="/makkerrangliste/kalender" className="padel-secondary-button inline-flex">Bekræftede kampe</Link>} />
        {error && <p role="alert" className="padel-surface">{error} {login && <Link href="/login" className="underline">Log ind</Link>}</p>}
        {!pools && !error && <p role="status">Henter puljer …</p>}
        {pool ? <PoolDetails pool={pool} /> : pools && (
          !pools.length ? <p className="padel-surface">Puljerne er endnu ikke offentliggjort.</p>
            : poolId ? <p className="padel-surface">Puljen blev ikke fundet.</p>
            : <div className="grid gap-3 sm:grid-cols-2">
              {pools.map((pool) => (
                <Link key={pool.id} href={`/makkerrangliste/puljer/${pool.id}`} className="padel-action-card">
                  <h2 className="text-lg font-bold">{poolLabel(pool)}</h2>
                  <p className="text-sm text-[var(--muted)]">{pool.teams.length} par · {pool.matches.length} kampe</p>
                  {pool.matches.some((match) => match.id) && <p className="mt-2 font-semibold">Din pulje</p>}
                </Link>
              ))}
            </div>
        )}
      </div>
    </PageShell>
  );
}

function PoolDetails({ pool }: { pool: LeaguePool }) {
  const names = new Map(pool.teams.map((team) => [team.id, team.names.join(" & ")]));
  return <>
    <section className="padel-surface space-y-3">
      <h2 className="text-xl font-bold">Stilling</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)]">
            <tr>{["Nr.", "Par", "Spillet", "Point", "Sætforskel", "Partiforskel"].map((title) => <th key={title} scope="col" className="py-2 pr-3">{title}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {leagueStandings(pool).map((team) => <tr key={team.id}>
              {[team.place, team.names.join(" & "), team.played, team.points, team.setDifference, team.gameDifference].map((value, index) =>
                <td key={index} className={`py-2 pr-3 ${index === 3 ? "font-bold" : ""}`}>{value}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    <section className="padel-surface space-y-3">
      <h2 className="text-xl font-bold">Puljekampe</h2>
      {pool.matches.length ? (
        <ul className="divide-y divide-[var(--border)]">
          {pool.matches.map((match) => <li key={match.team_a + match.team_b} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="space-y-1">
              <p className="font-semibold">{names.get(match.team_a)} mod {names.get(match.team_b)}</p>
              <p className="text-sm text-[var(--muted)]">
                {matchTimeLabel(match)}
                {match.location && match.court && ` · ${match.location} · ${matchCourtLabel(match.court)}`}
              </p>
              {match.sets?.length ? <p className="text-sm font-semibold">{match.sets.map((set) => `${set.a}–${set.b}`).join(", ")}</p>
                : match.date && <StatusPill tone={match.confirmed ? "success" : "warning"}>{match.confirmed ? "Bekræftet" : "Afventer bekræftelse"}</StatusPill>}
            </div>
            {match.id && <Link href={`/kampe/${match.id}#samtale`} className="padel-secondary-button inline-flex">Åbn kamptråd</Link>}
          </li>)}
        </ul>
      ) : <p>Der er ingen kampe i puljen.</p>}
    </section>
  </>;
}

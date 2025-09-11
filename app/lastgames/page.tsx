// app/lastgames/page.tsx
'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Kamp, EloChange, EloMap, beregnEloForKampe } from '@/lib/beregnElo';

interface KampGruppe {
  kampid: number;
  sæt: Kamp[];
  indberettetAf?: string;
}

export default function SenesteKampeSide() {
  const [kampGrupper, setKampGrupper] = useState<KampGruppe[]>([]);
  const [eloMap, setEloMap] = useState<EloMap>({});
  const [eloChanges, setEloChanges] = useState<Record<number, { [key: string]: EloChange }>>({});
  const [kommentarer, setKommentarer] = useState<Record<number, string>>({});

  useEffect(() => {
    async function hentAlleResultater(): Promise<Kamp[]> {
      const batchSize = 1000;
      let alleResultater: Kamp[] = [];
      let lastId = 0;

      while (true) {
        const res = await (supabase.from('newresults') as any)
          .select('*')
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .gt('id', lastId)
          .limit(batchSize);

        const batch = (res?.data ?? []) as any[];
        const error = res?.error as any;

        if (error) break;
        if (!batch || batch.length === 0) break;

        alleResultater = alleResultater.concat(batch as unknown as Kamp[]);
        lastId = Number((batch[batch.length - 1] as any).id) || lastId;
        if (batch.length < batchSize) break;
      }

      return alleResultater;
    }

    async function hentResultaterOgBeregnElo() {
      // Hent profiler for startElo
      const profRes = await (supabase.from('profiles') as any).select('*');
      const spillereData = (profRes?.data ?? []) as any[];
      if (!spillereData) return;

      const initialEloMap: EloMap = {};
      spillereData.forEach((s: any) => {
        const key = (s?.visningsnavn ?? '').toString().trim();
        if (key) initialEloMap[key] = s?.startElo ?? 1500;
      });

      const resultaterData = await hentAlleResultater();
      if (!resultaterData || resultaterData.length === 0) return;

      const { nyEloMap, eloChanges } = beregnEloForKampe(resultaterData, initialEloMap);

      // Gruppér pr. kampid
      const grupper: Record<number, Kamp[]> = {};
      resultaterData.forEach((kamp) => {
        const key = Number((kamp as any).kampid ?? 0);
        if (!grupper[key]) grupper[key] = [];
        grupper[key].push(kamp);
      });

      const kampGrupperArray: KampGruppe[] = Object.entries(grupper)
        .map(([kampid, sætUnTyped]) => {
          const sæt = sætUnTyped as Kamp[];
          return {
            kampid: Number(kampid),
            sæt,
            indberettetAf: (sæt[0] as any)?.indberettet_af
              ? String((sæt[0] as any).indberettet_af)
              : undefined,
          };
        })
        .sort((a, b) => b.kampid - a.kampid)
        .slice(0, 20);

      setKampGrupper(kampGrupperArray);
      setEloMap(nyEloMap);
      setEloChanges(eloChanges);
    }

    hentResultaterOgBeregnElo();
  }, []);

  function getEmojiForEloDiff(diff: number): string {
    if (diff >= 100) return '🍾';
    if (diff >= 50) return '🏆';
    if (diff >= 40) return '🏅';
    if (diff >= 30) return '☄️';
    if (diff >= 20) return '🚀';
    if (diff >= 10) return '🔥';
    if (diff >= 5) return '📈';
    if (diff >= 0) return '💪';
    if (diff > -5) return '🎲';
    if (diff > -10) return '📉';
    if (diff > -20) return '🧯';
    if (diff > -30) return '🪂';
    if (diff > -40) return '❄️';
    if (diff > -50) return '🙈';
    if (diff > -100) return '🥊';
    if (diff > -150) return '💩';
    return '💩💩';
  }

  // Hent visningsnavn — foretræk profiles, dernæst auth metadata
  async function hentVisningsnavn(): Promise<string | null> {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return null;

    // 1) Profiles
    const profRes = await (supabase.from('profiles') as any)
      .select('visningsnavn')
      .eq('id', user.id)
      .maybeSingle();

    const profileData = (profRes?.data ?? null) as { visningsnavn?: string } | null;
    let navn = (profileData?.visningsnavn ?? '').toString().trim();

    // 2) Fallback: auth.user_metadata.visningsnavn
    if (!navn) {
      navn = ((user.user_metadata as any)?.visningsnavn ?? '').toString().trim();
    }

    // 3) Sidste fallback: name/email
    if (!navn) {
      navn =
        ((user.user_metadata as any)?.name ?? '').toString().trim() ||
        (user.email ? user.email.split('@')[0] : '');
    }

    return navn || null;
  }

  async function sendBeskedTilAdmin(kampid: number) {
    const raw = kommentarer[kampid];
    const besked = (raw ?? '').toString().trim();
    if (!besked) {
      alert('Skriv en kommentar før du sender.');
      return;
    }

    const visningsnavn = await hentVisningsnavn();
    if (!visningsnavn) {
      alert('Du skal være logget ind (med visningsnavn) for at sende besked.');
      return;
    }

    const insertRes = await (supabase.from('admin_messages') as any).insert([
      {
        kampid,
        besked,
        tidspunkt: new Date().toISOString(),
        visningsnavn,
      },
    ]);
    const error = insertRes?.error as any;

    if (error) {
      alert('Kunne ikke sende besked: ' + error.message);
    } else {
      alert('Besked sendt til admin.');
      setKommentarer((prev) => ({ ...prev, [kampid]: '' }));
    }
  }

  return (
    <div
      style={{
        padding: '1rem',
        fontFamily: 'Arial, sans-serif',
        maxWidth: '700px',
        margin: 'auto',
        color: 'inherit',
        backgroundColor: 'inherit',
        position: 'relative',
      }}
    >
      {/* Tilbage-knap øverst venstre */}
      <button
        onClick={() => {
          if (typeof window !== 'undefined') window.history.back();
        }}
        aria-label="Tilbage"
        title="Tilbage"
        style={{
          position: 'fixed',
          top: '12px',
          left: '12px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: '#fff0f5',
          border: '2px solid #ec407a',
          color: '#ec407a',
          padding: '6px 10px',
          borderRadius: '999px',
          cursor: 'pointer',
          fontWeight: 700,
          boxShadow: '0 0 6px rgba(236,64,122,0.15)',
          zIndex: 50,
        }}
      >
        ← Tilbage
      </button>

      <h1 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>🎾 Seneste Kampe</h1>
      <p style={{ textAlign: 'center', marginBottom: '2rem', color: '#666' }}>
        Viser de seneste 20 kampe
      </p>

      {kampGrupper.map(({ kampid, sæt, indberettetAf }) => {
        const førsteSæt = sæt[0];
        const førsteElo = eloChanges[førsteSæt.id];
        let spillere: { navn: string; startElo: number }[] = [];

        if (førsteElo) {
          spillere = [
            { navn: førsteSæt.holdA1, startElo: førsteElo[førsteSæt.holdA1]?.before ?? 1500 },
            { navn: førsteSæt.holdA2, startElo: førsteElo[førsteSæt.holdA2]?.before ?? 1500 },
            { navn: førsteSæt.holdB1, startElo: førsteElo[førsteSæt.holdB1]?.before ?? 1500 },
            { navn: førsteSæt.holdB2, startElo: førsteElo[førsteSæt.holdB2]?.before ?? 1500 },
          ].sort((a, b) => b.startElo - a.startElo);
        }

        const samletEloChanges: { [key: string]: EloChange } = {};
        sæt.forEach((kamp) => {
          const changes = eloChanges[kamp.id];
          if (changes) {
            Object.entries(changes).forEach(([navn, change]) => {
              if (!samletEloChanges[navn]) {
                samletEloChanges[navn] = { before: change.before, after: change.after, diff: 0 };
              }
              samletEloChanges[navn].diff += change.diff;
              samletEloChanges[navn].after = change.after;
            });
          }
        });

        const totalEloSorted = Object.entries(samletEloChanges).sort(
          (a, b) => b[1].after - a[1].after
        );

        return (
          <div
            key={kampid}
            style={{
              marginBottom: '2.5rem',
              padding: '1rem 1.5rem',
              border: '2px solid #ec407a',
              borderRadius: '8px',
              backgroundColor: '#fff0f5',
              color: '#000',
              boxShadow: '0 0 5px rgba(0,0,0,0.05), 0 0 10px rgba(236,64,122,0.1)',
              position: 'relative',
            }}
          >
            <div style={{ fontSize: '1.1rem', marginBottom: '0.3rem', fontWeight: '600' }}>
              📅 {new Date(førsteSæt.date).toLocaleDateString('da-DK')}
            </div>

            {/* Øverste spilleroversigt */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
                marginBottom: '1rem',
              }}
            >
              {spillere.map(({ navn, startElo }) => (
                <div
                  key={navn}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    fontSize: 'clamp(0.75rem, 2.5vw, 0.95rem)',
                    lineHeight: '1.2',
                  }}
                >
                  <span style={{ fontSize: 'clamp(0.9rem, 3vw, 1rem)', marginRight: '0.4rem' }}>
                    🎾
                  </span>
                  <strong
                    style={{
                      marginRight: '0.5rem',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                    }}
                  >
                    {navn}
                  </strong>

                  <span style={{ color: '#555', fontSize: '0.8em' }}>
                    ELO før: {startElo.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>

            {/* Sætvisning */}
            <div style={{ marginBottom: '1rem' }}>
              {sæt.map((kamp, index) => {
                const changes = eloChanges[kamp.id];
                let setElo = 0;
                if (changes) {
                  const maxDiff = Math.max(...Object.values(changes).map((c) => c.diff));
                  setElo = maxDiff > 0 ? maxDiff : 0;
                }

                return (
                  <div
                    key={kamp.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.3rem 0',
                      borderBottom: index === sæt.length - 1 ? 'none' : '1px solid #ddd',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {kamp.holdA1} & {kamp.holdA2} vs. {kamp.holdB1} & {kamp.holdB2}
                    </div>
                    <div style={{ width: '70px', textAlign: 'center' }}>
                      {kamp.scoreA} - {kamp.scoreB}
                    </div>
                    <div
                      style={{
                        width: '50px',
                        textAlign: 'right',
                        fontWeight: '500',
                        color: '#2e7d32',
                      }}
                    >
                      {setElo.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Elo efter kampen */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
                marginTop: '1.2rem',
                paddingTop: '1rem',
                borderTop: '1px dashed #aaa',
              }}
            >
              {totalEloSorted.map(([navn, elo]) => (
                <div
                  key={navn}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.8rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '1rem', marginRight: '0.5rem' }}>
                    {getEmojiForEloDiff(elo.diff)}
                  </span>
                  <strong style={{ marginRight: '0.5rem' }}>{navn}</strong>
                  <span style={{ color: '#555', fontSize: '0.85rem', marginRight: '0.5rem' }}>
                    Elo: {elo.after.toFixed(1)}
                  </span>
                  <span
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                      color:
                        elo.diff > 0 ? '#2e7d32' : elo.diff < 0 ? '#c62828' : '#666',
                    }}
                  >
                    ({elo.diff > 0 ? '+' : ''}
                    {elo.diff.toFixed(1)})
                  </span>
                </div>
              ))}
            </div>

            {/* Indberettet af */}
            {(indberettetAf ?? '').toString().trim() && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '0.4rem',
                  right: '0.8rem',
                  fontSize: '0.75rem',
                  color: '#888',
                }}
              >
                Indberettet af {(indberettetAf ?? '').toString().trim()}
              </div>
            )}

            {/* Indrapportér fejl */}
            <div style={{ marginTop: '1.5rem' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.3rem',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                }}
              >
                🚫 Indberet fejl i kampen:
              </label>
              <textarea
                placeholder="Skriv hvad der er forkert..."
                value={kommentarer[kampid] || ''}
                onChange={(e) =>
                  setKommentarer((prev) => ({ ...prev, [kampid]: e.target.value }))
                }
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  minHeight: '60px',
                  marginBottom: '0.5rem',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={() => sendBeskedTilAdmin(kampid)}
                style={{
                  backgroundColor: '#ec407a',
                  color: '#fff',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                📩 Send besked
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}


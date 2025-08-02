'use client'
export const dynamic = 'force-dynamic'

import { supabase } from '../../lib/supabaseClient'
import React, { useEffect, useState } from 'react'
import { Kamp, EloChange, EloMap, beregnEloForKampe } from '../../lib/beregnElo'

interface KampGruppe {
  kampid: number
  sæt: Kamp[]
  indberettetAf?: string
}

export default function SenesteKampeSide() {
  const [kampGrupper, setKampGrupper] = useState<KampGruppe[]>([])
  const [eloMap, setEloMap] = useState<EloMap>({})
  const [eloChanges, setEloChanges] = useState<Record<number, { [key: string]: EloChange }>>({})
  const [kommentarer, setKommentarer] = useState<Record<number, string>>({})

  useEffect(() => {
    async function hentAlleResultater(): Promise<Kamp[]> {
      const batchSize = 1000
      let alleResultater: Kamp[] = []
      let lastId = 0

      while (true) {
        const { data: batch, error } = await supabase
          .from('newresults')
          .select('*')
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .gt('id', lastId)
          .limit(batchSize)

        if (error) {
          console.error('Fejl ved hentning af batch:', error)
          break
        }

        if (!batch || batch.length === 0) break

        alleResultater = alleResultater.concat(batch)
        lastId = batch[batch.length - 1].id

        if (batch.length < batchSize) break
      }

      return alleResultater
    }

    async function hentResultaterOgBeregnElo() {
      const { data: spillereData } = await supabase.from('profiles').select('*')
      if (!spillereData) return

      const initialEloMap: EloMap = {}
      spillereData.forEach((s: any) => {
        initialEloMap[s.visningsnavn.trim()] = s.startElo ?? 1500
      })

      const resultaterData = await hentAlleResultater()
      if (!resultaterData) return

      const { nyEloMap, eloChanges } = beregnEloForKampe(resultaterData, initialEloMap)

      const grupper: Record<number, Kamp[]> = {}
      resultaterData.forEach((kamp) => {
        const key = kamp.kampid ?? 0
        if (!grupper[key]) grupper[key] = []
        grupper[key].push(kamp)
      })

      const kampGrupperArray: KampGruppe[] = Object.entries(grupper)
  .map(([kampid, sætUnTyped]) => {
    const sæt = sætUnTyped as Kamp[]
    return {
      kampid: Number(kampid),
      sæt,
      indberettetAf: sæt[0].indberettet_af || null,
    }
  })
  
        .sort((a, b) => b.kampid - a.kampid)
        .slice(0, 20)

      setKampGrupper(kampGrupperArray)
      setEloMap(nyEloMap)
      setEloChanges(eloChanges)
    }

    hentResultaterOgBeregnElo()
  }, [])

  async function sendBeskedTilAdmin(kampid: number) {
    const besked = kommentarer[kampid]
    if (!besked) return

    const { data: userData } = await supabase.auth.getUser()
    const senderId = userData?.user?.id

    if (!senderId) {
      alert('Du skal være logget ind for at sende besked.')
      return
    }

    const { error } = await supabase.from('admin_messages').insert([
      {
        kampid,
        besked,
        tidspunkt: new Date().toISOString(),
        sender_id: senderId,
      },
    ])

    if (error) {
      alert('Kunne ikke sende besked: ' + error.message)
    } else {
      alert('Besked sendt til admin.')
      setKommentarer((prev) => ({ ...prev, [kampid]: '' }))
    }
  }

  function redigerKamp(kampid: number) {
    window.location.href = `/rediger/${kampid}`
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
      }}
    >
      <h1 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>🎾 Seneste Kampe med Elo-ændringer</h1>
      <p style={{ textAlign: 'center', marginBottom: '2rem', color: '#666' }}>
        Viser de seneste 20 kampe
      </p>

      {kampGrupper.map(({ kampid, sæt, indberettetAf }) => {
        const førsteSæt = sæt[0]
        const førsteElo = eloChanges[førsteSæt.id]
        let spillere: { navn: string; startElo: number }[] = []

        if (førsteElo) {
          spillere = [
            { navn: førsteSæt.holdA1, startElo: førsteElo[førsteSæt.holdA1]?.before ?? 1500 },
            { navn: førsteSæt.holdA2, startElo: førsteElo[førsteSæt.holdA2]?.before ?? 1500 },
            { navn: førsteSæt.holdB1, startElo: førsteElo[førsteSæt.holdB1]?.before ?? 1500 },
            { navn: førsteSæt.holdB2, startElo: førsteElo[førsteSæt.holdB2]?.before ?? 1500 },
          ].sort((a, b) => b.startElo - a.startElo)
        }

        const samletEloChanges: { [key: string]: EloChange } = {}
        sæt.forEach((kamp) => {
          const changes = eloChanges[kamp.id]
          if (changes) {
            Object.entries(changes).forEach(([navn, change]) => {
              if (!samletEloChanges[navn]) {
                samletEloChanges[navn] = { before: change.before, after: change.after, diff: 0 }
              }
              samletEloChanges[navn].diff += change.diff
              samletEloChanges[navn].after = change.after
            })
          }
        })

        const totalEloSorted = Object.entries(samletEloChanges).sort(
          (a, b) => b[1].after - a[1].after
        )

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
    position: 'relative', // 👈 nødvendig for absolut placering
  }}
>

            <div style={{ fontSize: '1.1rem', marginBottom: '0.3rem', fontWeight: '600' }}>
              📅 {new Date(førsteSæt.date).toLocaleDateString('da-DK')}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-around', fontWeight: '600', marginBottom: '0.8rem' }}>
              {spillere.map(({ navn, startElo }) => (
                <div key={navn} style={{ textAlign: 'center', minWidth: '110px' }}>
                  🎾 <br />
                  {navn} <br />
                  <small style={{ color: '#555' }}>ELO før: {startElo.toFixed(1)}</small>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              {sæt.map((kamp, index) => {
                const changes = eloChanges[kamp.id]
                let setElo = 0
                if (changes) {
                  const maxDiff = Math.max(...Object.values(changes).map((c) => c.diff))
                  setElo = maxDiff > 0 ? maxDiff : 0
                }

                return (
                  <div
                    key={kamp.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.3rem 0',
                      borderBottom: index === sæt.length - 1 ? 'none' : '1px solid #ddd',
                      fontSize: '0.95rem',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {kamp.holdA1} & {kamp.holdA2} vs. {kamp.holdB1} & {kamp.holdB2}
                    </div>
                    <div style={{ width: '70px', textAlign: 'center' }}>
                      {kamp.scoreA} - {kamp.scoreB}
                    </div>
                    <div style={{ width: '50px', textAlign: 'right', fontWeight: '700', color: '#2e7d32' }}>
                      {setElo.toFixed(1)}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px dashed #aaa' }}>
              {totalEloSorted.map(([navn, elo]) => (
                <div key={navn} style={{ textAlign: 'center', minWidth: '100px' }}>
                  <div
  style={{
    fontSize: '1.2rem',
  }}
>
  <span className="sm:text-[1.5rem]">🎾</span>
</div>

                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', marginTop: '0.2rem' }}>{navn}</div>
                  <div style={{ fontSize: '0.85rem', color: '#555' }}>Elo: {elo.after.toFixed(1)}</div>
                  <div style={{
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    color: elo.diff > 0 ? '#2e7d32' : elo.diff < 0 ? '#c62828' : '#666',
                    marginTop: '0.2rem',
                  }}>
                    {elo.diff > 0 ? '+' : ''}
                    {elo.diff.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>

            {indberettetAf && (
  <div style={{
    position: 'absolute',
    bottom: '0.4rem',
    right: '0.8rem',
    fontSize: '0.75rem',
    color: '#888',
  }}>
    Indberettet af {indberettetAf}
  </div>
)}


            <div style={{ marginTop: '1.5rem' }}>
              {(() => {
                const kampTidspunkt = new Date(førsteSæt.date)
                const nu = new Date()
                const forskelIMs = nu.getTime() - kampTidspunkt.getTime()
                const kanRedigeres = forskelIMs < 24 * 60 * 60 * 1000

                if (kanRedigeres) {
                  return (
                    <button
                      onClick={() => redigerKamp(kampid)}
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
                      ✏️ Rediger kamp
                    </button>
                  )
                } else {
                  return (
                    <div>
                      <textarea
                        placeholder="Skriv en kommentar til administrator..."
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
                        📩 Send kommentar til administrator
                      </button>
                    </div>
                  )
                }
              })()}
            </div>
          </div>
        )
      })}
    </div>
  )
}


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

        if (error) break
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
            indberettetAf: sæt[0].indberettet_af ?? undefined,
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

  function getEmojiForEloDiff(diff: number): string {
    if (diff >= 100) return '🍾'
    if (diff >= 50) return '🏆'
    if (diff >= 40) return '🏅'
    if (diff >= 30) return '☄️'
    if (diff >= 20) return '🚀'
    if (diff >= 10) return '🔥'
    if (diff >= 5) return '📈'
    if (diff >= 0) return '💪'
    if (diff > -5) return '🎲'
    if (diff > -10) return '📉'
    if (diff > -20) return '🧯'
    if (diff > -30) return '🪂'
    if (diff > -40) return '❄️'
    if (diff > -50) return '🙈'
    if (diff > -100) return '🥊'
   if (diff > -150) return '💩'
    return '💩💩'
  }




 async function sendBeskedTilAdmin(kampid: number) {
  const besked = kommentarer[kampid]
  if (!besked) return

  // 1. Hent den aktuelle bruger
  const { data: userData, error: authError } = await supabase.auth.getUser()
  const brugerId = userData?.user?.id

  if (authError || !brugerId) {
    alert('Du skal være logget ind for at sende besked.')
    return
  }

  // 2. Hent visningsnavn fra 'profiles' baseret på brugerens id
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('visningsnavn')
    .eq('id', brugerId)
    .single()

  if (profileError || !profileData?.visningsnavn) {
    alert('Kunne ikke finde dit visningsnavn i profiler.')
    return
  }

  const visningsnavn = profileData.visningsnavn

  // 3. Indsæt beskeden i admin_messages
  const { error } = await supabase.from('admin_messages').insert([
    {
      kampid,
      besked,
      tidspunkt: new Date().toISOString(),
      visningsnavn,
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
      <span style={{ fontSize: 'clamp(0.9rem, 3vw, 1rem)', marginRight: '0.4rem' }}>🎾</span>
     <strong
  style={{
    marginRight: '0.5rem',
    fontWeight: 800,
    fontSize: '0.8rem', // eller fx '0.75rem'
  }}
>
  {navn}
</strong>

      <span style={{ color: '#555', fontSize: '0.8em' }}>ELO før: {startElo.toFixed(1)}</span>
    </div>
  ))}
</div>



            {/* Sætvisning */}
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
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {kamp.holdA1} & {kamp.holdA2} vs. {kamp.holdB1} & {kamp.holdB2}
                    </div>
                    <div style={{ width: '70px', textAlign: 'center' }}>
                      {kamp.scoreA} - {kamp.scoreB}
                    </div>
                    <div style={{ width: '50px', textAlign: 'right', fontWeight: '500', color: '#2e7d32' }}>
                      {setElo.toFixed(1)}
                    </div>
                  </div>
                )
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
      <span style={{ fontSize: '1rem', marginRight: '0.5rem' }}>{getEmojiForEloDiff(elo.diff)}</span>
      <strong style={{ marginRight: '0.5rem' }}>{navn}</strong>
      <span style={{ color: '#555', fontSize: '0.85rem', marginRight: '0.5rem' }}>
        Elo: {elo.after.toFixed(1)}
      </span>
      <span
        style={{
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: elo.diff > 0 ? '#2e7d32' : elo.diff < 0 ? '#c62828' : '#666',
        }}
      >
        ({elo.diff > 0 ? '+' : ''}
        {elo.diff.toFixed(1)})
      </span>
    </div>
  ))}
</div>


            {/* Indberettet af */}
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

            {/* Rediger eller kommentar */}
            <div style={{ marginTop: '1.5rem' }}>
              <div>
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
          </div>
        )
      })}
    </div>
  )
}


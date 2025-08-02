'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { SaetForm } from './SaetForm'

export default function ResultatForm() {
  const [spillere, setSpillere] = useState<{ id: number; visningsnavn: string }[]>([])
  const [aktivtSaet, setAktivtSaet] = useState<any>(nytTomtSaet())
  const [afsluttedeSaet, setAfsluttedeSaet] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [begrænsedeSpillere, setBegrænsedeSpillere] = useState<{ value: string; label: string }[] | null>(null)

  useEffect(() => {
    async function hentSpillere() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, visningsnavn')
        .order('visningsnavn', { ascending: true })

      if (error) {
        console.error('Fejl ved hentning af spillere:', error)
      } else {
        setSpillere(data || [])
      }
    }

    hentSpillere()
  }, [])

  useEffect(() => {
    if (aktivtSaet.date === '') {
      const iDag = new Date().toISOString().split('T')[0]
      setAktivtSaet((prev: any) => ({ ...prev, date: iDag }))
    }
  }, [aktivtSaet])

  const spillerOptions = spillere.map((s) => ({ value: s.visningsnavn, label: s.visningsnavn }))
  const faerdigResultater = [
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6],
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 7], [6, 7]
  ]

  function nytTomtSaet() {
    return {
      date: '',
      holdA1: null,
      holdA2: null,
      holdB1: null,
      holdB2: null,
      scoreA: 0,
      scoreB: 0,
    }
  }

  const erFaerdigspillet = (a: number, b: number) =>
    faerdigResultater.some(([x, y]) => x === a && y === b)

  const tilfoejSaet = () => {
    setAfsluttedeSaet((prev) => [...prev, aktivtSaet])

    const første = aktivtSaet
    const spillernavne = [
      første.holdA1?.value || første.holdA1,
      første.holdA2?.value || første.holdA2,
      første.holdB1?.value || første.holdB1,
      første.holdB2?.value || første.holdB2,
    ]

    const begrænsede = spillerOptions.filter((opt) =>
      spillernavne.includes(opt.value)
    )

    setBegrænsedeSpillere(begrænsede)

    setAktivtSaet({
      date: new Date().toISOString().split('T')[0],
      holdA1: første.holdA1?.value || første.holdA1,
      holdA2: første.holdA2?.value || første.holdA2,
      holdB1: første.holdB1?.value || første.holdB1,
      holdB2: første.holdB2?.value || første.holdB2,
      scoreA: 0,
      scoreB: 0,
    })
  }

  const fjernSaet = (index: number) => {
    setAfsluttedeSaet((prev) => prev.filter((_, i) => i !== index))
  }

  const opdaterSaet = (felt: string, value: any) => {
    setAktivtSaet((prev: any) => ({
      ...prev,
      [felt]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Hent brugerinfo og visningsnavn
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setMessage('❌ Kunne ikke finde bruger – log venligst ind.')
      return
    }

    const { data: profil, error: profilError } = await supabase
      .from('profiles')
      .select('visningsnavn')
      .eq('id', user.id)
      .single()

    if (profilError || !profil) {
      setMessage('❌ Kunne ikke finde brugerprofil.')
      return
    }

    const visningsnavn = profil.visningsnavn

    const { data: maxData, error: maxError } = await supabase
      .from('newresults')
      .select('kampid')
      .not('kampid', 'is', null)
      .order('kampid', { ascending: false })
      .limit(1)

    if (maxError) {
      setMessage('❌ Fejl ved hentning af kampid: ' + maxError.message)
      return
    }

    const nyKampid = (maxData?.[0]?.kampid || 0) + 1
    const alleSaet = [...afsluttedeSaet, aktivtSaet]

    const resultater = alleSaet
      .filter((s) => !(s.scoreA === 0 && s.scoreB === 0))
      .map((s) => ({
        date: s.date,
        holdA1: s.holdA1?.value || s.holdA1,
        holdA2: s.holdA2?.value || s.holdA2,
        holdB1: s.holdB1?.value || s.holdB1,
        holdB2: s.holdB2?.value || s.holdB2,
        scoreA: s.scoreA,
        scoreB: s.scoreB,
        finish: erFaerdigspillet(s.scoreA, s.scoreB),
        event: false,
        tiebreak: 'ingen',
        kampid: nyKampid,
        indberettet_af: visningsnavn,
      }))

    const { error } = await supabase.from('newresults').insert(resultater)

    if (error) {
      setMessage('❌ Fejl: ' + error.message)
    } else {
      setMessage(`✅ Resultater indsendt! 🏆 Kamp ID: ${nyKampid}`)
      setAfsluttedeSaet([])
      setAktivtSaet(nytTomtSaet())
      setBegrænsedeSpillere(null)
    }
  }

  const navn = (idOrObj: any) => {
    const id = typeof idOrObj === 'object' ? idOrObj?.value : idOrObj
    return spillerOptions.find((s) => s.value === id)?.label || 'Ukendt'
  }

  return (
    <main style={{
      maxWidth: '600px',
      margin: 'auto',
      padding: '2rem',
      fontFamily: 'sans-serif',
      backgroundColor: '#fff0f6',
      borderRadius: '12px'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: '#d63384' }}>🎾 Indtast resultater</h1>

      <form onSubmit={handleSubmit}>
        {afsluttedeSaet.length > 0 && (
          <div style={{ marginBottom: '1.5rem', color: '#6a1b9a', fontWeight: 'bold' }}>
            Tidligere sæt:
            <ul style={{ paddingLeft: '1rem' }}>
              {afsluttedeSaet.map((s, i) => (
                <li key={i} style={{ marginBottom: '0.5rem' }}>
                  Sæt #{i + 1}: {navn(s.holdA1)} & {navn(s.holdA2)} vs. {navn(s.holdB1)} & {navn(s.holdB2)} – {s.scoreA}-{s.scoreB}
                  <button
                    onClick={() => fjernSaet(i)}
                    title="Fjern sæt"
                    style={{
                      marginLeft: '0.5rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#d81b60',
                      fontSize: '1.2rem',
                    }}
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <SaetForm
          index={afsluttedeSaet.length}
          saet={aktivtSaet}
          spillerOptions={spillerOptions}
          opdaterSaet={(index, felt, value) => opdaterSaet(felt, value)}
          begrænsedeSpillere={begrænsedeSpillere}
        />

        <div style={{ marginBottom: '1rem' }}>
          <button type="button" onClick={tilfoejSaet} style={knapStyle}>➕ Tilføj sæt</button>
          <button type="submit" style={{ ...knapStyle, backgroundColor: '#a2184b' }}>Indsend resultater</button>
        </div>
      </form>

      {message && (
        <p style={{ color: message.startsWith('❌') ? 'red' : '#d81b60', fontWeight: 'bold' }}>{message}</p>
      )}
    </main>
  )
}

const knapStyle = {
  backgroundColor: '#d81b60',
  color: 'white',
  border: 'none',
  padding: '0.8rem 1.4rem',
  borderRadius: '10px',
  fontSize: '1rem',
  cursor: 'pointer',
  marginRight: '1rem'
}


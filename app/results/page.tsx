'use client'

import { useEffect, useState } from 'react'
import Select from 'react-select'
import { supabase } from '../../lib/supabaseClient'

export default function ResultatForm() {
  const [spillere, setSpillere] = useState<{ id: number; navn: string }[]>([])
  const [antalSaet, setAntalSaet] = useState(1)
  const [saetData, setSaetData] = useState<any[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function hentSpillere() {
      const { data, error } = await supabase
        .from('spillere')
        .select('id, navn')
        .order('navn', { ascending: true })

      if (error) {
        console.error('Fejl ved hentning af spillere:', error)
      } else {
        setSpillere(data || [])
      }
    }

    hentSpillere()
  }, [])

  useEffect(() => {
    const nyeSaet = []
    for (let i = 0; i < antalSaet; i++) {
      const tidligere = saetData[0]
      nyeSaet.push({
        dato: new Date().toISOString().split('T')[0],
        spiller1A: tidligere?.spiller1A || null,
        spiller1B: tidligere?.spiller1B || null,
        spiller2A: tidligere?.spiller2A || null,
        spiller2B: tidligere?.spiller2B || null,
        scoreA: 6,
        scoreB: 0,
        faerdigspillet: true,
        tiebreak: 'ingen',
      })
    }
    setSaetData(nyeSaet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antalSaet])

  const spillerOptions = spillere.map((s) => ({ value: s.id, label: s.navn }))

  const opdaterSaet = (index: number, felt: string, value: any) => {
    const nyData = [...saetData]
    nyData[index][felt] = value
    setSaetData(nyData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const resultater = saetData.map((s) => ({
      dato: s.dato,
      spiller1A: spillere.find(sp => sp.id === s.spiller1A?.value)?.navn || '',
      spiller1B: spillere.find(sp => sp.id === s.spiller1B?.value)?.navn || '',
      spiller2A: spillere.find(sp => sp.id === s.spiller2A?.value)?.navn || '',
      spiller2B: spillere.find(sp => sp.id === s.spiller2B?.value)?.navn || '',
      scoreA: parseInt(s.scoreA),
      scoreB: parseInt(s.scoreB),
      faerdigspillet: s.faerdigspillet,
      tiebreak: s.tiebreak,
    }))

    const { error } = await supabase.from('results').insert(resultater)

    if (error) {
      setMessage('❌ Fejl: ' + error.message)
    } else {
      setMessage('✅ Resultater indsendt!')
    }
  }

  return (
    <main style={{ maxWidth: '800px', margin: 'auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Hvor mange sæt vil du indtaste?</h1>
      <select
        value={antalSaet}
        onChange={(e) => setAntalSaet(parseInt(e.target.value))}
        style={{ marginBottom: '2rem', fontSize: '1.5rem', padding: '0.25rem 0.5rem', width: '60px' }}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      <form onSubmit={handleSubmit}>
        {saetData.map((saet, index) => (
          <div
            key={index}
            style={{
              border: '1px solid #ccc',
              padding: '1rem',
              marginBottom: '1rem',
              borderRadius: '6px',
              backgroundColor: '#f9f9f9',
            }}
          >
            <h3 style={{ marginBottom: '1rem' }}>Sæt #{index + 1}</h3>

            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Dato:</label>
            <input
              type="date"
              value={saet.dato}
              onChange={(e) => opdaterSaet(index, 'dato', e.target.value)}
              style={{ marginBottom: '1rem', width: '150px' }}
            />

            {/* Første række: Spiller 1A, Spiller 2A, Score A */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ flex: 1 }}>
                <label>Spiller 1A:</label>
                <Select
                  options={spillerOptions}
                  value={saet.spiller1A}
                  onChange={(v) => opdaterSaet(index, 'spiller1A', v)}
                  styles={{ container: (base) => ({ ...base, marginTop: '0.25rem' }) }}
                />
              </div>

              <div style={{ flex: 1 }}>
                <label>Spiller 2A:</label>
                <Select
                  options={spillerOptions}
                  value={saet.spiller2A}
                  onChange={(v) => opdaterSaet(index, 'spiller2A', v)}
                  styles={{ container: (base) => ({ ...base, marginTop: '0.25rem' }) }}
                />
              </div>

              <div style={{ width: '80px' }}>
                <label>Score A:</label>
                <select
                  value={saet.scoreA}
                  onChange={(e) => opdaterSaet(index, 'scoreA', e.target.value)}
                  style={{ marginTop: '0.25rem', width: '100%' }}
                >
                  {[...Array(saet.tiebreak === 'matchtiebreak' ? 11 : 8).keys()].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Anden række: Spiller 1B, Spiller 2B, Score B */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ flex: 1 }}>
                <label>Spiller 1B:</label>
                <Select
                  options={spillerOptions}
                  value={saet.spiller1B}
                  onChange={(v) => opdaterSaet(index, 'spiller1B', v)}
                  styles={{ container: (base) => ({ ...base, marginTop: '0.25rem' }) }}
                />
              </div>

              <div style={{ flex: 1 }}>
                <label>Spiller 2B:</label>
                <Select
                  options={spillerOptions}
                  value={saet.spiller2B}
                  onChange={(v) => opdaterSaet(index, 'spiller2B', v)}
                  styles={{ container: (base) => ({ ...base, marginTop: '0.25rem' }) }}
                />
              </div>

              <div style={{ width: '80px' }}>
                <label>Score B:</label>
                <select
                  value={saet.scoreB}
                  onChange={(e) => opdaterSaet(index, 'scoreB', e.target.value)}
                  style={{ marginTop: '0.25rem', width: '100%' }}
                >
                  {[...Array(saet.tiebreak === 'matchtiebreak' ? 11 : 8).keys()].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={saet.faerdigspillet}
                onChange={(e) => opdaterSaet(index, 'faerdigspillet', e.target.checked)}
              />{' '}
              Sættet er færdigspillet
            </label>

            <label>
              Tie-break:
              <select
                value={saet.tiebreak}
                onChange={(e) => opdaterSaet(index, 'tiebreak', e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              >
                <option value="ingen">Ingen tie-break</option>
                <option value="tiebreak">Tie-break</option>
                <option value="matchtiebreak">Match tie-break</option>
              </select>
            </label>
          </div>
        ))}

        <button
          type="submit"
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            fontSize: '1.1rem',
            cursor: 'pointer',
          }}
        >
          Indsend resultat(er)
        </button>
      </form>

      <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>{message}</p>
    </main>
  )
}

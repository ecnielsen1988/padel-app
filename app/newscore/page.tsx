'use client'

import { useEffect, useState } from 'react'
import Select from 'react-select'
import { supabase } from '../../lib/supabaseClient'

export default function NewScoreForm() {
  const [spillere, setSpillere] = useState<{ id: string; visningsnavn: string }[]>([])
  const [saetData, setSaetData] = useState<any[]>([nytTomtSaet()])
  const [message, setMessage] = useState('')

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

  const spillerOptions = spillere.map((s) => ({ value: s.id, label: s.visningsnavn }))
  const tilladteScore = [0, 1, 2, 3, 4, 5, 6, 7]
  const faerdigResultater = [
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6],
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 7], [6, 7]
  ]

  function nytTomtSaet() {
    return {
      date: new Date().toISOString().split('T')[0],
      holdA1: null,
      holdA2: null,
      holdB1: null,
      holdB2: null,
      scoreA: 0,
      scoreB: 0,
    }
  }

  const erFaerdigspillet = (a: number, b: number) => {
    return faerdigResultater.some(([x, y]) => x === a && y === b)
  }

  const tilfoejSaet = () => {
    const s1 = saetData[0]
    setSaetData((prev) => [
      ...prev,
      {
        date: new Date().toISOString().split('T')[0],
        holdA1: s1?.holdA1 || null,
        holdA2: s1?.holdA2 || null,
        holdB1: s1?.holdB1 || null,
        holdB2: s1?.holdB2 || null,
        scoreA: 0,
        scoreB: 0,
      },
    ])
  }

  const opdaterSaet = (index: number, felt: string, value: any) => {
    const nyData = [...saetData]
    nyData[index][felt] = value
    setSaetData(nyData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

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

    const resultater = saetData
      .filter((s) => !(s.scoreA === 0 && s.scoreB === 0))
      .map((s) => ({
        date: s.date,
        holdA1: s.holdA1?.label || '',
        holdA2: s.holdA2?.label || '',
        holdB1: s.holdB1?.label || '',
        holdB2: s.holdB2?.label || '',
        scoreA: parseInt(s.scoreA),
        scoreB: parseInt(s.scoreB),
        finish: erFaerdigspillet(parseInt(s.scoreA), parseInt(s.scoreB)),
        tiebreak: 'ingen',
        event: false,
        kampid: nyKampid,
      }))

    const { error } = await supabase.from('newresults').insert(resultater)

    if (error) {
      setMessage('❌ Fejl: ' + error.message)
    } else {
      setMessage(`✅ Resultater indsendt! Kamp ID: ${nyKampid}`)
      setSaetData([nytTomtSaet()])
    }
  }

  return (
    <main
      style={{
        maxWidth: '800px',
        margin: 'auto',
        padding: '2rem',
        color: '#111',
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 0 20px rgba(0,0,0,0.05)',
      }}
    >
      <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: '#e91e63' }}>
        Indtast nye resultater
      </h1>

      <form onSubmit={handleSubmit}>
        {saetData.map((saet, index) => (
          <div
            key={index}
            style={{
              border: '1px solid #e91e63',
              padding: '1rem',
              marginBottom: '1.5rem',
              borderRadius: '10px',
              backgroundColor: '#fafafa',
            }}
          >
            <h3 style={{ marginBottom: '1rem', color: '#e91e63' }}>Sæt #{index + 1}</h3>
            <input
              type="date"
              value={saet.date}
              onChange={(e) => opdaterSaet(index, 'date', e.target.value)}
              style={{
                marginBottom: '1rem',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #ccc',
                backgroundColor: '#fff',
                color: '#111',
              }}
            />

            {[['A', 'holdA1', 'holdA2', 'scoreA'], ['B', 'holdB1', 'holdB2', 'scoreB']].map(
              ([hold, p1, p2, scoreKey]) => (
                <div
                  key={hold}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <label>Hold {hold}1:</label>
                    <Select
                      options={
                        index === 0
                          ? spillerOptions
                          : spillerOptions.filter((opt) =>
                              [
                                saetData[0]?.holdA1?.value,
                                saetData[0]?.holdA2?.value,
                                saetData[0]?.holdB1?.value,
                                saetData[0]?.holdB2?.value,
                              ].includes(opt.value)
                            )
                      }
                      value={spillerOptions.find((opt) => opt.value === saet[p1]?.value) || null}
                      onChange={(v) => opdaterSaet(index, p1, v)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Hold {hold}2:</label>
                    <Select
                      options={
                        index === 0
                          ? spillerOptions
                          : spillerOptions.filter((opt) =>
                              [
                                saetData[0]?.holdA1?.value,
                                saetData[0]?.holdA2?.value,
                                saetData[0]?.holdB1?.value,
                                saetData[0]?.holdB2?.value,
                              ].includes(opt.value)
                            )
                      }
                      value={spillerOptions.find((opt) => opt.value === saet[p2]?.value) || null}
                      onChange={(v) => opdaterSaet(index, p2, v)}
                    />
                  </div>
                  <div>
                    <label>Score {hold}:</label>
                    <select
                      value={saet[scoreKey]}
                      onChange={(e) => opdaterSaet(index, scoreKey, e.target.value)}
                      style={{
                        backgroundColor: '#fff',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        color: '#111',
                      }}
                    >
                      {tilladteScore.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            )}
          </div>
        ))}

        {saetData.length > 0 && (
          <>
            <button
              type="button"
              onClick={tilfoejSaet}
              style={{
                marginRight: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#f06292',
                color: '#fff',
                fontWeight: 'bold',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ➕ Tilføj endnu et sæt
            </button>

            <button
              type="submit"
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#e91e63',
                color: 'white',
                fontWeight: 'bold',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Indsend resultat(er)
            </button>
          </>
        )}
      </form>

      <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>{message}</p>
    </main>
  )
}

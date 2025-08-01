'use client'

import { useEffect, useState } from 'react'
import Select from 'react-select'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Option = {
  value: string
  label: string
}

export default function Page() {
  const [options, setOptions] = useState<Option[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<Option | null>(null) // single select input
  const [chosenPlayers, setChosenPlayers] = useState<Option[]>([]) // valgte spillere i liste
  const [loading, setLoading] = useState(true)

  const router = useRouter()

  useEffect(() => {
    const hentSpillere = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, visningsnavn')
        .order('visningsnavn', { ascending: true })

      if (error) {
        console.error('❌ Fejl ved hentning af spillere:', error)
      } else if (data) {
        const mapped = data.map((s: any) => ({
          value: s.id,
          label: s.visningsnavn,
        }))
        setOptions(mapped)
      }

      setLoading(false)
    }

    hentSpillere()
  }, [])

  // Tilføj spiller til listen hvis den ikke allerede er valgt
  const handleSelect = (val: Option | null) => {
    if (val && !chosenPlayers.some(p => p.value === val.value)) {
      setChosenPlayers([...chosenPlayers, val])
    }
    setSelectedPlayer(null) // nulstil feltet så søgningen tømmes
  }

  // Fjern spiller fra listen
  const removePlayer = (value: string) => {
    setChosenPlayers(chosenPlayers.filter(p => p.value !== value))
  }

  // Naviger til /event når knappen klikkes
  const opretEvent = () => {
    // Her kan du evt. sende valgte spillere videre (fx via query eller global state)
    router.push('/event')
  }

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', display: 'flex', gap: '2rem' }}>
      <div style={{ flex: 1 }}>
        <h2>Vælg spillere</h2>
        {loading ? (
          <p>Indlæser spillere...</p>
        ) : (
          <Select
            options={options}
            value={selectedPlayer}
            onChange={handleSelect}
            placeholder="Søg og vælg spiller..."
            isClearable
          />
        )}

        <button
          onClick={opretEvent}
          disabled={chosenPlayers.length === 0 || chosenPlayers.length % 4 !== 0}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            cursor: chosenPlayers.length % 4 === 0 ? 'pointer' : 'not-allowed',
            backgroundColor: chosenPlayers.length % 4 === 0 ? '#0070f3' : '#999',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
          }}
        >
          Opret event
        </button>
      </div>

      <div style={{ flex: 1 }}>
        <h2>Valgte spillere</h2>
        {chosenPlayers.length === 0 && <p>Ingen spillere valgt endnu.</p>}
        <ul>
          {chosenPlayers.map((spiller) => (
            <li key={spiller.value} style={{ marginBottom: '0.5rem' }}>
              {spiller.label}{' '}
              <button onClick={() => removePlayer(spiller.value)} style={{ marginLeft: '1rem' }}>
                Fjern
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

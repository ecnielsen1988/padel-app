'use client'

import { useEffect, useState } from 'react'
import Select from 'react-select'
import { supabase } from '@/lib/supabaseClient'

type Option = { value: string; label: string }

export default function VælgSpiller() {
  const [options, setOptions] = useState<Option[]>([])
  const [selected, setSelected] = useState<Option | null>(null)

  useEffect(() => {
    const hentSpillere = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, visningsnavn')
        .order('visningsnavn', { ascending: true })

      if (error) {
        console.error('❌ Fejl ved hentning af spillere:', error)
        return
      }

      if (data) {
        const mapped = data.map((s) => ({
          value: s.id,
          label: s.visningsnavn,
        }))
        setOptions(mapped)
      }
    }

    hentSpillere()
  }, [])

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h2>Vælg en spiller</h2>
      <Select
        options={options}
        value={selected}
        onChange={(val) => setSelected(val)}
        placeholder="Søg og vælg spiller..."
        isClearable
      />
      {selected && (
        <p style={{ marginTop: '1rem' }}>
          Du har valgt: <strong>{selected.label}</strong>
        </p>
      )}
    </div>
  )
}

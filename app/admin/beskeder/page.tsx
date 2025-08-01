'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface Besked {
  id: number
  kampid: number
  besked: string
  tidspunkt: string
  visningsnavn: string
  læst: boolean
}

export default function AdminBeskeder() {
  const [beskeder, setBeskeder] = useState<Besked[]>([])
  const [loading, setLoading] = useState(true)
  const [adgangTilladt, setAdgangTilladt] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkAdgangOgHentBeskeder() {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setAdgangTilladt(false)
        return
      }

      const { data: profil, error: profilError } = await supabase
        .from('profiles')
        .select('rolle')
        .eq('id', user.id)
        .single()

      if (profilError || profil?.rolle !== 'admin') {
        setAdgangTilladt(false)
        return
      }

      setAdgangTilladt(true)

      const { data, error } = await supabase
        .from('admin_messages')
        .select('id, kampid, besked, tidspunkt, visningsnavn, læst')
        .order('tidspunkt', { ascending: false })

      if (!error && data) {
        setBeskeder(data as Besked[])
      }

      setLoading(false)
    }

    checkAdgangOgHentBeskeder()
  }, [])

  const markerSomLæst = async (id: number) => {
    const { error } = await supabase
      .from('admin_messages')
      .update({ læst: true })
      .eq('id', id)

    if (!error) {
      setBeskeder(prev =>
        prev.map(msg => msg.id === id ? { ...msg, læst: true } : msg)
      )
    }
  }

  if (adgangTilladt === false) {
    return <p style={{ padding: '2rem', color: 'crimson' }}>⛔️ Du har ikke adgang til denne side.</p>
  }

  return (
    <div style={{ maxWidth: '800px', margin: 'auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>📬 Indkomne beskeder</h1>

      {loading && <p>Indlæser...</p>}
      {!loading && beskeder.length === 0 && <p>Ingen beskeder endnu.</p>}

      {beskeder.map((msg) => (
        <div key={msg.id} style={{
          border: '1px solid #444',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: msg.læst ? '#1a1a1a' : '#ffe4f0',
          color: msg.læst ? '#ccc' : '#000'
        }}>
          <p><strong>Kamp:</strong> #{msg.kampid}</p>
          <p><strong>Fra:</strong> {msg.visningsnavn}</p>
          <p style={{ whiteSpace: 'pre-line' }}>
            <strong>Besked:</strong><br />{msg.besked}
          </p>
          <p style={{ fontSize: '0.9rem', color: msg.læst ? '#888' : '#555' }}>
            ⏱ {new Date(msg.tidspunkt).toLocaleString('da-DK')}
          </p>

          {!msg.læst && (
            <button
              onClick={() => markerSomLæst(msg.id)}
              style={{
                marginTop: '0.5rem',
                backgroundColor: '#2e7d32',
                color: 'white',
                padding: '0.4rem 0.8rem',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ✔️ Marker som læst
            </button>
          )}
        </div>
      ))}
    </div>
  )
}


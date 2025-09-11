'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface Besked {
  id: number
  kampid: number
  besked: string
  tidspunkt: string
  visningsnavn: string
  read: boolean
}

// Kun det vi skal bruge for rollecheck
type ProfileRow = { rolle: 'admin' | 'netværk' | 'spiller' | null }

export default function AdminBeskeder() {
  const [beskeder, setBeskeder] = useState<Besked[]>([])
  const [loading, setLoading] = useState(true)
  const [adgangTilladt, setAdgangTilladt] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkAdgangOgHentBeskeder() {
      setLoading(true)

      // 1) Auth
      const { data: auth, error: userError } = await supabase.auth.getUser()
      const user = auth?.user
      if (userError || !user) {
        setAdgangTilladt(false)
        setLoading(false)
        return
      }

      // 2) Rolle-tjek (admin?)
      const { data: profil, error: profilError } = await supabase
        .from('profiles')
        .select('rolle')
        .eq('id', user.id)
        .maybeSingle<ProfileRow>()

      if (profilError || profil?.rolle !== 'admin') {
        setAdgangTilladt(false)
        setLoading(false)
        return
      }

      setAdgangTilladt(true)

      // 3) Hent beskeder
      const { data, error } = await supabase
        .from('admin_messages')
        .select('id, kampid, besked, tidspunkt, visningsnavn, read')
        .order('tidspunkt', { ascending: false })

      if (error) {
        console.error('❌ Fejl ved hentning af beskeder:', error)
        setBeskeder([])
      } else if (Array.isArray(data)) {
        setBeskeder(data as unknown as Besked[])
      } else {
        console.error('❌ Ugyldigt dataformat for beskeder:', data)
        setBeskeder([])
      }

      setLoading(false)
    }

    checkAdgangOgHentBeskeder()
  }, [])

  // Marker én besked som læst (read = true)
  const markerSomLæst = async (id: number) => {
    try {
      // Lille TS-hack kun her: cast query builder til any, så { read: true } ikke fejler
      const qb = supabase.from('admin_messages') as any
      const { error } = await qb.update({ ['read']: true }).eq('id', id)

      if (error) {
        console.error('Kunne ikke markere som læst:', error)
        return
      }

      setBeskeder(prev =>
        prev.map(msg => (msg.id === id ? { ...msg, read: true } : msg))
      )
    } catch (e) {
      console.error('Uventet fejl ved markering som læst:', e)
    }
  }

  if (adgangTilladt === false) {
    return (
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '1rem' }}>
        <p style={{ color: 'crimson' }}>⛔️ Du har ikke adgang til denne side.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '1rem' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>📬 Indkomne beskeder</h1>

      {loading && <p>Indlæser...</p>}
      {!loading && beskeder.length === 0 && <p>Ingen beskeder endnu.</p>}

      {beskeder.map((msg) => (
        <div
          key={msg.id}
          style={{
            border: '1px solid #444',
            borderRadius: 8,
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: msg.read ? '#1a1a1a' : '#ffe4f0',
            color: msg.read ? '#ccc' : '#000',
          }}
        >
          <p><strong>Kamp:</strong> #{msg.kampid}</p>
          <p><strong>Fra:</strong> {msg.visningsnavn}</p>
          <p style={{ whiteSpace: 'pre-line' }}>
            <strong>Besked:</strong><br />{msg.besked}
          </p>
          <p style={{ fontSize: '0.9rem', color: msg.read ? '#888' : '#555' }}>
            ⏱ {new Date(msg.tidspunkt).toLocaleString('da-DK')}
          </p>

          {!msg.read && (
            <button
              onClick={() => markerSomLæst(msg.id)}
              style={{
                marginTop: '0.5rem',
                backgroundColor: '#2e7d32',
                color: 'white',
                padding: '0.4rem 0.8rem',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
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


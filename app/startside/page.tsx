'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient' // Ret stien efter din mappestruktur

export default function Startside() {
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUserRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setRole(null)
        setLoading(false)
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Fejl ved hentning af profil:', error.message)
        setRole(null)
      } else {
        setRole(profile?.role ?? null)
      }
      setLoading(false)
    }

    fetchUserRole()
  }, [])

  if (loading) {
    return (
      <main style={styles.main}>
        <p>Loader bruger...</p>
      </main>
    )
  }

  if (role !== 'bruger') {
    return (
      <main style={styles.main}>
        <p>Du har ikke adgang til denne side.</p>
      </main>
    )
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>Velkommen, bruger!</h1>

      <nav style={styles.nav}>
        <Link href="/seneste-kampe" style={styles.button}>
          🧠 Seneste kampe (med Elo)
        </Link>
        <Link href="/results" style={styles.button}>
          ✍️ Indtast resultat
        </Link>
        <Link href="/rangliste" style={styles.button}>
          📊 Ranglisten
        </Link>
      </nav>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: '600px',
    margin: '3rem auto',
    padding: '1rem',
    textAlign: 'center',
    backgroundColor: '#222',
    borderRadius: '8px',
    color: 'white',
    boxShadow: '0 0 15px rgba(0,0,0,0.7)',
  },
  heading: {
    marginBottom: '2rem',
    fontSize: '2.5rem',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  button: {
    display: 'block',
    padding: '1rem',
    backgroundColor: '#ff69b4',
    color: 'white',
    borderRadius: '6px',
    textDecoration: 'none',
    fontWeight: 'bold',
    fontSize: '1.25rem',
    transition: 'background-color 0.3s ease',
  },
}

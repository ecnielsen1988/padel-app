'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleRegister = async (e) => {
    e.preventDefault()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage('❌ Fejl: ' + error.message)
    } else {
      setMessage('✅ Bruger oprettet! Tjek din email for bekræftelse.')
    }
  }

  return (
    <main style={{ maxWidth: '400px', margin: 'auto', padding: '2rem' }}>
      <h1>Opret bruger</h1>
      <form onSubmit={handleRegister}>
        <label>Email:</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', marginBottom: '1rem' }}
        />

        <label>Kodeord:</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: '100%', marginBottom: '1rem' }}
        />

        <button type="submit" style={{ width: '100%', padding: '0.5rem' }}>
          Opret bruger
        </button>
      </form>

      <p style={{ marginTop: '1rem' }}>{message}</p>
    </main>
  )
}

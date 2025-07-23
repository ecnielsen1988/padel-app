'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage('❌ Fejl: ' + error.message)
    } else {
      setMessage('✅ Du er nu logget ind!')
      router.push('/startside')  // sender brugeren til startsiden efter login
    }
  }

  return (
    <main style={{ maxWidth: '400px', margin: 'auto', padding: '2rem' }}>
      <h1>Login til padelranglisten</h1>
      <form onSubmit={handleLogin}>
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
          Log ind
        </button>
      </form>

      <p style={{ marginTop: '1rem' }}>{message}</p>

      <p style={{ marginTop: '1rem' }}>
        Har du ikke en bruger? <a href="/register">Opret en her</a>
      </p>
    </main>
  )
}

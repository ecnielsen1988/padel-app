'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Hvor vi lander efter login, hvis ?next ikke er sat
  const fallbackAfterLogin = '/startside';
  const next = searchParams.get('next') || fallbackAfterLogin;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg('❌ ' + error.message);
      setLoading(false);
      return;
    }

    // Valgfrit: vælg fallback-destination baseret på om profil findes (kun hvis ?next mangler)
    let dest = next;
    if (!searchParams.get('next')) {
      const { data: profil } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();
      dest = profil ? '/startside' : '/registrer';
    }

    setMsg('✅ Du er nu logget ind');
    router.refresh();     // synk session til SSR (stopper login-loop)
    router.replace(dest); // send brugeren videre
  }

  async function handleForgotPassword() {
    if (!email) {
      setMsg('❗ Indtast din e-mail først.');
      return;
    }
    setLoading(true);
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://padelhuset-app.netlify.app';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/opdater-adgangskode`,
    });
    setLoading(false);
    setMsg(error ? '❌ ' + error.message : '📧 Vi har sendt et link til nulstilling af adgangskode.');
  }

  return (
    <main style={styles.main}>
      <h1>Log ind</h1>
      <p style={{ opacity: 0.7, marginBottom: '1rem', fontSize: 14 }}>
        {searchParams.get('next') ? `Du bliver sendt til: ${next}` : 'Indtast dine login-oplysninger'}
      </p>

      <form onSubmit={handleLogin} style={{ width: '100%' }}>
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          required
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Adgangskode"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          required
          autoComplete="current-password"
        />
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'Logger ind…' : 'Log ind'}
        </button>
      </form>

      <p style={{ marginTop: '0.75rem' }}>
        <button onClick={handleForgotPassword} disabled={loading} style={styles.linkButton}>
          Glemt adgangskode?
        </button>
      </p>

      {msg && <p style={{ marginTop: '0.75rem' }}>{msg}</p>}

      <p style={{ marginTop: '1rem' }}>
        Har du ikke en bruger?{' '}
        <a href="/signup" style={{ color: '#ff69b4' }}>
          Opret en her
        </a>
      </p>
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: 500,
    margin: '3rem auto',
    padding: '2rem',
    backgroundColor: '#222',
    borderRadius: 8,
    color: 'white',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    padding: '1rem',
    margin: '0.5rem 0',
    borderRadius: 6,
    border: '1px solid #444',
    backgroundColor: '#111',
    color: 'white',
    fontSize: '1rem',
  },
  button: {
    backgroundColor: '#ff69b4',
    color: 'white',
    padding: '1rem',
    borderRadius: 6,
    border: 'none',
    fontWeight: 'bold',
    fontSize: '1.1rem',
    cursor: 'pointer',
    marginTop: '0.5rem',
    width: '100%',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#ff69b4',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
};

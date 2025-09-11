'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Allerede logget ind? -> send til /startside
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) router.replace('/startside');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg('❌ ' + error.message);
      setLoading(false);
      return;
    }

    setMsg('✅ Du er nu logget ind');
    router.refresh();            // vigtigt: få SSR-sider til at se sessionen
    router.replace('/startside'); // altid til /startside (ingen ?next)
  }

  async function handleForgotPassword() {
    if (!email) { setMsg('❗ Indtast din e-mail.'); return; }
    setLoading(true);
    const origin = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://padelhuset-app.netlify.app';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/opdater-adgangskode`,
    });
    setLoading(false);
    setMsg(error ? '❌ ' + error.message : '📧 Tjek din e-mail for nulstillingslink.');
  }

  return (
    <main style={styles.main}>
      <h1>Log ind</h1>
      <form onSubmit={handleLogin} style={{ width: '100%' }}>
        <input type="email" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)}
               style={styles.input} required autoComplete="email" />
        <input type="password" placeholder="Adgangskode" value={password} onChange={e=>setPassword(e.target.value)}
               style={styles.input} required autoComplete="current-password" />
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'Logger ind…' : 'Log ind'}
        </button>
      </form>
      <p style={{ marginTop: 12 }}>
        <button onClick={handleForgotPassword} disabled={loading} style={styles.linkButton}>
          Glemt adgangskode?
        </button>
      </p>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}

const styles: { [k: string]: React.CSSProperties } = {
  main: { maxWidth: 500, margin: '3rem auto', padding: '2rem', background: '#222', borderRadius: 8, color: '#fff', textAlign: 'center' },
  input: { width: '100%', padding: '1rem', margin: '.5rem 0', borderRadius: 6, border: '1px solid #444', background: '#111', color: '#fff' },
  button: { width: '100%', padding: '1rem', marginTop: '.5rem', borderRadius: 6, border: 'none', background: '#ff69b4', color: '#fff', fontWeight: 'bold' },
  linkButton: { background: 'none', border: 'none', color: '#ff69b4', textDecoration: 'underline', cursor: 'pointer' },
};


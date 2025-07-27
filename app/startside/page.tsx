'use client'

import Link from 'next/link'

export default function Startside() {
  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>Velkommen!</h1>

      <nav style={styles.nav}>
        <Link href="/resultater" style={styles.button}>
          🎾 Seneste resultater
        </Link>
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
    backgroundColor: '#ff69b4', // Pink
    color: 'white',
    borderRadius: '6px',
    textDecoration: 'none',
    fontWeight: 'bold',
    fontSize: '1.25rem',
    transition: 'background-color 0.3s ease',
  },
}

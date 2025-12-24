import Image from "next/image"
import Link from "next/link"
import { beregnNyRangliste } from "@/lib/beregnNyRangliste"
import { supabase } from "@/lib/supabaseClient"

type Spiller = {
  visningsnavn: string
  elo: number
}

type ProfileRow = {
  visningsnavn: string
  active: boolean
}

// ✅ Server component
export default async function Home() {
  // 1) Hent rangliste (alle spillere)
  const rangliste: Spiller[] = await beregnNyRangliste()

  // 2) Hent aktive profiler
  const { data: profiles } = await supabase
    .from("profiles")
    .select("visningsnavn, active")

  const activeNameSet = new Set(
    (profiles as ProfileRow[] | null ?? [])
      .filter((p) => p.active === true)
      .map((p) => (p.visningsnavn ?? "").toString().trim())
      .filter(Boolean)
  )

  // 3) Filtrér ranglisten til kun aktive spillere
  const aktiveRangliste = rangliste.filter((spiller) =>
    activeNameSet.has((spiller.visningsnavn ?? "").toString().trim())
  )

  // 4) Top 5 blandt de aktive
  const top5 = aktiveRangliste.slice(0, 5)

  return (
    <main style={styles.main}>
      <div style={styles.logoContainer}>
        <Image
          src="/padelhuset-logo.png"
          alt="Padelhuset Logo"
          width={200}
          height={60}
          priority
        />
      </div>

      <h1 style={styles.title}>Velkommen til PADELHUSETS rangliste</h1>

      <p style={styles.text}>
        Hold styr på dine kampe, følg din udvikling og kæmp om pladserne på
        ranglisten 💪
      </p>

      <ul style={styles.features}>
        <li>🔥 Live rangliste</li>
        <li>🏆 Se dine resultater og Elo-point</li>
        <li>📝 Tilmeld kampe og events</li>
        <li>📊 Følg udviklingen over tid</li>
      </ul>

      <div style={styles.buttonRow}>
        <Link href="/login" style={styles.button}>
          Log ind
        </Link>
        <Link
          href="/signup"
          style={{ ...styles.button, backgroundColor: "#333" }}
        >
          Opret profil
        </Link>
      </div>

      <div style={styles.teaser}>
        <h2 style={styles.teaserTitle}>Top 5 lige nu</h2>
        <ol style={styles.topList}>
          {top5.map((spiller, index) => (
            <li key={spiller.visningsnavn}>
              {index === 0 && "👑 "}
              {index === 1 && "🥈 "}
              {index === 2 && "🥉 "}
              {index > 2 && `${index + 1}. `}
              {spiller.visningsnavn} ({Math.round(spiller.elo)})
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: 600,
    margin: "3rem auto",
    padding: "2rem",
    backgroundColor: "#222",
    borderRadius: 12,
    color: "white",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.5rem",
  },
  logoContainer: {
    marginBottom: "1rem",
  },
  title: {
    fontSize: "2.2rem",
    fontWeight: "bold",
    marginBottom: "0.5rem",
  },
  text: {
    marginBottom: "1rem",
    maxWidth: 500,
  },
  features: {
    textAlign: "left",
    listStyle: "none",
    padding: 0,
    margin: "0 0 1rem",
    lineHeight: 1.6,
  },
  buttonRow: {
    display: "flex",
    gap: "1rem",
    justifyContent: "center",
    marginBottom: "1.5rem",
  },
  button: {
    backgroundColor: "#ff69b4",
    color: "white",
    padding: "0.8rem 1.6rem",
    borderRadius: 6,
    textDecoration: "none",
    fontWeight: "bold",
    fontSize: "1.1rem",
    cursor: "pointer",
    transition: "background-color 0.3s ease",
  },
  teaser: {
    backgroundColor: "#333",
    padding: "1rem",
    borderRadius: 8,
    width: "100%",
    maxWidth: 400,
  },
  teaserTitle: {
    fontSize: "1.4rem",
    marginBottom: "0.5rem",
    fontWeight: "bold",
  },
  topList: {
    textAlign: "left",
    paddingLeft: "1.2rem",
    margin: 0,
    lineHeight: 1.6,
  },
}


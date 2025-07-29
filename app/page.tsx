import Image from "next/image";
import Link from "next/link";

export default function Home() {
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
        Her kan du se ranglisten, tilmelde kampe og meget mere.
      </p>

      <Link href="/login" style={styles.button}>
        Log ind
      </Link>
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: 500,
    margin: "3rem auto",
    padding: "2rem",
    backgroundColor: "#222",
    borderRadius: 8,
    color: "white",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  logoContainer: {
    marginBottom: "2rem",
  },
  title: {
    fontSize: "2.5rem",
    fontWeight: "bold",
    marginBottom: "1rem",
  },
  text: {
    marginBottom: "2rem",
    maxWidth: 400,
  },
  button: {
    backgroundColor: "#ff69b4",
    color: "white",
    padding: "1rem 2rem",
    borderRadius: 6,
    textDecoration: "none",
    fontWeight: "bold",
    fontSize: "1.2rem",
    cursor: "pointer",
    transition: "background-color 0.3s ease",
    display: "inline-block",
  },
};

"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hent session ved load
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Lyt på auth ændringer
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const tjekOmProfilFindes = async () => {
      if (!user?.email_confirmed_at) return;

      const { data: profil, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!profil) {
        router.push("/registrer");
      }
    };

    tjekOmProfilFindes();
  }, [user, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <p>Indlæser...</p>;

  if (!user) {
    return (
      <main style={styles.main}>
        <h1>Du er ikke logget ind</h1>
        <p>
          <a href="/login" style={{ color: "#ff69b4" }}>
            Log ind her
          </a>{" "}
          for at fortsætte.
        </p>
      </main>
    );
  }

  if (!user.email_confirmed_at) {
    return (
      <main style={styles.main}>
        <h1>Bekræft din e-mail</h1>
        <p>
          Du skal bekræfte din e-mail for at fortsætte. Tjek din indbakke og klik på
          linket i bekræftelsesmailen.
        </p>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Log ud
        </button>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <h1>Velkommen til Padel Rangliste</h1>
      <p>Her kan du se ranglisten, tilmelde kampe og meget mere.</p>
      <button onClick={handleLogout} style={styles.logoutButton}>
        Log ud
      </button>
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
    boxShadow: "0 0 15px rgba(0,0,0,0.7)",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    textAlign: "center",
  },
  logoutButton: {
    marginTop: 24,
    backgroundColor: "#ff69b4",
    color: "white",
    padding: "1rem 2rem",
    borderRadius: 6,
    fontWeight: "bold",
    fontSize: "1rem",
    cursor: "pointer",
    border: "none",
    transition: "background-color 0.3s ease",
  },
};
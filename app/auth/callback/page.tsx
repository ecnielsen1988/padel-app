// app/auth/callback/page.tsx
"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Prevent static prerendering + caching for this page
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "default-no-store";

// If you previously set themeColor in metadata here, move it to viewport:
export const viewport = {
  // themeColor: "#000000", // <-- uncomment/set if you actually want it on this page
};

type Status = "loading" | "ok" | "error";

function safeNext(raw: string | null): string {
  const nxt = raw || "/";
  return nxt.startsWith("/") ? nxt : "/";
}

function CallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [msg, setMsg] = useState("Bekræfter din konto…");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const code = searchParams.get("code");
      const next = safeNext(searchParams.get("next"));

      // If we already have a session and no code, just go next
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session && !code) {
        if (!cancelled) {
          setStatus("ok");
          router.replace(next);
        }
        return;
      }

      if (!code) {
        if (!cancelled) {
          setStatus("error");
          setMsg("Mangler verifikationskode i URL’en. Åbn linket fra mailen igen.");
        }
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;

      if (error) {
        console.error("exchangeCodeForSession error:", error);
        setStatus("error");
        setMsg("Kunne ikke bekræfte linket. Prøv igen fra mailen.");
        return;
      }

      setStatus("ok");
      setMsg("Logger ind…");
      router.replace(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  return (
    <main style={{ maxWidth: 600, margin: "4rem auto", textAlign: "center" }}>
      {status === "loading" && <p>{msg}</p>}
      {status === "ok" && <p>{msg}</p>}
      {status === "error" && (
        <>
          <p style={{ marginBottom: "1rem" }}>{msg}</p>
          <p>
            Alternativt kan du{" "}
            <a href="/login?next=/registrer" style={{ color: "#ff69b4", fontWeight: 600 }}>
              logge ind manuelt
            </a>.
          </p>
        </>
      )}
    </main>
  );
}

export default function Page() {
  // Suspense boundary required for useSearchParams in Next 15
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 600, margin: "4rem auto", textAlign: "center" }}>
          <p>Bekræfter din konto…</p>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}


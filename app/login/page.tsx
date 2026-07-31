"use client";

import { useEffect, useState } from "react";
import {
  createClient,
  setRememberMePreference,
} from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) {
        window.location.replace("/dashboard");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    setRememberMePreference(rememberMe);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main style={{ minHeight: "100vh", background: "#020617", color: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 24, padding: 24 }}>
        <p style={{ color: "#94a3b8", marginBottom: 4 }}>Servisní systém</p>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Přihlášení</h1>

        <form onSubmit={handleLogin}>
          <label style={{ display: "block", fontSize: 14, color: "#cbd5e1", marginBottom: 6 }}>
            E-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="technik@firma.cz"
            required
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #334155", background: "#020617", color: "white", marginBottom: 16 }}
          />

          <label style={{ display: "block", fontSize: 14, color: "#cbd5e1", marginBottom: 6 }}>
            Heslo
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #334155", background: "#020617", color: "white", marginBottom: 16 }}
          />

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              marginBottom: 18,
              cursor: loading ? "default" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={rememberMe}
              disabled={loading}
              onChange={(event) => setRememberMe(event.target.checked)}
              style={{
                width: 18,
                height: 18,
                margin: "2px 0 0",
                accentColor: "#2563eb",
                flexShrink: 0,
              }}
            />
            <span>
              <span style={{ display: "block", color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>
                Pamatovat si mě na tomto zařízení
              </span>
              <span style={{ display: "block", color: "#94a3b8", fontSize: 12, marginTop: 2 }}>
                Přihlášení zůstane aktivní i po zavření prohlížeče.
              </span>
            </span>
          </label>

          {message && (
            <div style={{ border: "1px solid #7f1d1d", background: "#450a0a", color: "#fecaca", borderRadius: 12, padding: 12, marginBottom: 16 }}>
              {message}
            </div>
          )}

          <button
            disabled={loading}
            type="submit"
            style={{ width: "100%", padding: 12, borderRadius: 12, border: 0, background: "#2563eb", color: "white", fontWeight: 700, cursor: "pointer" }}
          >
            {loading ? "Přihlašuji..." : "Přihlásit"}
          </button>
        </form>
      </div>
    </main>
  );
}

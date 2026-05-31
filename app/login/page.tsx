"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

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
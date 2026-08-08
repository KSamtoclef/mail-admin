"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to sign in");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next.startsWith("/") ? next : "/";
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit}>
        <div className="brand">Mail <span>Admin</span></div>
        <h1>Admin sign in</h1>
        <p className="subtitle">Enter the private admin password configured on the server.</p>
        <label className="label">Password</label>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {error ? <p className="note" style={{ color: "#fb7185" }}>{error}</p> : null}
        <button className="button buttonPrimary" type="submit" disabled={loading} style={{ width: "100%", marginTop: 12 }}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}

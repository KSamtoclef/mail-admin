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
    } catch {
      setError("Unable to reach the sign-in service");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginShell">
      <aside className="loginAside">
        <div className="loginAsideTitle">
          <h1>Campaign operations, in one place.</h1>
          <p>Manage contacts, campaigns, click attribution and website activity from the private admin workspace.</p>
        </div>
        <div className="loginAsideFoot">Mail Admin · Private workspace</div>
      </aside>

      <section className="loginPane">
        <form className="loginCard" onSubmit={submit}>
          <div className="loginBrand">
            <div className="brandMark">M</div>
            <div>
              <div className="brandName">Mail Admin</div>
              <div className="brandMeta">Private access</div>
            </div>
          </div>

          <h2>Sign in</h2>
          <p>Use the administrator password configured for this deployment.</p>

          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
          />

          {error ? <p className="loginError">{error}</p> : null}

          <button className="button buttonPrimary loginButton" type="submit" disabled={loading || !password}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

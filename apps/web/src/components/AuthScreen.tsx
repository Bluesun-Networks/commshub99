// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { LockKeyhole, Radio } from "lucide-react";
import { useState } from "react";

type AuthMode = "bootstrap" | "login";

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isBootstrap = mode === "bootstrap";

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(isBootstrap ? "/api/auth/bootstrap" : "/api/auth/login", {
        body: JSON.stringify({ email, name, password }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Authentication failed");
      }

      window.location.reload();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <span className="brand-mark">
          <Radio aria-hidden size={18} />
        </span>
        <div>
          <h1 id="auth-heading">{isBootstrap ? "Create Admin" : "Sign In"}</h1>
          <p>
            {isBootstrap
              ? "Set up the first local admin for this commshub99 install."
              : "Use your commshub99 admin account to continue."}
          </p>
        </div>
        <form className="auth-form" onSubmit={submitAuth}>
          {isBootstrap ? (
            <label>
              Name
              <input
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete={isBootstrap ? "new-password" : "current-password"}
              minLength={isBootstrap ? 12 : undefined}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="action-button auth-submit" disabled={submitting} type="submit">
            <LockKeyhole aria-hidden size={17} />
            {submitting ? "Working..." : isBootstrap ? "Create admin" : "Sign in"}
          </button>
        </form>
        {!isBootstrap ? (
          <p className="auth-recovery">
            Forgot the password? On this Mac, run{" "}
            <code>
              bun run --filter @commshub99/cli admin users:reset-password --email you@example.com
            </code>
            .
          </p>
        ) : null}
      </section>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./reception.module.css";

export default function ReceptionLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/reception/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return router.refresh();
    setError(res?.status === 401 ? "Mot de passe incorrect." : "Connexion impossible. Vérifiez le réseau et réessayez.");
  };

  return (
    <main className={styles.loginWrap}>
      <form className={styles.login} onSubmit={submit}>
        <h1 className="serif">Réception</h1>
        <label htmlFor="pw">Mot de passe</label>
        <input
          id="pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error || undefined}
          autoFocus
          required
        />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.primary} disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
      </form>
    </main>
  );
}

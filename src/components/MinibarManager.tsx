"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/time";
import { centsToInput, parseEuros } from "@/lib/money";
import styles from "./reception.module.css";

type Product = { id: string; name: string; nameEn: string | null; price: number; stock: number; active: boolean };
type Draft = { name: string; nameEn: string; price: string; stock: string };

const LOW_STOCK = 2;
const empty: Draft = { name: "", nameEn: "", price: "", stock: "" };

/** Produits du minibar : prix, stock, visibilité côté client. */
export default function MinibarManager() {
  const [list, setList] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>(empty);
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/reception/products", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setError("Impossible de charger le minibar. Vérifiez la connexion.");
    setList(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, 15000); // le stock baisse quand un client commande
    return () => clearInterval(id);
  }, [load]);

  const send = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    if (!res) {
      setError("Connexion impossible. Réessayez.");
      return false;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "L'enregistrement a échoué.");
      return false;
    }
    setError("");
    await load();
    return true;
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseEuros(draft.price);
    if (price === null) return setError("Indiquez un prix, par exemple 3 ou 3,50.");
    const ok = await send("/api/reception/products", "POST", {
      name: draft.name,
      nameEn: draft.nameEn,
      price,
      stock: Number(draft.stock || 0),
    });
    if (ok) setDraft(empty);
  };

  const saveEdit = async (p: Product) => {
    const d = edits[p.id];
    const price = parseEuros(d.price);
    if (price === null) return setError("Indiquez un prix, par exemple 3 ou 3,50.");
    const ok = await send(`/api/reception/products/${p.id}`, "PATCH", { name: d.name, nameEn: d.nameEn, price, stock: Number(d.stock) });
    if (ok) cancelEdit(p.id);
  };

  const cancelEdit = (id: string) =>
    setEdits((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });

  const startEdit = (p: Product) =>
    setEdits((e) => ({ ...e, [p.id]: { name: p.name, nameEn: p.nameEn ?? "", price: centsToInput(p.price), stock: String(p.stock) } }));

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h2 className="serif">Minibar</h2>
          <p>
            Les clients commandent depuis leur téléphone et viennent chercher leur commande à la réception. Le stock
            baisse à chaque commande et remonte si vous l&apos;annulez.
          </p>
        </div>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}

      <form className={styles.addForm} onSubmit={add}>
        <h3>Ajouter un produit</h3>
        <div className={styles.fields}>
          <label htmlFor="p-name">Nom<input id="p-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Eau minérale 50 cl" required /></label>
          <label htmlFor="p-en">Nom en anglais <small>(facultatif)</small><input id="p-en" value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} placeholder="Still water 50 cl" /></label>
          <label htmlFor="p-price">Prix (€)<input id="p-price" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="2,50" required /></label>
          <label htmlFor="p-stock">Stock<input id="p-stock" type="number" min={0} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} placeholder="0" /></label>
        </div>
        <button className={styles.primary}>Ajouter</button>
      </form>

      {!list ? (
        <p className={styles.empty}>Chargement…</p>
      ) : list.length === 0 ? (
        <p className={styles.empty}>Aucun produit pour l&apos;instant. Ajoutez le premier avec le formulaire ci-dessus.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Produit</th>
                <th>Prix</th>
                <th>Stock</th>
                <th>Visible</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const d = edits[p.id];
                return (
                  <tr key={p.id} data-low={p.stock <= LOW_STOCK || undefined} data-hidden={!p.active || undefined}>
                    <td>
                      {d ? (
                        <div className={styles.inlineFields}>
                          <input aria-label="Nom" value={d.name} onChange={(e) => setEdits({ ...edits, [p.id]: { ...d, name: e.target.value } })} />
                          <input aria-label="Nom en anglais" placeholder="Nom en anglais" value={d.nameEn} onChange={(e) => setEdits({ ...edits, [p.id]: { ...d, nameEn: e.target.value } })} />
                        </div>
                      ) : (
                        <>
                          <strong>{p.name}</strong>
                          {p.nameEn && <small className={styles.sub}>{p.nameEn}</small>}
                        </>
                      )}
                    </td>
                    <td className={styles.num}>
                      {d ? (
                        <input aria-label="Prix en euros" inputMode="decimal" className={styles.short} value={d.price} onChange={(e) => setEdits({ ...edits, [p.id]: { ...d, price: e.target.value } })} />
                      ) : (
                        formatPrice(p.price, "fr-FR")
                      )}
                    </td>
                    <td>
                      {d ? (
                        <input aria-label="Stock" type="number" min={0} className={styles.short} value={d.stock} onChange={(e) => setEdits({ ...edits, [p.id]: { ...d, stock: e.target.value } })} />
                      ) : (
                        <div className={styles.stockCell}>
                          <button className={styles.round} aria-label={`Retirer 1 ${p.name}`} disabled={p.stock === 0} onClick={() => send(`/api/reception/products/${p.id}`, "PATCH", { stock: p.stock - 1 })}>−</button>
                          <span className={styles.num}>{p.stock}</span>
                          <button className={styles.round} aria-label={`Ajouter 1 ${p.name}`} onClick={() => send(`/api/reception/products/${p.id}`, "PATCH", { stock: p.stock + 1 })}>+</button>
                          {p.stock <= LOW_STOCK && <span className={styles.lowTag}>{p.stock === 0 ? "Épuisé" : "Stock bas"}</span>}
                        </div>
                      )}
                    </td>
                    <td>
                      <label className={styles.switch}>
                        <input type="checkbox" checked={p.active} onChange={(e) => send(`/api/reception/products/${p.id}`, "PATCH", { active: e.target.checked })} />
                        <span className="sr-only">Visible par les clients</span>
                      </label>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        {d ? (
                          <>
                            <button className={styles.primary} onClick={() => saveEdit(p)}>Enregistrer</button>
                            <button className={styles.ghost} onClick={() => cancelEdit(p.id)}>Annuler</button>
                          </>
                        ) : confirmDel === p.id ? (
                          <>
                            <button className={styles.danger} onClick={() => { setConfirmDel(null); send(`/api/reception/products/${p.id}`, "DELETE"); }}>Supprimer</button>
                            <button className={styles.ghost} onClick={() => setConfirmDel(null)}>Garder</button>
                          </>
                        ) : (
                          <>
                            <button className={styles.ghost} onClick={() => startEdit(p)}>Modifier</button>
                            <button className={styles.ghost} onClick={() => setConfirmDel(p.id)}>Supprimer</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

# Baba Hotel : assistance client par QR code

Chaque chambre a son QR code. En le scannant, le client arrive sur une page dans sa langue :

- **Horaires** : check-in, check-out, petit-déjeuner (avec « inclus dans votre réservation » si la réception l'a coché au check-in, sinon le prix par personne), réception 24h/24.
- **Questions fréquentes** : Wi-Fi (avec bouton copier), petit-déjeuner, départ et départ tardif, réception, bagagerie, transports, quartier, urgences.
- **Demande à la réception** : serviettes, produits d'accueil, ménage, problème dans la chambre, taxi, message libre, ou **départ tardif** (le client choisit l'heure, le supplément s'affiche). Le client suit ensuite l'état de sa demande.
- **Minibar** : le client commande, le stock est réservé, il vient chercher sa commande à la réception.

Côté **réception** : tout se fait dans **Relais** (`https://relais-hotel.adlane-relais.workers.dev`), avec la connexion personnelle de chaque membre de l'équipe. Relais est relié directement à la base D1 de cette application :

- **Chambres** (Relais) : check-in (avec « petit-déj offert ») et check-out. Le check-out remet la chambre « à faire » pour le ménage.
- **Clients** (Relais) : demandes en direct avec signal sonore, minibar et stock, réglages affichés aux clients, planche de QR codes.

L'ancienne adresse `/reception` redirige vers Relais. Les demandes et le minibar ne sont ouverts qu'aux chambres dont le check-in a été fait : un ancien client qui a gardé le lien ne peut plus rien envoyer.

**12 langues** : français, anglais, espagnol, allemand, italien, portugais, néerlandais, arabe (de droite à gauche), chinois, japonais, coréen, russe. La langue du téléphone est détectée automatiquement et le client peut en changer.

## Stack

Next.js 16 (App Router), Drizzle ORM. Hébergement : **Cloudflare Workers** (adaptateur OpenNext) avec la base **Cloudflare D1** (SQLite).

## Les pages

| URL | Pour qui | Contenu |
|---|---|---|
| `/r/<jeton>` | Client (via QR code) | FAQ + formulaire de demande |
| `/reception` | — | Redirige vers Relais |

Le jeton du QR code est aléatoire : impossible de deviner l'adresse d'une autre chambre. Chaque chambre est limitée à 8 demandes par heure pour éviter les abus.

## Données de l'hôtel

Tout se règle depuis Relais (onglet Clients → Réglages clients) : rien à modifier dans le code. Les valeurs de départ sont dans `src/config/hotel.ts` :

- Chambres : 01, 10, 11, 12, 14, 15, 20, 21, 22, 23, 24, 30, 31, 32, 33, 34
- Check-in 14:00, check-out 11:00
- Petit-déjeuner de 07:30 à 11:00, 12 € par personne (offert pour les réservations du site officiel, à cocher au check-in)
- Départ tardif : 10 € par heure, jusqu'à 13:30 maximum. Créneaux proposés toutes les 30 min, au prorata (11:30 = 5 €, 12:00 = 10 €… 13:30 = 25 €)
- Bagagerie à la réception

Le **mot de passe Wi-Fi** et les **produits du minibar** se gèrent dans Relais (onglet Clients).

Les textes des questions fréquentes sont traduits dans `src/i18n/messages/` (un fichier par langue) ; les valeurs (heures, prix, Wi-Fi…) y sont insérées automatiquement.

## Mise en production (Cloudflare)

La base D1 `baba-hotel-clients` existe déjà, avec ses tables (voir `wrangler.jsonc`). Les 16 chambres et leurs jetons de QR code y sont déjà créés (les jetons ne sont jamais écrits dans ce dépôt, qui est public). Relais lit et écrit dans cette même base (binding `CLIENTS`) : toute modification du schéma doit rester compatible avec Relais (`lib/clients.ts` et `scripts/fixtures/clients-schema.sql` dans le dépôt relais-cloudflare).

1. Cloudflare → **Workers & Pages → Create → Import a repository** → choisir `Baba-hotel-clients` (autoriser l'application GitHub de Cloudflare sur ce dépôt si besoin).
2. Réglages du projet :
   - **Project name** : `baba-hotel-clients` (doit être identique au `name` de `wrangler.jsonc`)
   - **Build command** : `npx opennextjs-cloudflare build`
   - **Deploy command** : `npx opennextjs-cloudflare deploy`
3. La réception se fait dans Relais : aucun mot de passe à configurer ici. Le secret `RECEPTION_PASSWORD` de l'ancienne réception peut être supprimé (*Settings → Variables and Secrets*).

Chaque `git push` sur `main` redéploie automatiquement.

> **Plan.** Le plan gratuit de Workers autorise l'usage commercial (100 000 requêtes par jour, largement assez). Il limite chaque requête à 10 ms de calcul : si des pages affichent « Error 1102 », passer au plan Workers Paid (5 $/mois).

> **Nom de domaine.** Pour une adresse du type `aide.baba-hotel.com` : Worker → *Settings → Domains & Routes*. À faire **avant d'imprimer les QR codes** : ils contiennent l'adresse complète.

### Modifier la base

Après une modification de `src/db/schema.ts` :

```bash
npm run db:generate   # crée un fichier SQL dans migrations/
npm run db:migrate    # l'applique à la base de production (wrangler d1 migrations apply)
```

## Développement local

```bash
npm install
cp .dev.vars.example .dev.vars   # mot de passe de la réception en local
npm run db:migrate:local         # base D1 locale
npm run dev                      # http://localhost:3000
npm run preview                  # même chose dans le vrai runtime Workers
```

Commandes utiles : `npm run typecheck`, `npm run lint`.

## Structure

```
src/
  app/
    r/[token]/page.tsx          page client
    reception/layout.tsx        connexion + barre de navigation de la réception
    reception/...               demandes, chambres, minibar, réglages, QR codes
    api/r/[token]/requests      envoi et suivi des demandes (client)
    api/reception/...           connexion, demandes, chambres et séjours, minibar, réglages
  components/                   GuestApp (client), ReceptionShell + pages réception, styles
  config/                       valeurs par défaut de l'hôtel, chambres, types de demandes
  db/                           schéma Drizzle et accès à D1
  i18n/                         traductions (une langue par fichier)
migrations/                     migrations SQL (D1)
wrangler.jsonc                  configuration Cloudflare (Worker + base D1)
```

## Ajouter une langue

Copier `src/i18n/messages/en.ts` vers `xx.ts`, traduire, puis l'ajouter dans `src/i18n/index.ts`. TypeScript signale toute clé manquante.

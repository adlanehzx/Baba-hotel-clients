# Baba Hotel : assistance client par QR code

Chaque chambre a son QR code. En le scannant, le client arrive sur une page dans sa langue :

- **Questions fréquentes** : Wi-Fi (avec bouton copier), petit-déjeuner, départ, réception, transports, quartier, urgences.
- **Demande à la réception** : serviettes, produits d'accueil, ménage, problème dans la chambre, départ tardif, taxi, ou message libre. Le client suit ensuite l'état de sa demande (envoyée → prise en charge → traitée).

À la réception, l'**écran de suivi** (`/reception`) affiche les demandes en direct, avec le numéro de chambre, un signal sonore et un lien « Traduire » pour les messages en langue étrangère.

**12 langues** : français, anglais, espagnol, allemand, italien, portugais, néerlandais, arabe (de droite à gauche), chinois, japonais, coréen, russe. La langue du téléphone est détectée automatiquement et le client peut en changer.

## Stack

Next.js 16 (App Router), PostgreSQL, Drizzle ORM. Déploiement prévu sur Vercel + Neon.

## Les pages

| URL | Pour qui | Contenu |
|---|---|---|
| `/r/<jeton>` | Client (via QR code) | FAQ + formulaire de demande |
| `/reception` | Réception (mot de passe) | Demandes en direct : Nouvelles / En cours / Traitées |
| `/reception/qr` | Réception | Planche de QR codes à imprimer (A4, 9 par page) |

Le jeton du QR code est aléatoire : impossible de deviner l'adresse d'une autre chambre. Chaque chambre est limitée à 8 demandes par heure pour éviter les abus.

## À compléter avant la mise en service

1. **`src/config/hotel.ts`** : nom et mot de passe du Wi-Fi, horaires du petit-déjeuner (marqués `TODO`).
2. **`src/config/rooms.ts`** : les vrais numéros des 16 chambres.
3. Relire les textes de la FAQ dans `src/i18n/messages/fr.ts`. Les autres langues sont dans le même dossier.

## Déployer sur Vercel + Neon

1. **Base de données** : créer un projet gratuit sur [neon.tech](https://neon.tech) et copier l'URL de connexion *pooled*.
2. **Vercel** : *Add New → Project*, importer ce dépôt, puis ajouter les variables d'environnement (voir `.env.example`) :
   - `DATABASE_URL` : l'URL Neon
   - `RECEPTION_PASSWORD` : le mot de passe de l'écran réception
   - `SESSION_SECRET` : 32 caractères aléatoires (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`)
   - `PUBLIC_BASE_URL` : l'adresse du site, par exemple `https://baba-hotel-clients.vercel.app`
3. **Créer les tables et les chambres** depuis ton ordinateur, avec le même `DATABASE_URL` dans un fichier `.env` :
   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```
4. Ouvrir `/reception`, se connecter, cliquer sur **QR codes** et imprimer.

> Si l'adresse du site change, il faut réimprimer les QR codes : ils contiennent l'URL complète.

## Développement local

```bash
cp .env.example .env   # puis remplir DATABASE_URL, etc.
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Commandes utiles : `npm run typecheck`, `npm run lint`, `npm run db:generate` (après modification de `src/db/schema.ts`).

## Structure

```
src/
  app/
    r/[token]/page.tsx          page client
    reception/page.tsx          écran réception (connexion + tableau)
    reception/qr/page.tsx       planche de QR codes
    api/r/[token]/requests      envoi et suivi des demandes (client)
    api/reception/...           connexion, liste, changement de statut
  components/                   GuestApp, ReceptionBoard, styles
  config/                       infos hôtel, chambres, types de demandes
  db/                           schéma Drizzle et connexion
  i18n/                         traductions (une langue par fichier)
drizzle/                        migrations SQL
scripts/seed.ts                 création des chambres et de leurs jetons
```

## Ajouter une langue

Copier `src/i18n/messages/en.ts` vers `xx.ts`, traduire, puis l'ajouter dans `src/i18n/index.ts`. TypeScript signale toute clé manquante.

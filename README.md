# Baba Hotel : assistance client par QR code

Chaque chambre a son QR code. En le scannant, le client arrive sur une page dans sa langue :

- **Horaires** : check-in, check-out, petit-déjeuner (avec « inclus dans votre réservation » si la réception l'a coché au check-in, sinon le prix par personne), réception 24h/24.
- **Questions fréquentes** : Wi-Fi (avec bouton copier), petit-déjeuner, départ et départ tardif, réception, bagagerie, transports, quartier, urgences.
- **Demande à la réception** : serviettes, produits d'accueil, ménage, problème dans la chambre, taxi, message libre, ou **départ tardif** (le client choisit l'heure, le supplément s'affiche). Le client suit ensuite l'état de sa demande.
- **Minibar** : le client commande, le stock est réservé, il vient chercher sa commande à la réception.

Côté **réception** (mot de passe), cinq pages :

| Page | Rôle |
|---|---|
| Demandes | Les demandes en direct (Nouvelles / En cours / Terminées), signal sonore, lien « Traduire ». Départ tardif : Accepter / Refuser. Minibar : Commande prête / Récupérée / Annuler (le stock revient). |
| Chambres | Check-in (avec « petit-déj offert » pour les réservations du site officiel) et check-out. |
| Minibar | Produits, prix, stock (+/−), visibilité côté client. |
| Réglages | Wi-Fi, horaires, prix du petit-déjeuner, départ tardif (tarif horaire et heure max), téléphone, adresse, liste des chambres. |
| QR codes | Planche à imprimer, une étiquette par chambre. |

Le signal sonore et le compteur de nouvelles demandes marchent quelle que soit la page ouverte.

**12 langues** : français, anglais, espagnol, allemand, italien, portugais, néerlandais, arabe (de droite à gauche), chinois, japonais, coréen, russe. La langue du téléphone est détectée automatiquement et le client peut en changer.

## Stack

Next.js 16 (App Router), PostgreSQL, Drizzle ORM. Déploiement prévu sur Vercel + Neon.

## Les pages

| URL | Pour qui | Contenu |
|---|---|---|
| `/r/<jeton>` | Client (via QR code) | FAQ + formulaire de demande |
| `/reception` | Réception (mot de passe) | Demandes en direct |
| `/reception/chambres` | Réception | Check-in / check-out, petit-déjeuner offert |
| `/reception/minibar` | Réception | Produits et stock |
| `/reception/reglages` | Réception | Informations de l'hôtel et chambres |
| `/reception/qr` | Réception | Planche de QR codes à imprimer (A4, 9 par page) |

Le jeton du QR code est aléatoire : impossible de deviner l'adresse d'une autre chambre. Chaque chambre est limitée à 8 demandes par heure pour éviter les abus.

## Données de l'hôtel

Tout se règle depuis la réception (page Réglages) : rien à modifier dans le code. Les valeurs de départ sont dans `src/config/hotel.ts` :

- Chambres : 01, 10, 11, 12, 14, 15, 20, 21, 22, 23, 24, 30, 31, 32, 33, 34
- Check-in 14:00, check-out 11:00
- Petit-déjeuner de 07:30 à 11:00, 12 € par personne (offert pour les réservations du site officiel, à cocher au check-in)
- Départ tardif : 10 € par heure, jusqu'à 13:30 maximum. Créneaux proposés toutes les 30 min, au prorata (11:30 = 5 €, 12:00 = 10 €… 13:30 = 25 €)
- Bagagerie à la réception

À faire après la mise en ligne : renseigner le **mot de passe Wi-Fi** dans Réglages et **ajouter les produits du minibar**.

Les textes des questions fréquentes sont traduits dans `src/i18n/messages/` (un fichier par langue) ; les valeurs (heures, prix, Wi-Fi…) y sont insérées automatiquement.

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
    reception/layout.tsx        connexion + barre de navigation de la réception
    reception/...               demandes, chambres, minibar, réglages, QR codes
    api/r/[token]/requests      envoi et suivi des demandes (client)
    api/reception/...           connexion, demandes, chambres et séjours, minibar, réglages
  components/                   GuestApp (client), ReceptionShell + pages réception, styles
  config/                       valeurs par défaut de l'hôtel, chambres, types de demandes
  db/                           schéma Drizzle et connexion
  i18n/                         traductions (une langue par fichier)
drizzle/                        migrations SQL
scripts/seed.ts                 création des chambres et de leurs jetons
```

## Ajouter une langue

Copier `src/i18n/messages/en.ts` vers `xx.ts`, traduire, puis l'ajouter dans `src/i18n/index.ts`. TypeScript signale toute clé manquante.

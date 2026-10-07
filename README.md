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

Next.js 16 (App Router), Drizzle ORM. Hébergement : **Cloudflare Workers** (adaptateur OpenNext) avec la base **Cloudflare D1** (SQLite).

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

## Mise en production (Cloudflare)

La base D1 `baba-hotel-clients` existe déjà, avec ses tables (voir `wrangler.jsonc`). Les 16 chambres et leurs jetons de QR code sont créés automatiquement à la première connexion de la réception (les jetons ne sont jamais écrits dans ce dépôt, qui est public).

1. Cloudflare → **Workers & Pages → Create → Import a repository** → choisir `Baba-hotel-clients` (autoriser l'application GitHub de Cloudflare sur ce dépôt si besoin).
2. Réglages du projet :
   - **Project name** : `baba-hotel-clients` (doit être identique au `name` de `wrangler.jsonc`)
   - **Build command** : `npx opennextjs-cloudflare build`
   - **Deploy command** : `npx opennextjs-cloudflare deploy`
3. Après le premier déploiement : **Settings → Variables and Secrets → Add** → type *Secret*, nom `RECEPTION_PASSWORD`, valeur : le mot de passe de la réception. Redéployer (*Deployments → Retry*) pour qu'il soit pris en compte.
4. Ouvrir `https://baba-hotel-clients.<compte>.workers.dev/reception`, se connecter : les chambres sont créées. Remplir le Wi-Fi dans **Réglages**, ajouter les produits dans **Minibar**, puis imprimer les **QR codes**.

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

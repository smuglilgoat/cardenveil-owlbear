# Tester en local, dans une vraie room Owlbear

Le cycle « push sur `main` → build Netlify → ouvrir la room » ne sert plus à
rien pendant le développement : Owlbear accepte un manifeste servi par le
serveur Vite local, et le client parle **directement à Supabase**. Netlify
n'intervient que comme repli d'écriture.

## 1. Renseigner les identifiants Supabase

```bash
cp .env.example .env.local
```

Remplir `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Supabase → Project
Settings → API). `.env.local` est ignoré par git.

Sans ce fichier, `npm run dev` affiche un avertissement dans le terminal
« … manquant(s) : Cardenveil affichera une page blanche », et le panneau dans
Owlbear reste entièrement vide (ni spinner ni message) : `createClient()` lève
`supabaseUrl is required` avant même que Svelte monte.

## 2. Lancer le serveur

```bash
npm run dev
```

Vite sert `/manifest.json` en mode développement, sous le nom
**« Cardenveil (Dev) »** — c'est ce qui permet de l'installer à côté de la
version de production. Le CORS est déjà ouvert à `https://www.owlbear.rodeo`
dans `vite.config.js`.

## 3. Installer l'extension locale dans Owlbear

1. Owlbear → menu de profil → **Extensions**.
2. Ajouter une extension personnalisée avec l'URL du manifeste :
   `http://localhost:5173/manifest.json`
3. L'activer dans la room.

`http://localhost` est explicitement supporté par Owlbear et n'est pas bloqué
comme contenu mixte.

## Ce qui passe par Supabase, et ce qui ne passe plus par Netlify

| Chemin | En local |
|---|---|
| Lecture de l'état | REST Supabase, puis Realtime (WebSocket) — direct |
| Écriture (`dispatch`) | Edge Function `action` Supabase — direct |
| Fiches de personnage | table `character_sheets` — direct |
| Repli `/api/state` | 404 en local, journalisé `dispatch_fallback_netlify` |

Le repli ne se déclenche que si l'Edge Function échoue. Il est bénin en local :
l'action a déjà été tentée sur Supabase et l'erreur remonte dans le journal.
Si tu vois ce log à chaque action, c'est que l'Edge Function n'est pas déployée
ou que les identifiants sont faux — ce n'est pas le repli qu'il faut regarder.

## Pièges

- **Le port est épinglé à 5173** (`strictPort`). L'URL du manifeste installée
  dans Owlbear ne bouge pas : si Vite démarrait sur 5174, la room continuerait
  de charger l'ancien serveur. Si 5173 est occupé, Vite refuse de démarrer —
  tuer le serveur fantôme (`pkill -f vite`) plutôt que de changer de port.
- **Les popovers ne rechargent pas avec le panneau.** `hand.html`,
  `sheet.html` et `dice.html` sont des documents séparés : après une
  modification, fermer puis rouvrir le popover. La fiche a un `?v=` qui évite
  le cache, pas la main.
- **Ne pas activer les deux extensions** (« Cardenveil » et
  « Cardenveil (Dev) ») dans la même room : deux panneaux écriraient le même
  état en parallèle.
- **C'est le vrai projet Supabase.** Une room de dev écrit de vraies lignes
  dans `game_rooms` : utiliser une room jetable, jamais une table en cours de
  partie.
- Si Owlbear garde l'ancien numéro de version du manifeste, retirer puis
  réajouter l'extension.

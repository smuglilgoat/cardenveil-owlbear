# Déboguer le plugin dans une vraie room Owlbear

Ouvrir l'URL du plugin seule ne montre rien : les cadres attendent `OBR.onReady`
et restent sur « Chargement… » hors room. Voici les trois façons de regarder
l'intérieur d'une room.

## 1. Snapshot à distance — bouton 🔍 Diag (le plus simple)

- Tableau MJ → bouton **🔍 Diag** (en haut à droite, à côté du sélecteur de dés).
- Il diffuse une demande `cardenveil-diag` ; **chaque écran Cardenveil de la
  room** (panneau principal, éventail de main, fiche compacte, page de fond)
  écrit sa propre ligne `diag_snapshot` dans `app_logs`.
- Lire les résultats (dashboard Supabase → SQL, ou API) :

```sql
select created_at, source, detail
from app_logs
where event = 'diag_snapshot'
order by created_at desc
limit 20;
```

  Un snapshot contient : `viewport`, `dpr`, `visibility`, `bodyScrollHeight`,
  les rectangles des bandes marquées `data-diag` (`root`, `prompts`, `fan`,
  `drawbar`, `tokenbar`), leurs classes CSS, et les bornes des éléments
  interactifs avec `clippedBelow` = nombre de pixels coupés en bas de l'écran.
- ⚠️ `appLog` déduplique : une même ligne ne peut être écrite qu'une fois
  toutes les 30 s par écran. Attendre ~30 s entre deux clics.

## 2. Inspecter le DOM à la main (DevTools)

- F12 dans l'onglet Owlbear → panneau **Elements** → sélecteur de cadre en haut
  (Chrome : menu déroulant « top ») → choisir
  `cardenveil.netlify.app/hand.html…`, `sheet.html…` ou `background.html`.
- Dans la console du cadre :

```js
document.querySelector('[data-diag="fan"]').getBoundingClientRect();
[...document.querySelectorAll('button')].map(el => el.getBoundingClientRect().bottom);
```

## 3. Aperçu hors OBR (mise en page seulement)

- `https://cardenveil.netlify.app/hand.html?cards=15&diag=1` rend un éventail
  factice (7 cartes par défaut, `cards=0..40`) **sans contexte OBR** : pratique
  pour vérifier hauteurs/positions au pixel près dans un navigateur normal.
  `diag=1` imprime le snapshot dans la console (et tente `app_logs`).
- `hand.html?cards=15` est aussi le moyen de reproduire le cas « main de MJ
  15 cartes » sans room.

## 4. Ce qu'il me faut si un souci persiste

Un clic sur 🔍 Diag suffit : je lis `app_logs` directement (les identifiants de
room/player sont déjà dans les lignes). Pas besoin de capture d'écran ni de lien
de room — un lien Owlbear est une SPA derrière connexion, illisible par un outil
externe ; c'est justement pour ça que le snapshot existe.

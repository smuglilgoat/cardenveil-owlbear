# Cardenveil 2.6.1 — notes de version

Correctifs suite aux retours de la 2.6.0.

## ÉDITION

- Les listes de modèles « ＋ Ajouter un objet » / « ＋ Ajouter une arme » sont
  remplacées par **la même fenêtre que dans le SAC** : catalogue complet avec
  icônes, entrée vierge, filtrage automatique (objets seulement / armes
  seulement selon la section). Plus qu'une seule façon d'ajouter du matériel.

## Éventail de main

- **Plus de contenu coupé en bas.** Deux causes : les décalages négatifs qui
  poussaient l'éventail, la barre de pioche et les boutons de token sous le bord
  du popover, et une hauteur demandée trop petite. Mesures du 🔍 Diag en room :
  contenu réel **373 px** (éventail 200 + pioche 57 + tokens/replier 112) pour un
  popover de 300 px chez les joueurs et 320 px chez le MJ → tout ce qui dépassait
  était coupé (`clippedBelow: 67`), le bouton **Replier** en premier.
  Les popovers (joueur **et** MJ) demandent maintenant **380 px** : plus rien
  n'est coupé, le bouton Replier est visible.
- Les invites de token (choix Halfling, sélecteur de carte…) font **grandir le
  popover** de la place manquante puis le rendent à sa taille : l'éventail reste
  au plus juste le reste du temps.

## Khajeet

- Les orthographes **Khajit / Khajiit / Khajet / Goblin** sont reconnues à
  l'import (elles étaient conservées telles quelles, donc la règle raciale ne
  s'appliquait pas).
- Les **Griffes** sont désormais accordées aussi **à l'ouverture de la fiche**
  si la race est Khajeet et qu'elles manquent (fiche importée avant la règle,
  race posée par le MJ, texte libre…). L'écriture est idempotente : une seule
  fois.

## Débogage

- Nouveau bouton **🔍 Diag** dans le tableau MJ : il demande à tous les écrans
  de la room d'enregistrer un instantané (taille, position, pixels coupés,
  classes) dans `app_logs` (`event = 'diag_snapshot'`). Voir
  `docs/debug-live-room.md`.
- `hand.html?cards=15&diag=1` affiche un éventail de démonstration **sans room
  Owlbear**, pour inspecter la mise en page dans un navigateur normal.

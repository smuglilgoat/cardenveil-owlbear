# Cardenveil 2.6.3 — notes de version

Correctifs de l'ajout d'objets introduit en 2.6.2.

- **La quantité choisie est respectée.** L'étape QUANTITÉ fonctionnait à
  l'écran mais la valeur n'était pas transmise à la fiche : tout consommable
  était ajouté en ×1. (La fonction de transfert ne relayait que deux arguments —
  elle relaie maintenant tout ce qu'on lui passe.)
- **Boutons − / ＋ centrés.** Le style global des boutons (`padding: 0.6em 1.2em`)
  poussait les glyphes hors de la case de 28 px. Corrigé.
- Saisir une valeur hors bornes (0, 150, vide) la ramène dans l'intervalle
  1–99 directement dans le champ, et « Ajouter ×N » suit.

## Diagnostic

- `clippedBelow` du 🔍 Diag ignore désormais les éléments d'une zone défilante
  (onglets de fiche, longues listes) : plus de faux positifs sur le panneau
  principal. Les mesures du popover de main restent utiles et confirment le
  correctif 2.6.1 : **864×380 demandé = 864×380 obtenu**, contenu 373 px,
  `clippedBelow` 0 — le bouton Replier et les tokens sont visibles.

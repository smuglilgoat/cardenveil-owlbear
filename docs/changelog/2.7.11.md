# Cardenveil 2.7.11 — notes de version

## Popover de main : taille réellement appliquée

- **Le contenu n'est plus rogné après un déplacement.** Owlbear peut
  redimensionner le *conteneur* du popover alors que **l'iframe garde son
  ancienne taille** (les appels de taille qui arrivent pendant la mise en place
  ou la réouverture du popover sont ignorés) — et c'est l'iframe qui coupe le
  contenu. Les mesures le montraient : conteneur `504x175` annoncé par Owlbear,
  iframe restée à `460x172`, éventail rogné.
  Le cadre vérifie donc maintenant **sa propre taille d'iframe** 200 ms après
  chaque ajustement et réessaie jusqu'à 3 fois ; en cas d'échec persistant, une
  ligne `hand_popover_iframe_mismatch` est écrite dans les journaux.
- Le basculement de position **⬆ / ⬇** attend 200 ms après la fermeture avant de
  rouvrir le popover, pour laisser Owlbear terminer le démontage.
- Deux journaux ajoutés pour suivre la bascule : `hand_anchor_toggle` (au clic)
  et `hand_anchor_reopen` (au moment de la réouverture).

## Tableau MJ

- **Retour visuel sur le bouton 🔍 Diag** : un toast vert « 🔍 Diagnostic
  envoyé ✓ (table app_logs) » s'affiche 3,5 s après le clic.

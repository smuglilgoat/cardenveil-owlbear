# Cardenveil 2.7.12 — notes de version

Le déplacement ⬆ / ⬇ et le dimensionnement du popover de main sont repris à la
racine, parce qu'Owlbear ne coopère pas comme prévu :

- **Un identifiant de popover par position.** Rouvrir *le même* identifiant
  gardait l'ancienne position (d'où « le bouton ne fait rien » côté MJ). Il y a
  maintenant `com.cardenveil/hand` (position basse) et
  `com.cardenveil/hand-high` (position haute), idem côté MJ : changer de
  position crée donc réellement un nouveau popover au bon endroit.
- **La taille est appliquée à l'ouverture.** Owlbear ne propage la taille de
  façon fiable qu'à la création du popover : `setWidth`/`setHeight` peuvent
  redimensionner la boîte alors que **l'iframe** (celle qui coupe le contenu)
  reste à son ancienne taille — c'était le rognage de l'éventail. Le cadre
  mémorise donc sa dernière taille et le prochain `open` la réutilise.
- **Filet de sécurité** : si un redimensionnement n'atteint pas l'iframe
  (vérifié 200 ms après, 3 essais), le cadre demande à son appelant de le
  rouvrir à la bonne taille (`hand_resize_reopen` dans les journaux) : un
  clignotement, puis la bonne taille, au lieu d'un contenu rogné.
- Journaux enrichis : `hand_popover_metrics` indique aussi la taille réelle de
  l'iframe, et `hand_popover_iframe_mismatch` précise « → reopen ».

# Cardenveil 2.7.0 — notes de version

## Éventail de main : refonte complète

Le popover de main est le plus vieil élément du plugin. Il est reconstruit avec
tout ce qu'on a appris depuis sur les popovers Owlbear.

- **Empreinte divisée par ~2,5** : le popover fait maintenant **164 px de haut**
  quand l'éventail est ouvert (380 px avant) et **~40 px replié**. La largeur ne
  dépasse jamais l'écran. C'est la seule chose que Owlbear laisse régler — un
  popover transparent ne peut pas laisser passer les clics (l'API n'expose
  aucune option de ce type), donc moins il est grand, moins il gêne.
- **Une seule barre en bas** : `🃏 Replier / Afficher` puis `🎨` à gauche,
  `Piocher x/y` (avec le badge ✦ Spirit et le rappel ♠ Tieffelin), le bouton
  `🍄` Sporelin et les **4 tokens compacts** (lettre + compteur, couleur du
  token) à droite. Un échange en attente s'affiche en pastille `⏳`.
- **L'éventail fait exactement la hauteur des cartes** : plus de bande vide
  au-dessus, plus de boutons flottants. Les actions d'une carte
  (Défausser / Cristalliser / Bloquer) apparaissent **dans la carte**, et le
  badge de fatigue est rentré dans la carte. Les visuels des cartes sont
  inchangés.
- **Les usages de token passent par des modales** (comme celles de
  l'inventaire) : fond assombri sur les cartes, panneau centré. Idem pour le
  choix Halfling, la pioche Tieffelin, le choix de couleur Agilité, le choix de
  cible Social/Sporelin, l'acceptation d'un échange et les échanges reçus.
  Pendant une sélection de carte, c'est la barre qui affiche la consigne
  (« Agilité — cliquez la carte à défausser »).
- **Le popover gère sa propre taille** : il mesure ses bandes (barre + éventail
  + modale) et se redimensionne. Le panneau principal et le tableau MJ ne
  calculent plus rien (et ne rouvrent plus le popover à chaque changement de
  main).
- **Aperçu hors Owlbear** : `hand.html?cards=15&state=fanned|folded|token|
  halfling|tiefling|suit|target|accept|incoming` montre chaque état dans un
  navigateur normal (voir `docs/debug-live-room.md`).

Le reste est inchangé : aucune règle de jeu, aucune action, aucune migration.

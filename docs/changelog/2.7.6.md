# Cardenveil 2.7.6 — notes de version

## Barre du popover de main

- **Plus de chevauchement avec peu de cartes.** La largeur de la barre n'est
  plus devinée : elle est **mesurée** sur le contenu réel des trois zones
  (gauche / centre / droite). Les colonnes de la grille ne peuvent plus se
  comprimer sous leur contenu (`minmax(min-content, 1fr)`), donc les groupes
  s'écartent ou la barre défile — ils ne se superposent plus jamais. Une main de
  2 cartes donne ~330-360 px de large au lieu de 560, et le bouton 🍄 Sporelin
  ne recouvre plus les tokens.
- **Moins de padding** : boutons `Piocher` et `🃏 Replier/Afficher` resserrés
  (`px-2 py-0.5`), bouton 🎨 en 24 px, barre en `px-1.5 py-1` avec des écarts
  de 4 px — la surface sombre colle maintenant aux boutons.

## Tokens

- **Un seul bouton `🎟`** dans la barre (avec les 4 compteurs colorés) qui ouvre
  la **modale des tokens** : les 4 tokens y sont listés avec leur compteur et
  leurs deux usages `Carte` / `Combat`. Plus d'explication de texte dans la
  modale (les infobulles des boutons gardent le détail des règles).

## Modales

- Les modales ne défilent plus : elles prennent leur hauteur naturelle et
  **le popover grandit** pour les accueillir (limite portée à la hauteur de
  l'écran moins 80 px). Le choix de carte Halfling tient donc entièrement dans
  la modale, sans barre de défilement.

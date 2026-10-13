# Cardenveil 2.7.3 — notes de version

- **Les tokens utilisent la palette des caractéristiques** de la fiche de
  personnage (`STAT_COLORS`) : Force, Agilité, Esprit et Social ont exactement
  la même couleur dans la main du joueur, dans l'éventail et dans le tableau MJ.
  - Force `#f87171` · Agilité `#4ade80` · Esprit `#60a5fa` · **Social `#a78bfa`**
    (il était jaune, c'est le changement le plus visible).
- Les trois copies de la palette (main du joueur, éventail, panneau de tokens
  du MJ) sont supprimées : il ne reste qu'une seule source, dans
  `characterSheet.js`, donc plus de dérive possible.

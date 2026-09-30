# Cardenveil — Notes de version 2.5.0

*Pour le MJ et les joueurs · remplace la version 2.4.0*

---

## ⚔️ Attaques en dés 3D

- Les **attaques utilisent les dés 3D avec physique** : le pool initial est lancé (dés d'avantage/désavantage et d'engagement inclus), et chaque **critique** enchaîne une explosion lancée physiquement à la suite — désavantages dégressifs, doubles de Hache chaînés, tout est lu sur les dés.
- Une **pause de lecture de 3 s** sépare chaque lancer, et un **zoom caméra** vient se poser sur le dé critique pendant son dernier demi-tour.
- Le dé aligne désormais son visage **plus lentement** (topple lisible) — le son de cliquetis refonctionne aussi, même quand le geste de lancer vient d'une autre fenêtre.

## 🪄 Jet de capacité (Valeur brute)

- Nouvel accordéon sur le bouton 🪄, **uniquement des curseurs** comme pour l'attaque : **multiplicateur ×0,5 à ×20**, **4 boutons de caractéristique colorés** (Force/Agilité/Esprit/Social) et un curseur de **mod** qui va du mod de la stat choisie jusqu'à 20.
- Les dés sont **toujours des d6** : le pool vaut **multiplicateur × mod**, additionné tel quel (au-delà de 50 dés, le lancer passe en pré-calculé pour rester fluide).
- L'accordéon et celui de l'attaque se rangent **sous la rangée de boutons ⚔️/🪄/📝**.

## 🎒 Sac et consommables

- **13 modèles de consommables** dans la liste des modèles (Potion de soin, Huile d'imprégnation, Bombe à dégâts, Cristal…), chacun avec son **Effet** et une **Quantité 1**.
- Les consommables du Sac se **consomment directement** : clic sur le jeton → fenêtre de confirmation → **−1 sur la quantité**. À **0**, le jeton devient grisé et non cliquable.
- Les boutons **+ Ajouter une arme / un objet** deviennent des **boutons déroulants** (menu avec une entrée **— Vide —** en plus des modèles), et **ÉDITION s'ouvre directement sur l'onglet consulté**.

## 🪙 Tokens liés à la fiche

- À l'**import d'une fiche**, les tokens de chaque joueur passent à **mod + 1** (ex. mods +2/+3/+4/0 → 3/4/5/1), et le bouton **Repos du MJ** les remet exactement à ces valeurs.
- Le MJ voit dans son tableau les **losanges Action / Bonus / Réaction** de chaque joueur, mis à jour en direct depuis leur fiche.

## 🔧 Corrections

- **Objets = source unique** : les stats des pièces d'équipement vivent sur l'objet (édition + import), les emplacements se resynchronisent à la sauvegarde, et les **armes à 1M/2M** n'évincent plus la main secondaire en s'équipant ou en se rangeant.
- L'icône de chaque objet apparaît dans le **sélecteur d'équipement** du papier-marionnette.
- Les pièces héritées de type « Armure » sont rattachées à « Équipement » à l'import comme à l'édition.

---

*Mise à jour recommandée pour toute la table : rechargez Owlbear Rodeo après installation de la nouvelle version.*

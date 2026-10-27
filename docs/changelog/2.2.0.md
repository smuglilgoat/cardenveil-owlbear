# Cardenveil — Notes de version 2.2.0

*Pour le MJ et les joueurs · remplace la version 2.1.0*

---

## 🎒 Inventaire refait de A à Z

- **Mannequin d'équipement** : les 7 emplacements d'armure (casque, plastron, gantelets, bottes, anneau, amulette, cape) sont disposés en silhouette, plus **2 emplacements d'armes** (main principale / main secondaire)
  - **Survol** d'un emplacement : aperçu rapide (nom + stats clés)
  - **Clic** : fenêtre de détails complète avec bouton **⇄ Changer d'équipement** — la liste des objets possédés de la catégorie s'ouvre, un clic équipe immédiatement (sauvegarde directe, sans passer par ÉDITION) — et **Vider** pour déséquiper
- **Armes à une ou deux mains gérées** : une arme à deux mains occupe les deux mains (marquée « à 2 mains » sur le slot secondaire) ; une arme à une main n'occupe que sa main — le dual wield fonctionne, depuis la fiche comme depuis ÉDITION
- **Le Sac** : les objets non-équipables (potions, parchemins, divers…) s'affichent en **jetons compacts** avec leur icône, leur quantité et leurs notes au survol
- **Icônes d'objets** : chaque objet peut avoir une icône personnalisée (emoji ou image) éditable en ÉDITION
- L'éditeur d'objets affiche désormais **les bons champs selon le type** (plus de dégâts sur une potion) ; `slot` et `famille` sont des menus déroulants, le **résumé de famille** se remplit automatiquement depuis les règles, et la **couleur du catalyseur** est un menu (Cœur ♥ / Pique ♠ / Carreau ♦ / Trèfle ♣)

## ⚔️ Compétences maîtrisées

- Les compétences maîtrisées lancent leur jet avec le **modificateur doublé**, marquées d'un **point indigo** dans la fiche et la vue compacte

## 📝 Notes en direct

- L'onglet NOTES est **éditable librement** sans passer par ÉDITION, avec **un bouton 💾 Sauvegarder** qui enregistre la fiche entière (synchronisation instantanée avec la vue compacte)

## 🖱️ Édition plus rapide

- **Race, Alignement, Couleur, Usage, Incantation et Sauvegarde** sont désormais des menus déroulants (vos valeurs personnalisées importées sont conservées)
- Le champ **emplacement** des objets propose Main principale / Main secondaire pour les armes — équiper un objet l'équipe vraiment
- Les armes ne s'ajoutent que dans la section ARMES ; l'inventaire ne propose plus les modèles d'armes

## 🪞 Vue compacte

- Nouvelle rangée **PARADE · INIT · ARMURE · VITESSE** (initiative et vitesse cliquables pour un jet d20)
- **Synchronisation instantanée** avec la fiche complète : épingler un favori, cocher une action ou sauvegarder les notes apparaît immédiatement dans l'autre fenêtre (corrigé : les losanges d'action de la vue compacte s'appliquent désormais bien à la fiche)
- Fix : le menu déroulant de main de l'ÉDITION ne s'appliquait pas

## ✨ Divers

- **Toutes les tailles de texte de la fiche augmentées de 10 %** pour la lisibilité (hors onglets et boutons du haut)
- Les informations-bulles fonctionnent à nouveau sur les emplacements et le sac (corrigé)
- Fiche d'identité : alignement, race, couleur, usage, incantation, sauvegarde en menus déroulants
- Le coût des capacités est affiché **en grand à droite** des cartes ; les descriptions longues ont un bouton **+** ; les formules de combat s'affichent au survol
- Mouvement recalculé : **5 + Agilité/2 + bottes**

---

*Mise à jour recommandée pour toute la table : rechargez Owlbear Rodeo après installation de la nouvelle version.*

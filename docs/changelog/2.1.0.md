# Cardenveil — Notes de version 2.1.0

*Pour le MJ et les joueurs · remplace la version 0.3.7*

---

## 🆕 La Fiche de Personnage

Une fiche de personnage complète fait son apparition, sauvegardée en ligne (Supabase) et synchronisée en temps réel entre tous les joueurs et le MJ.

- **6 onglets** : COMPÉTENCES, CAPACITÉS, INVENTAIRE, NARRATIF, MAÎTRISES, NOTES
- **Panneau d'en-tête compact** : portrait, PV/temporaires/fatigue, les 4 caractéristiques et toutes les valeurs de combat (parade, initiative, armure, vitesse, seuil miss, bonus d'attaque, canalisation, volonté) visibles en permanence sans manger l'écran — les formules de calcul s'affichent en survolant chaque valeur
- **Mode ÉDITION** : un grand formulaire modale avec ses propres onglets (IDENTITÉ, STATS, puis chaque onglet de la fiche). La fiche affiche les modifications en direct pendant l'édition ; bouton Sauvegarder / Annuler
- **Import** : accepte les fichiers `.json` **et** `.zip` (fiche + images : portrait, totem, illustrations de capacités — hébergées automatiquement). Un spinner affiche la progression de l'import. Les noms de race « libres » (ex. « Haut Elfe ») sont reconnus et convertis automatiquement
- **Descriptions enrichies** : le gras, l'italique, les listes… du HTML importé s'affichent correctement (et en toute sécurité)
- **Bouton « + »** sous les capacités longues : ouvre une fenêtre de lecture avec la description complète, le coût, le type et le jet de dés
- **Coût en grand** : le coût de chaque capacité est affiché en gros à droite de la carte, avec sa couleur

## 🎲 Jets de dés partout

- **Clic = jet** sur : les 4 caractéristiques, l'initiative, la volonté, chaque compétence, chaque formule de capacité, le lanceur libre
- **Fenêtre de dés animée** (popup Owlbear) avec **flash doré** sur un crit naturel et **flash rouge** sur un 1 naturel ; résultat affiché aussi dans la fiche
- **Chaque jet est noté** dans le journal de partie pour toute la table
- **Lanceur libre avec favoris** : tapez une formule (ex. `2d6+3`), cliquez 📌 pour la sauver — elle devient un bouton dans la fiche et dans la vue compacte
- **Roue des actions de combat** : laissez le curseur sur les losanges d'action (ACTION / BONUS / RÉACTION) pour ouvrir le rappel complet des règles, avec les entrées colorées par caractéristique (rouge Force, vert Agilité, bleu Esprit, violet Social)

## ⚔️ Compétences maîtrisées

- Une compétence **maîtrisée** lance son jet avec le **modificateur doublé**
- Les compétences maîtrisées sont marquées d'un **point indigo** dans la fiche et la vue compacte

## 📌 Favoris et vue compacte

- Épinglez (📌) vos compétences et capacités préférées
- **Vue compacte** (bouton COMPACT) : une petite fenêtre toujours disponible avec PV, caractéristiques, parade/initiative/armure/vitesse (initiative et vitesse cliquables), losanges d'action, et **tous vos favoris cliquables** — y compris vos lancers personnalisés
- Cases ACTION / BONUS ACTION / RÉACTION par tour, synchronisées instantanément entre la fiche et la vue compacte (et entre joueurs via le serveur)

## 🎨 Personnalisation

- **Cartes aux couleurs des enseignes** (♥ rouge, ♠ blanc, ♦ or, ♣ vert) appliquées aux cartes et à la main
- **Bouton 🎨** dans la main : basculez entre le jeu de couleurs 4 enseignes et le rouge/noir classique — par joueur
- Nouvelles couleurs de caractéristiques : Force rouge, Agilité verte, **Esprit bleu, Social violet** (corrigées)

## 👑 Côté MJ

- **Bouton « Fiche de personnage »** pour chaque joueur : consultation et édition complète de sa fiche (identité, stats, compétences maîtrisées, capacités, inventaire, notes…), avec synchronisation de la race vers l'état de partie à la sauvegarde
- **Course du joueur** : importer une fiche met à jour la race dans l'état de partie (auto-attribution) ; le MJ peut toujours assigner la race de n'importe qui — les passifs s'activent (+1 main pour Haut-Elfe, etc.)
- **Catalogue d'équipement** : listes déroulantes « Modèle » pré-remplissent armes et pièces d'armure officielles lors de l'ajout
- **Formules de combat automatiques** : parade (déflexion + garde + modificateur), initiative (Agi − 10 + gantelets), mouvement (8 + Agi/2 + bottes), volonté (mod Résilience + casque), seuil miss, canalisation, bonus d'attaque par arme — calculées depuis l'équipement, plus de saisie manuelle
- **Inventaire refait** : cartes aérées, code couleur par type (Arme rouge, Armure bleue, Consommable vert, Équipement ambre, Divers gris)
- **Info-bulles** sur tous les boutons du tableau de bord

## 🔧 Sous le capot

- Toute la logique de jeu vit dans un réducteur unique partagé par le client et les deux serveurs (Supabase Edge Function + Netlify)
- Persistance Supabase + synchronisation temps réel ; les actions sont appliquées de façon optimiste puis confirmées par le serveur
- Import zip : les images sont téléversées dans un bucket dédié et servies par URL (plus de base64 dans les fiches)

---

*Mise à jour recommandée pour toute la table : rechargez Owlbear Rodeo après installation de la nouvelle version.*

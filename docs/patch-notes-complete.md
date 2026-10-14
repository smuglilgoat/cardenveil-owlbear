# Cardenveil — notes complètes (2.6.1 → 2.7.18)

Tout ce qui a changé **depuis la 2.6.0**, regroupé par thème plutôt que par
version (la liste des versions est en bas du document).

---

## 1. Éventail de main — refonte complète

Le plus vieil élément du plugin a été reconstruit.

- **Une seule barre en bas** : `🃏 Replier / Afficher` et `⬆ / ⬇` (position) à
  gauche, `Piocher x/y` au centre (avec le badge `✦` Spirit et le rappel `♠`
  Tieffelin), `🎟` Tokens (les 4 compteurs colorés) à droite ; `🎨` juste après
  `Piocher`. Un échange en attente s'affiche en pastille `⏳`. La barre a
  maintenant un fond sombre ; **les cartes restent transparentes** au-dessus de
  la table.
- **L'éventail fait exactement la hauteur des cartes** : plus de bande vide
  au-dessus ni de boutons flottants. Les actions d'une carte
  (`▶️` défausser, `✦` cristalliser, `◑` bloquer) apparaissent **dans la carte**,
  et le badge de fatigue est rentré dans la carte. Les visuels des cartes sont
  inchangés.
- **Les usages de token passent par des modales** (fond assombri sur les
  cartes) : le bouton `🎟` ouvre **les 4 tokens en une seule fenêtre**, chacun
  avec ses deux usages `Carte` / `Combat`. Idem pour le choix Halfling, la
  pioche Tieffelin, le choix de couleur Agilité, le choix de cible
  Social/Sporelin, l'échange reçu (Accepter / Refuser) et la carte à donner en
  retour. Pendant une sélection de carte, c'est la barre qui affiche la consigne
  (« Agilité — cliquez la carte à défausser »).
- **Empreinte** : ~164 px de haut éventail ouvert (380 avant), ~40 px replié.
  La largeur suit le contenu réel de la barre et ne dépasse jamais l'écran : une
  main de 2-3 cartes ne prend plus une barre large pour rien.
- **Position réglable** : le bouton `⬆ / ⬇` bascule le popover entre deux
  hauteurs ; le réglage est mémorisé par navigateur (joueur et MJ).
- **Couleurs des tokens alignées sur les caractéristiques de la fiche**
  (Force, Agilité, Esprit, Social) — les trois copies de la palette ont été
  supprimées.
- Le popover **gère sa propre taille** (il mesure ses bandes) : le panneau
  principal et le tableau MJ ne calculent plus rien et ne rouvrent plus le
  popover à chaque changement de main.
- Aperçu hors Owlbear pour les curieux : `hand.html?cards=15&state=fanned`
  (états : `folded`, `token`, `halfling`, `tiefling`, `suit`, `target`,
  `accept`, `incoming`).

## 2. Fiche de personnage — inventaire

- **Ajouter un objet ou une arme ouvre un formulaire prérempli** avec les
  valeurs du catalogue : nom, icône, dé, dégâts, bonus, propriétés pour une
  arme ; nom, icône, type, quantité, dégâts, attributs, description pour un
  objet. On modifie, puis « ＋ Ajouter ».
  - « Objet vierge » / « Arme vierge » passent par le même formulaire : c'est ce
    qui corrige les objets vierges **invisibles dans le sac** (ils naissaient
    sans nom et le sac n'affiche que les entrées nommées).
  - ÉDITION utilise exactement la même fenêtre : une seule façon d'ajouter du
    matériel.
- **Quantité des consommables** à l'ajout : 1 à 99 (bornes respectées, y compris
  en saisie directe).
- **SAC cliquable** :
  - consommables : clic = en consommer un (grisé à 0) ;
  - armes et armures/équipements non équipés : clic = **⚔️ Équiper** (main
    principale pour une arme — une arme à deux mains libère la main secondaire —
    ou l'emplacement pour une armure), **🎁 Donner à un allié**, **🗑 Jeter**.
- **Don à un allié** : la liste ne montre que les **joueurs connectés** (+ le
  personnage du MJ s'il existe), chacun avec le **portrait de sa fiche** (repli :
  pastille colorée avec l'initiale). Le transfert est direct dans sa fiche, sans
  proposition ni acceptation.

## 3. Fiche compacte (popover)

- Le panneau d'attaque démarre **sur l'arme en main principale** et la liste
  déroulante affiche bien **l'arme réellement utilisée** (elle pouvait montrer
  l'arme de main secondaire).
- L'accordéon `🪄` : le curseur **MOD descend jusqu'à 0** (valeur par défaut =
  mod de la caractéristique choisie, Esprit par défaut).

## 4. Races

- **Khajeet** : les **griffes** (`🐾 1d6`, Finesse, Légère) ne sont plus un objet
  d'équipement mais une **option d'attaque intégrée** à la fiche compacte —
  disponible en plus des armes équipées, et utilisée par défaut quand aucune
  arme n'est équipée. Les anciennes griffes d'inventaire sont retirées
  automatiquement à l'ouverture de la fiche (une griffe renommée ou modifiée est
  conservée). Les orthographes `Khajit`, `Khajiit`, `Khajet` sont reconnues.
- **Gobelin** (nouvelle race) : seuil de critique **dé − 1** (5+ sur d6, 11+ sur
  d12) mais **maximum 3 critiques** sur une même attaque de base. Le seuil
  s'applique aussi aux explosions ; les dés du popup passent au vert dès le
  seuil atteint et le panneau d'attaque affiche « crit 5+ (max 3 critiques) ».
- **Le sélecteur de race du tableau MJ est retiré** : la race vit dans la fiche
  (ÉDITION → IDENTITÉ, ou import) et s'affiche en lecture seule — plus de
  désynchronisation entre la fiche et la partie.

## 5. Tableau MJ

- **⇩ Importer** une fiche `.json` ou `.zip` **pour un joueur** depuis la fenêtre
  de fiche (même chemin que l'importeur du joueur, avec la race poussée dans
  l'état de jeu et les tokens remis aux mods + 1).
- **Ajouter des objets et des armes** à la fiche d'un joueur (même formulaire
  prérempli que côté joueur).
- **🔍 Diag** : demande à tous les écrans de la room d'enregistrer un instantané
  technique (taille, position, pixels coupés) et affiche un toast de
  confirmation.

## 6. Dés

- Le popup reste **8 secondes** (au lieu de 6).
- Il n'est **plus fermable par un clic à l'extérieur** (les joueurs le fermaient
  avant de voir le résultat) : un bouton **✕** apparaît après 3 s, et la
  fermeture automatique reste en place.
- Taille : **~30 % plus étroit** (364 px), et la **hauteur s'adapte au contenu**
  (nombre de dés, détail du calcul d'attaque) — plus de dés ni de total coupés.

## 7. Technique (pour le MJ / l'administrateur)

- **Journalisation** : les erreurs techniques de tous les écrans partent dans
  Supabase (`app_logs`, purge automatique après 30 jours) — c'est ce qui a permis
  de diagnostiquer chaque bug de cette liste.
- **Correctifs de connexion** (2.6.0, rappel) : Web Worker + surveillance du
  battement Realtime, reconnexion avec attente croissante et rattrapage,
  délais maximum sur tous les appels réseau, bouton « Réessayer » au lieu d'un
  écran figé.
- **Correctifs du popover de main** (2.7.1 → 2.7.13) : taille bornée à la vue de
  la room, un seul redimensionnement à la fois, un identifiant de popover par
  position, taille appliquée à l'ouverture, `anchorReference: "POSITION"`
  explicite et import manquant côté MJ — c'est ce qui a rendu le bouton
  `⬆ / ⬇` réellement fonctionnel.
- **Gate de build** : `svelte-check` tourne avant chaque build et échoue si du
  code référence un nom qui n'existe pas (la classe de bug invisible à Rollup) —
  il a déjà attrapé quatre erreurs pendant ce chantier.
- **À faire après déploiement** : appliquer la migration `app_logs` et
  redéployer la fonction Edge `action` (nouveaux identifiants de race).

---

## Versions

| Version | En bref |
|---|---|
| 2.6.1 | ÉDITION utilise la fenêtre d'ajout du SAC ; hauteur du popover de main mesurée ; orthographes Khajeet ; 🔍 Diag |
| 2.6.2 | Quantité des consommables à l'ajout |
| 2.6.3 | La quantité saisie est respectée ; boutons −/＋ centrés |
| 2.7.0 | Refonte complète de l'éventail de main (barre, hauteur des cartes, modales) |
| 2.7.1 | Bornes de taille sur la vue de la room, redimensionnements sérialisés |
| 2.7.2 | Fond de la barre de boutons |
| 2.7.3 | Couleurs des tokens = couleurs des caractéristiques |
| 2.7.4 | Bouton Piocher centré ; accents d'échange en violet Social |
| 2.7.5 | Largeur du popover adaptée à la main ; tokens compacts `F3` |
| 2.7.6 | Fin des chevauchements de la barre ; padding réduit ; modale des tokens ; modales sans défilement |
| 2.7.7 | Largeur de barre mesurée sur le contenu (fin de la croissance infinie) |
| 2.7.8 | Bouton « 🎨 Couleur » ; ombre de la barre retirée |
| 2.7.9 | Popover remonté de 100 px |
| 2.7.10 | Bouton `⬆ / ⬇` (deux positions) |
| 2.7.11 | Vérification de la taille réelle de l'iframe ; toast du 🔍 Diag |
| 2.7.12 | Un identifiant de popover par position ; taille appliquée à l'ouverture |
| 2.7.13 | `anchorReference: "POSITION"` + import manquant côté MJ → le déplacement fonctionne |
| 2.7.14 | Les deux positions descendent de 20 px |
| 2.7.15 | Encore 20 px plus bas |
| 2.7.16 | Formulaire d'ajout prérempli ; SAC cliquable (équiper/donner/jeter) ; import MJ ; dés 8 s non fermables au clic + ~30 % plus petits ; griffes Khajeet intégrées |
| 2.7.17 | Don d'équipement : joueurs connectés + portrait |
| 2.7.18 | Sélecteur d'arme cohérent ; hauteur du popup de dés adaptée au contenu |

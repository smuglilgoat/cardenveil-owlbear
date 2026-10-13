# Cardenveil 2.6.0 — notes de version

## Stabilité (le gros morceau)

- **Fin des blocages qui obligeaient à recharger la page.** Trois causes
  traitées :
  - la connexion temps réel pouvait mourir **sans aucun message d'erreur**
    quand l'onglet Owlbear passait en arrière-plan (le navigateur ralentit les
    battements de cœur, le serveur coupe le WebSocket, l'application continue
    d'afficher un état figé). Le client Realtime tourne maintenant dans un
    **Web Worker** avec surveillance des battements : Supabase recommande
    exactement ce réglage pour ce problème ;
  - la reconnexion était cassée : le compteur de tentatives se remettait à zéro
    à chaque essai (reconnexions toutes les secondes, sans jamais rattraper les
    événements manqués). L'attente double désormais (1 → 2 → 4 → 8 → 30 s) et un
    **re-synchronisation complète** est faite après chaque reconnexion ;
  - les appels réseau n'avaient **aucun délai maximum** : une fonction lente ou
    endormie laissait l'écran sur « Connexion à Owlbear Rodeo… » indéfiniment.
    Tout appel est maintenant coupé après 8–10 s, avec un bouton **Réessayer**
    au lieu d'un écran mort.
- Revenir sur l'onglet Owlbear (ou retrouver la connexion internet) resynchronise
  automatiquement la partie : plus besoin de recharger.
- Le popup de dés ne se superpose plus en boucle pour les autres joueurs.

## Journalisation (nouveau)

- Les erreurs techniques de toutes les fenêtres (panneau principal, main,
  fiche, dés, dés 3D) sont enregistrées dans Supabase (`app_logs`) avec la
  version du plugin, le salon, le joueur et la pile d'appel : de quoi
  diagnostiquer un incident réel sans deviner.
- Rien d'autre n'est remonté (pas d'actions de jeu, pas de données de fiche),
  les entrées identiques sont groupées et purgées après 30 jours.

## Fiche de personnage

- **Ajouter un objet ou une arme sans passer par ÉDITION** : bouton
  « ＋ Ajouter » en haut de la section SAC → fenêtre avec tout le catalogue
  (icônes + « objet vierge » / « arme vierge »), ajout immédiatement enregistré.
- **Le MJ peut ajouter des objets et des armes à la fiche d'un joueur** :
  la fenêtre « Fiche de personnage » du tableau MJ contient désormais une
  section Inventaire (armes + objets) et le même bouton d'ajout ; l'ajout est
  enregistré tout de suite et apparaît chez le joueur.
- La liste de modèles (ÉDITION) **s'ouvre vers le haut** et affiche une
  **icône par objet** : les armes se distinguent enfin au premier coup d'œil.

## Races

- **Khajeet** : reçoit automatiquement ses **Griffes** (🐾 1d6, Finesse, Légère —
  profil d'épée courte d6) à la sauvegarde/import de la fiche, équipées en main
  principale si les deux mains sont libres. Aussi disponible dans le catalogue
  d'objets pour les autres races. Le sélecteur de race du MJ met désormais la
  fiche à jour, pas seulement la partie.
- **Gobelin** : seuil de critique **dé − 1** (5+ sur d6, 11+ sur d12), mais
  **maximum 3 critiques** sur une même attaque de base — le seuil et le plafond
  s'appliquent aussi aux explosions. Les dés du popup passent au vert dès le
  seuil atteint, et le panneau d'attaque affiche « crit 5+ (max 3 critiques) ».

## Interface

- Popover de main : le bouton **Replier** est passé **sous les boutons de
  token**, et la largeur du popover épouse l'éventail (moins de zone
  transparente qui intercepte les clics sur la table). Rappel : Owlbear ne
  permet pas de rendre un popover traversant par les clics — plus le popover
  est petit, moins il gêne.
- Fenêtre compacte : le curseur **MOD** du 🪄 descend maintenant jusqu'à **0**
  (tout en démarrant sur le mod de la caractéristique choisie, Esprit par
  défaut).

## Déploiement

1. Appliquer `supabase/migrations/20261013_create_app_logs.sql` (table des
   journaux) dans le projet Supabase.
2. **Redéployer la fonction Edge `action`** : les nouveaux identifiants de race
   y sont validés (`RACE_IDS`), sans quoi le choix khajeet/gobelin est annulé
   par le temps réel (même piège que le déploiement oublié en 2.5.0).

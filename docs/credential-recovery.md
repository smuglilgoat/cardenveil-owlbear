# Récupérer une table dont les identifiants sont refusés

> Document interne (non publié). Destiné au propriétaire d'une table — pas aux
> joueurs : eux n'ont qu'un bouton à cliquer.

## Le symptôme

Dans la table, un bandeau apparaît en bas de la fenêtre :

> **Identifiant de joueur non reconnu** — la table refuse vos actions
> (`unauthorized:bad_token`) : votre identifiant n'est plus reconnu, donc les
> jets et les actions ne partent plus.

Dans les journaux du navigateur :

```
POST https://<projet>.supabase.co/functions/v1/action 401 (Unauthorized)
```

Et dans `app_logs` (table `app_logs`, colonne `event`) :

```
dispatch_failed | unauthorized:bad_token      (ou unauthorized:missing_token)
```

Le bandeau contient le SQL à transmettre au propriétaire de la table.

## Pourquoi

Chaque écriture de la table est authentifiée par un **jeton d'acteur** : le
serveur garde dans l'état de la table (`state.actorTokens`) la **empreinte
SHA-256** du jeton, et le client renvoie le jeton lui-même à chaque action.
Tant que l'empreinte correspond, tout va bien.

L'empreinte devient inutilisable dans deux cas :

- le navigateur a perdu le jeton (stockage vidé, profil changé) ;
- une **autre table** a été réinitialisée et a redistribué les empreintes.

Un cas frequent : le MJ teste le plugin depuis **deux navigateurs** (ou deux
profils). Le premier qui écrit réclame l'identité et garde le jeton ; le
second se voit refuser, et inversement. Règle du projet : *le premier
claiming gagne* (`state.actorTokens` conserve jusqu'à 4 empreintes par
identité, mais une nouvelle empreinte ne remplace pas les anciennes — d'où
l'id qui se verrouille).

## Le diagnostic

Dans l'éditeur SQL de Supabase (projet → SQL Editor) :

```sql
select version, state->'actorTokens' as actor_tokens,
       state->'gmId' as gm_id
  from game_rooms
 where room_id = '<roomId>';
```

`actor_tokens` non vide = la table a des empreintes. Une action refusée est
celle d'une identité **qui en a une** : le client ne présente plus le bon
jeton.

## Le remède

Le propriétaire de la table exécute :

```sql
update game_rooms
   set state  = jsonb_set(state, '{actorTokens}', '{}'::jsonb, true),
       version = version + 1
 where room_id = '<roomId>';
```

Ce que cela change, et ce que cela ne change pas :

- **inchangé** : l'état de la partie, les cartes, les personnages, le journal,
  la version ;
- **effacé** : les empreintes des identités — la table redevient « non
  réclamée » ;
- `version + 1` : obligatoire, sinon les clients ignorent la mise à jour
  (leur version en cache est plus grande ou égale).

Ensuite, **chaque client reprend la main à sa première écriture** : le
serveur accepte une identité sans empreinte, lui en émet une nouvelle, et le
client la range dans son `localStorage`. Le joueur n'a plus qu'à **recharger
la page**.

## Les limites connues

- **Un seul navigateur par joueur.** L'identité appartient au premier qui écrit.
  Si deux navigateurs jouent le même personnage, le second est refusé — il
  faut les séparer (un seul onglet de fiche par navigateur), ou remettre à
  zéro les identifiants entre les deux tests.
- **Le HARD_RESET du MJ n'est pas une auto-assistance.** C'est une écriture
  comme une autre : elle est refusée par le garde-fou quand le MJ a lui-même
  perdu son jeton. Le remède ci-dessus est donc la seule voie *depuis
  l'extérieur*.
- **Le jeton ne quitte jamais le navigateur.** Il est dans le
  `localStorage` (`cardenveil-token:<roomId>:<actorId>`) et n'est jamais
  transmis en clair — seul son empreinte circule.

## Le code de récupération (la voie normale)

Le SQL ci-dessus est le remède d'urgence. La voie prévue est un **code de
récupération à usage unique**, émis par le propriétaire et utilisable par le
MJ sans accès à la base.

Le propriétaire émet un code pour une table et une identité :

```bash
node scripts/mint-recovery-code.mjs --room <roomId> [--gm <gmId>] [--minutes 30]
```

Le script lit `RECOVERY_SECRET` (dans `.env.local`, hors git) et l'identifiant
du MJ dans l'état de la table. Il affiche le code, à transmettre au MJ.

Le MJ colle le code dans le tableau de bord (le bandeau « Identifiant non
reconnu »), et le serveur :

1. vérifie la signature du code **avant** le garde-fou d'acteur — le MJ bloqué
   ne peut pas présenter d'identifiant, c'est justement le problème ;
2. supprime les empreintes de l'identité (action `RECOVER_IDENTITY`, réducteur) ;
3. émet un **nouveau** identifiant, que le client range.

Le code est lié à une table et à une identité, expire (30 min par défaut), et
la signature est vérifiée avant toute lecture de sa charge utile. Le secret
(`RECOVERY_SECRET`) doit être le même des deux côtés :

```bash
# Edge Function (Primaire)
npx supabase secrets set RECOVERY_SECRET=<secret> --project-ref <ref>
# Netlify (repli, fonction /api/state)
npx netlify env:set RECOVERY_SECRET <secret> --context production --force --secret
```

Tourner le secret invalide tous les codes déjà émis (c'est le moyen de les
révoquer).

### Pourquoi un code, et pas une action MJ libre

`state.gmId` est public : toute action qui ne demande qu'un identifiant peut
être imitée par quiconque lit l'état de la table — c'est pourquoi
`tests/unit/stateFunction.test.js` vérifie qu'un `HARD_RESET` sans identifiant
est refusé (401). Le code porte un secret que seul le propriétaire possède, et
il ne rend que « rendre son identité à ce MJ », pas les pouvoirs du MJ.

### Limite

Le propriétaire doit être joignable : sans lui (ni son SQL, ni un code), un MJ
bloqué ne peut pas revenir dans sa table. C'est le prix d'un garde-fou qui
n'ouvre pas la table à quiconque lit son identifiant.

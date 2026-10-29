# Signaler un bug

Cardenveil est développé et corrigé au fil des parties. Si quelque chose ne
fonctionne pas comme prévu, **dites-le** : chaque signalement est lu, trié et
corrige.

## Comment signaler

Les signalements se font sur la page des tickets du projet GitHub :

**https://github.com/smuglilgoat/cardenveil-owlbear/issues**

Deux formulaires sont proposés au moment d'ouvrir un nouveau ticket.

| Formulaire | Pour qui | Ce qu'il demande |
|---|---|---|
| **Signaler un bug** | Tout le monde | La version, l'endroit du problème, ce qui s'est passé, comment le reproduire |
| **Signaler un bug (détaillé)** | Meneurs et joueurs habitués de la console | Le formulaire simple, plus le navigateur, les logs et la gravité |

Le formulaire simple suffit dans la grande majorité des cas.

## Ce qu'il faut préparer

Cinq minutes suffisent, et le signalement est d'autant plus utile qu'il est
précis.

1. **La version** — le numéro affiché en bas du panneau, après « Cardenveil ».
   Il se trouve sous le panneau de la partie, dans la barre du bas.
2. **L'endroit** — le panneau principal, la main de cartes, la fiche de
   personnage, le jet de dés, le tableau de bord du meneur.
3. **Ce qui s'est passé** — ce que vous avez fait, et ce que vous avez vu à la
   place. « La carte n'est pas arrivée dans ma main » vaut mieux que « ça ne
   marche pas ».
4. **Comment le reproduire** — les étapes, depuis le début. Trois étapes
   suffisent.
5. **La gravité** — est-ce que la partie s'arrête, est-ce qu'une fonction
   importante est inutilisable, ou est-ce que ça gêne seulement ?

## Avant de signaler

Trois vérifications évitent la moitié des signalements :

* **Rechargez la page.** Un problème de synchronisation disparaît souvent après
  un rechargement de l'onglet.
* **Regardez si d'autres joueurs sont touchés.** Le signalement vaut mieux
  avec le nombre de joueurs concernés, surtout si tout le monde voit la même
  chose.
* **Une seule partie à la fois.** Un bug lié à une règle mal comprise peut
  sembler être un problème technique.

## Ce qui se passe ensuite

* Chaque ticket reçoit une étiquette d'**endroit** (`area:main`,
  `area:fiche`, …) et de **gravité** (`severite:bloquant`, …), ce qui permet de
  trier les tickets.
* Les tickets bloquants et majeurs sont traités en priorité.
* Chaque correction est publiée dans les notes de version, avec le numéro du
  ticket pour que vous puissiez suivre ce qui a été corrigé.

## Vie privée

Le dépôt est **public** : tout ce qui est écrit dans un ticket est visible par
tout le monde.

* N'y mettez **ni nom de joueur, ni nom de personnage, ni aucun autre nom de
  personne** de votre table.
* Ne collez **jamais** d'adresse de salle complète ni de jeton d'identification
  : l'identifiant de la salle suffit.
* Si une capture d'écran contient un nom, floutez-la avant de la joindre.

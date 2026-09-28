# Patch — Clarifications du système de dégâts

Ce patch complète la spécification principale du système de jets de dégâts.

## 1\. Ordre de calcul — Engagement

Les **avantages et désavantages normaux sont d'abord résolus entre eux**.

L'**Engagement intervient ensuite**, en ajoutant ses désavantages au résultat déjà obtenu.

Exemple :fais le moi&#32;

- 3 Avantages + 2 Désavantages
- Après annulation : **1 Avantage**
- 1 Engagement ajoute ensuite **1 Désavantage**
- Résultat final : **jet normal**

L'Engagement ajoute également son modificateur de caractéristique aux dégâts selon les règles déjà définies.

---

## 2\. Finesse + Engagement + Critiques

Pour une arme **Finesse**, le bonus de dégâts fourni par les Engagements est lui aussi **répété à chaque critique**, exactement comme le bonus normal de l'arme.

Ainsi, chaque critique ajoute de nouveau :

- le bonus de dégâts de l'arme ;
- **et chaque bonus de caractéristique provenant des Engagements.**

### Exemple

Arme Finesse :

- Bonus : `+5`
- Agilité : `+3`
- 2 Engagements
- 2 critiques

Les bonus de base sont :

`+5 +3 +3`

Puis ils sont répétés pour chaque critique :

`Dés + (5 + 3 + 3) + (5 + 3 + 3) + (5 + 3 + 3)`

Soit :

`Dés + 33`

Autrement dit, pour une arme Finesse :

**Bonus total = (Bonus arme + Bonus Engagements) × (1 + nombre de critiques)**

---

## 3\. Hache et Finesse incompatibles

Une arme possédant la propriété **Hache / Brutalité ne peut pas être une arme Finesse**.

Les deux mécaniques sont donc mutuellement exclusives.

Il n'existe aucune interaction entre :

- les bonus supplémentaires par critique de Finesse ;
- les critiques par doubles des Haches.

---

## 4\. Premier jet d'une Hache

Le **premier jet d'une Hache fonctionne exactement comme celui d'une arme normale**.

Cela signifie que :

- les Avantages/Désavantages déterminent normalement le nombre de dés lancés ;
- un seul résultat est conservé selon les règles normales ;
- le seuil d'échec fonctionne normalement ;
- le premier critique est déclenché **uniquement lorsque le résultat conservé est égal à la face maximale du dé**.

Les doubles présents dans le pool initial **n'ont aucun effet particulier**.

### Exemple

Hache `d6` avec 1 Avantage :

`3d6 → [6, 6, 2]`

On conserve simplement :

`6`

Cela produit **un seul critique** parce que le résultat conservé est le maximum du `d6`.

Le fait que deux `6` aient été obtenus dans le pool initial ne produit aucun critique supplémentaire.

Ce n'est **qu'après ce premier critique** que la mécanique spéciale de Hache commence :

`2d6 → somme des deux dés`

À partir de ce moment, un **double** déclenche le critique suivant et une nouvelle explosion de `2d6`.
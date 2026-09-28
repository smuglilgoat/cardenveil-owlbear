# Formule des jets de dégâts

## 1. Principe général

Le jet de dégâts dépend de l'arme utilisée.

La règle générale est :

> **Lancer le dé de l'arme, puis ajouter le bonus.**

Il existe deux grands types d'armes, en dehors des familles possédant des règles spéciales :

- les **armes normales** ;
- les **armes Finesse**.

Elles utilisent globalement le même système, mais les armes Finesse interagissent différemment avec les critiques.

---

# 2. Jet de base

Quand le joueur clique sur **Attaque**, le jet est lancé directement.

Pour une arme normale :

```text
Dégâts = résultat du dé + bonus
```

Exemple :

```text
Arme : d12
Bonus : +5

Jet : 8
Dégâts = 8 + 5 = 13
```

Le détail du calcul doit être **affiché clairement dans l'interface**.

---

# 3. Seuil de Miss

Si le résultat du dé est **inférieur ou égal au Seuil de Miss**, l'attaque rate.

Dans ce cas :

- le résultat du dé devient **rouge** ;
- l'attaque inflige **0 dégât**.

```text
Résultat du dé ≤ Seuil de Miss
→ MISS
→ 0 dégât
```

Le Seuil de Miss ne concerne que le **jet initial**.

Lors des relances provoquées par un critique, il n'y a plus de notion de Miss.

---

# 4. Critique et explosion du dé

Si le dé obtient sa **valeur maximale**, il devient **vert** et déclenche un critique.

Exemples :

```text
d6  → critique sur 6
d8  → critique sur 8
d10 → critique sur 10
d12 → critique sur 12
```

Lorsqu'un critique est obtenu, le dé **explose** :

1. on conserve le résultat maximal ;
2. on relance le dé ;
3. on ajoute le nouveau résultat aux dégâts ;
4. si cette relance obtient encore la valeur maximale, le dé explose de nouveau ;
5. ce processus peut continuer **à l'infini**.

Exemple avec un d12 :

```text
12 → CRIT
Relance : 12 → CRIT
Relance : 7

Dés = 12 + 12 + 7
```

Le nombre total de critiques doit être conservé et **affiché clairement**, car les critiques peuvent également déclencher des effets **On Hit**.

---

# 5. Avantages

Chaque **Avantage ajoute 2 dés** au jet.

Les avantages sont cumulables.

```text
0 Avantage  → 1 dé
1 Avantage  → 3 dés
2 Avantages → 5 dés
3 Avantages → 7 dés
4 Avantages → 9 dés
etc.
```

Avec Avantage, on conserve **le résultat le plus élevé**.

Exemple avec un d12 et 2 Avantages :

```text
5d12
→ garder le résultat le plus élevé
```

---

# 6. Désavantages

Les Désavantages utilisent exactement le même principe.

Chaque **Désavantage ajoute 2 dés**, mais on conserve cette fois **le résultat le plus faible**.

```text
0 Désavantage  → 1 dé
1 Désavantage  → 3 dés
2 Désavantages → 5 dés
3 Désavantages → 7 dés
etc.
```

Exemple :

```text
2 Désavantages
→ lancer 5 dés
→ garder le résultat le plus faible
```

---

# 7. Annulation Avantage / Désavantage

Les Avantages et Désavantages s'annulent mutuellement avant de déterminer le nombre de dés.

Exemples :

```text
3 Avantages + 2 Désavantages
= 1 Avantage
= 3 dés, garder le plus élevé
```

```text
2 Avantages + 2 Désavantages
= jet normal
= 1 dé
```

```text
1 Avantage + 3 Désavantages
= 2 Désavantages
= 5 dés, garder le plus faible
```

---

# 8. Critique avec Avantage

Quand une attaque avec Avantage obtient un critique, le dé critique explose.

Cependant, la relance se fait avec **1 niveau d'Avantage en moins**.

Exemple avec **2 Avantages** :

### Jet initial

```text
2 Avantages
→ 5d12
→ garder le maximum
```

Si le dé gardé est un 12 :

```text
CRIT
```

### Première explosion

Il reste 1 Avantage :

```text
3d12
→ garder le maximum
```

Si ce jet fait encore 12 :

```text
CRIT
```

### Deuxième explosion

Il reste 0 Avantage :

```text
1d12
```

À partir de là, les éventuelles explosions suivantes restent toujours à :

```text
1d12
```

Donc :

```text
2 Avantages
5 dés → CRIT
3 dés → CRIT
1 dé  → CRIT
1 dé  → CRIT
1 dé...
```

---

# 9. Critique avec Désavantage

Si une attaque avec Désavantage réussit malgré tout à obtenir un critique, les relances du critique se font ensuite avec **1 seul dé**.

Le Désavantage ne continue donc pas sur les explosions.

Exemple :

```text
1 Désavantage
→ 3d12, garder le plus faible
→ le résultat gardé est 12
→ CRIT
→ relance en 1d12
→ puis 1d12 pour toutes les explosions suivantes
```

---

# 10. Différence entre arme normale et arme Finesse

Les armes normales et les armes Finesse suivent toutes les règles précédentes.

La différence concerne le **bonus ajouté lors des critiques**.

## Arme normale

Le bonus de base est ajouté **une seule fois**, à la fin du calcul.

Exemple :

```text
Arme : d12
Bonus : +5

Jet :
12 → CRIT
12 → CRIT
7

Dégâts :
12 + 12 + 7 + 5
= 36
```

## Arme Finesse

Une arme Finesse ajoute son bonus :

- une fois normalement ;
- puis **une nouvelle fois pour chaque critique obtenu**.

Exemple avec 2 critiques :

```text
Arme : d12 Finesse
Bonus : +5

Jet :
12 → CRIT
12 → CRIT
7

Dégâts :
12 + 12 + 7
+ 5 bonus de base
+ 5 premier critique
+ 5 deuxième critique

= 46
```

On peut donc représenter le calcul comme :

```text
Dégâts Finesse =
Somme des dés
+ Bonus de base
+ (Nombre de critiques × Bonus)
```

Le détail doit être **affiché clairement dans l'interface**.

L'interface doit également afficher explicitement :

```text
Nombre de critiques : X
```

C'est important car les critiques peuvent également déclencher des effets **On Hit**.

---

# 11. Engagement

En plus du nombre d'Avantages et de Désavantages, le joueur peut choisir un **niveau d'Engagement**.

Chaque niveau d'Engagement produit simultanément deux effets :

1. il ajoute **1 Désavantage** au jet ;
2. il ajoute **1 fois le modificateur de caractéristique correspondant** aux dégâts finaux.

La caractéristique dépend de l'arme :

```text
Arme Finesse   → Agilité
Catalyseur     → Esprit
Autre arme     → Force
```

Chaque niveau d'Engagement ajoute séparément le modificateur.

---

# 12. Exemple : Avantages + Engagement

On possède :

```text
Arme : d12
Bonus : +5
Mod Force : +3
Avantages : 2
```

## Sans Engagement

```text
2 Avantages
→ 5d12
→ garder le maximum

Dégâts =
max(5d12) + 5
```

## Avec 1 Engagement

L'Engagement ajoute 1 Désavantage.

On avait :

```text
2 Avantages
```

On obtient :

```text
2 Avantages - 1 Désavantage
= 1 Avantage
```

Donc :

```text
3d12
→ garder le maximum

Dégâts =
max(3d12) + 5 + 3
```

## Avec 2 Engagements

Les 2 Engagements ajoutent 2 Désavantages.

```text
2 Avantages - 2 Désavantages
= jet normal
```

Donc :

```text
1d12 + 5 + 3 + 3
```

ou :

```text
1d12 + 5 + (2 × 3)
```

---

# 13. Exemple : Engagement sans Avantage

On attaque normalement avec :

```text
Arme : d12
Bonus : +5
Mod Force : +3
Engagement : 1
```

L'Engagement ajoute 1 Désavantage.

Donc :

```text
3d12
→ garder le résultat le plus faible
```

Puis :

```text
Dégâts =
min(3d12) + 5 + 3
```

---

# 14. Engagement et armes Finesse

L'Engagement fonctionne de la même manière pour les armes normales et les armes Finesse.

La seule différence est la caractéristique utilisée :

```text
Finesse   → Agilité
Catalyseur → Esprit
Autre      → Force
```

Les armes Finesse ont également la particularité de **ne pas exposer le personnage lors d'un Engagement**, mais cette mécanique n'a pas besoin d'être visible dans cette interface.

---

# 15. Ordre général de résolution

Pour une attaque standard, l'ordre logique est donc :

```text
1. Récupérer :
   - dé de l'arme
   - bonus
   - Seuil de Miss
   - type d'arme
   - nombre d'Avantages
   - nombre de Désavantages
   - niveau d'Engagement
   - mod Force / Agilité / Esprit

2. Ajouter les Désavantages provenant de l'Engagement.

3. Annuler les Avantages et Désavantages entre eux.

4. Déterminer le nombre de dés :
   1 + (2 × niveau restant)

5. Lancer les dés.

6. Si Avantage :
   garder le maximum.

7. Si Désavantage :
   garder le minimum.

8. Si jet normal :
   garder l'unique dé.

9. Vérifier le Seuil de Miss sur le résultat initial.
   Si Miss :
   → 0 dégât.

10. Vérifier le critique.

11. Résoudre toutes les explosions de critique.

12. Compter le nombre total de critiques.

13. Ajouter le bonus.

14. Si arme Finesse :
    ajouter le bonus une fois supplémentaire par critique.

15. Ajouter les bonus provenant des Engagements.

16. Afficher :
    - tous les dés lancés ;
    - les dés gardés ;
    - les critiques ;
    - le nombre de critiques ;
    - les explosions ;
    - les bonus ;
    - les bonus d'Engagement ;
    - l'équation complète ;
    - le résultat final.
```

---

# 16. Cas spécial : Gobelin

Il existe une exception liée à la race **Gobelin**.

Il faut donc prévoir une **race** dans les données du personnage.

Pour un Gobelin :

```text
Nombre maximum de critiques = 3
```

**Ne pas développer cette règle pour l'instant.**

Elle est plus complexe et aucun personnage Gobelin n'existe actuellement.

Il faut simplement garder en tête que cette exception existera plus tard.

---

# 17. Cas spécial : Haches

Les armes de type **Hache** utilisent une mécanique de critique différente.

Le **premier critique** fonctionne normalement : il est déclenché lorsque le jet initial atteint la valeur maximale du dé.

Mais lorsqu'une Hache critique, son explosion fonctionne différemment.

## Explosion d'une Hache

Au lieu de lancer 1 dé :

```text
lancer 2 dés
→ faire la somme des deux
```

Exemple avec une Hache d6 :

```text
Crit initial : 6

Explosion :
2d6
→ résultats : 4 + 3
→ ajouter 7 dégâts
```

Pour continuer la chaîne de critiques, on ne cherche plus la valeur maximale.

On critique si les **deux dés donnent la même valeur**.

Avec un d6 :

```text
1 + 1 → CRIT
2 + 2 → CRIT
3 + 3 → CRIT
4 + 4 → CRIT
5 + 5 → CRIT
6 + 6 → CRIT
```

Autrement dit :

```text
Double = nouveau critique
```

Chaque nouveau critique provoque une nouvelle explosion :

```text
2dX
→ somme des deux dés
→ si double : nouveau CRIT
→ relancer 2dX
→ etc.
```

La chaîne peut continuer à l'infini.

---

# 18. Haches et Avantages

Contrairement aux autres armes, les Haches **ne conservent pas les Avantages de manière régressive lors des explosions**.

Les Avantages/Désavantages servent normalement pour le **jet initial**.

Une fois qu'une Hache a obtenu son premier critique, l'explosion se fait toujours avec :

```text
2 dés normaux
→ faire la somme
```

Exemple avec **3 Avantages** :

### Jet initial

```text
3 Avantages
→ 7 dés
→ garder le maximum
```

Si le résultat gardé est la valeur maximale :

```text
CRIT
```

### Explosion

On ne fait pas :

```text
5 dés
```

On fait directement :

```text
2 dés normaux
→ faire la somme
```

Si les deux dés sont identiques :

```text
nouveau CRIT
→ relancer 2 dés
→ faire la somme
```

Et ainsi de suite.

Donc pour une Hache :

```text
Avantages/Désavantages
        ↓
Jet initial
        ↓
Premier CRIT
        ↓
2dX, somme
        ↓
Double ?
 ├─ Non → fin
 └─ Oui → CRIT → 2dX, somme → Double ? → etc.
```

---

# 19. Résumé des comportements

| Situation | Comportement |
|---|---|
| Jet normal | 1 dé |
| 1 Avantage | 3 dés, garder le maximum |
| 2 Avantages | 5 dés, garder le maximum |
| N Avantages | `1 + 2N` dés, garder le maximum |
| 1 Désavantage | 3 dés, garder le minimum |
| N Désavantages | `1 + 2N` dés, garder le minimum |
| Avantage + Désavantage | S'annulent niveau par niveau |
| Miss initial | 0 dégât |
| Crit normal | Valeur max → explosion |
| Miss pendant explosion | Impossible |
| Crit avec Avantage | Explosion avec 1 Avantage en moins |
| Crit avec Désavantage | Explosion en 1 dé |
| Arme normale | Bonus ajouté une seule fois |
| Arme Finesse | Bonus de base + bonus pour chaque critique |
| 1 Engagement | +1 Désavantage + 1× Mod associé |
| N Engagements | +N Désavantages + N× Mod associé |
| Finesse + Engagement | utilise Agilité |
| Catalyseur + Engagement | utilise Esprit |
| Autre arme + Engagement | utilise Force |
| Gobelin | Maximum 3 critiques, règle à développer plus tard |
| Hache : premier Crit | Valeur maximale normalement |
| Hache : explosion | Lance 2 dés et additionne |
| Hache : Crit suivant | Double sur les 2 dés |
| Hache + Avantage | Avantage uniquement sur le jet initial ; explosion toujours en 2 dés normaux |

---

# 20. Affichage obligatoire du résultat

Le système ne doit pas uniquement afficher le total.

Il doit permettre de comprendre précisément **comment le résultat a été obtenu**.

Exemple d'affichage pour une attaque normale :

```text
Jet : 5d12 [4, 12, 7, 9, 3]
Gardé : 12 → CRIT

Explosion : 3d12 [12, 6, 2]
Gardé : 12 → CRIT

Explosion : 1d12 [7]
Gardé : 7

Critiques : 2

Calcul :
12 + 12 + 7 + 5
= 36 dégâts
```

Pour une arme Finesse avec un bonus de +5 :

```text
Jet : 5d12 [4, 12, 7, 9, 3]
Gardé : 12 → CRIT

Explosion : 3d12 [12, 6, 2]
Gardé : 12 → CRIT

Explosion : 1d12 [7]
Gardé : 7

Critiques : 2

Calcul :
12 + 12 + 7
+ 5 bonus de base
+ 5 critique #1
+ 5 critique #2
= 46 dégâts
```

L'objectif est que le joueur et le développeur puissent toujours reconstruire le résultat exact à partir de ce qui est affiché.



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
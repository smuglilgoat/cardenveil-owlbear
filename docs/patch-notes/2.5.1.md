# Cardenveil — Notes de version 2.5.1

*Pour le MJ et les joueurs · remplace la version 2.5.0*

---

## 🛡️ Vue MJ

- **Losanges Action / Bonus / Réaction par joueur** : le tableau du MJ affiche désormais les trois losanges de chaque joueur (remplis = action utilisée, creux = disponible), mis à jour **en direct** depuis leur fiche.

## 🔧 Corrections

- **Synchronisation des fiches en temps réel réparée** : le filtre d'abonnement Supabase Realtime des fiches utilisait une syntaxe invalide (`&` au lieu de `,`), si bien qu'**aucun événement de fiche n'était jamais poussé entre clients** — c'est corrigé ; la vue complète, la vue compacte et le tableau du MJ se mettent à nouveau à jour entre joueurs.
- **Zoom critique** : le zoom caméra ne se déclenchait pas sur les dés atterrissant **à plat sur leur face maximale** (seuls les dés bancs le déclenchaient) — c'est corrigé, tout critique zoome. Il est désormais **réservé aux jets d'attaque (⚔️), de caractéristiques et de compétences** ; les autres jets (capacités 🪄, dés rapides, jets personnalisés, initiative…) restent larges.
- **Modèles d'objets** : la fenêtre déroulante des modèles assombrit la page (**fond semi-transparent**) au lieu de la masquer complètement.

---

*Rechargez Owlbear Rodeo après installation de la nouvelle version.*

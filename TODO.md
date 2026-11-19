# ORBITAL OUTPOST — suivi de livraison

## Interface coopérative connectée

- Ajouter une entrée Coop au menu principal.
- Permettre la saisie d’un nom et d’un code de salle.
- Charger `public/multiplayer/bootstrap.json` et refuser toute connexion si le build ou l’URL WSS est incompatible.
- Afficher les états de connexion, le nombre de joueurs, les arrivées et les départs.
- Quitter proprement la salle et ne jamais simuler une partie en cas d’indisponibilité du serveur.

## Validation et versions

- Vérifier TypeScript, tests et build Vite.
- Laisser l’utilisateur tester la version depuis le Preview du projet.
- Pousser chaque mise à jour validée sur le dépôt GitHub privé.
- Ne lancer la compilation APK qu’après un signal explicite de l’utilisateur.

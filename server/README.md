# ORBITAL OUTPOST — serveur multijoueur

Le serveur est un Cloudflare Worker nommé `orbitaloutpost-mp` avec un Durable Object `OrbitalRoom` par salle. Les WebSockets utilisent l’API Hibernation de Durable Objects afin de conserver les connexions pendant les périodes d’inactivité.

- Santé : `https://orbitaloutpost-mp.bossyfaycal5.workers.dev/health`
- WebSocket : `wss://orbitaloutpost-mp.bossyfaycal5.workers.dev/ws?room=<code>`
- Protocole : `orbitaloutpost-mp-v1`
- Capacité actuelle : 4 joueurs par salle

Le serveur valide la taille et la forme des paquets, attribue les identifiants de joueur, relaie les poses et actions, et annonce les arrivées/déconnexions. Les règles tactiques partagées, les tours, les objectifs et les résultats devront être ajoutés avant une version compétitive ou classée.

# Procédure de reprise de Tam-Tam (perte du serveur)

Objectif : remettre Tam-Tam en service sur un **nouveau serveur** en une heure environ, à partir des
sauvegardes. Choix en vigueur (nov. 2026) : un seul serveur LWS pour Tam-Tam, le CRM et Genius Recrutement ;
pas de serveur de secours permanent.

## Où sont les sauvegardes

| Quoi | Où | Fréquence | Conservation |
|---|---|---|---|
| Base de données (comptes, discussions chiffrées, réglages) | serveur : volume `tam-tam-data`, dossier `backups/` | chaque jour | 14 jours |
| Base de données, copie chiffrée (`tamtam-AAAA-MM-JJ.ttbk`) | Google Drive : `Mon Drive/Tam-Tam/Sauvegardes` (sinon Bureau `Sauvegardes Tam-Tam`) | chaque nuit, 3 h (Paris) | 7 copies |
| Photos et vidéos, paquets chiffrés (`medias/medias-*.ttbk`) | même dossier, sous-dossier `medias` | chaque nuit (nouveautés) | tout est gardé |
| Clé privée qui ouvre les copies | Bureau `Clé de sauvegarde Tam-Tam` + clé USB du porteur | — | ne jamais la mettre dans Drive ni l'envoyer |
| Code | GitHub `consultingalveris-hash/tam-tam` (branche `main`) + zip daté sur le Bureau (`TAM TAM/Code source`) | à chaque mise en ligne | — |

Les secrets du serveur (`/root/.tam-tam-turn`, `/root/.tam-tam-livekit`, `/root/.tam-tam-backup-key`) sont recréés
par l'installateur, sauf `/root/.tam-tam-backup-key`, qui protège une seconde fois les sauvegardes de clés des membres :
il voyage dans chaque copie chiffrée de la base (table `settings`, ligne `backup_key_copy`) et doit être remis en place
AVANT de lancer l'installateur sur le nouveau serveur (étape 3 bis).

## Étapes

1. **Nouveau serveur** : commander un VPS (LWS « VPS S », image Debian + Docker). Noter sa nouvelle adresse IP.
2. **Code** : sur le serveur, `git clone https://github.com/consultingalveris-hash/tam-tam ~/tam-tam`.
3. **CRM et Caddy** : l'installateur de Tam-Tam s'appuie sur le Caddy du CRM. Réinstaller d'abord le CRM
   (son propre dépôt), puis `cd ~/tam-tam && bash installer`.
3 bis. **Clé des sauvegardes de clés** : après avoir ouvert la base (étape 4), lire la valeur et la remettre :
   `sqlite3 tamtam.db "SELECT v FROM settings WHERE k='backup_key_copy'" > /root/.tam-tam-backup-key && chmod 600 /root/.tam-tam-backup-key`,
   puis relancer `bash installer`.
4. **Ouvrir les copies (sur l'ordinateur du porteur ou sur le serveur, la clé privée n'y reste que le temps de l'opération)** :
   - base : `node outils/ouvrir-sauvegarde.mjs tamtam-AAAA-MM-JJ.ttbk cle-privee-tamtam.pem tamtam.db`
   - médias : pour chaque paquet, `node outils/ouvrir-sauvegarde.mjs medias-XXX.ttbk cle-privee-tamtam.pem medias/`
5. **Remettre les données dans le volume** :
   ```bash
   docker stop tam-tam-app
   V=$(docker volume inspect -f '{{.Mountpoint}}' tam-tam-data)
   cp tamtam.db "$V/tamtam.db" && rm -f "$V/tamtam.db-wal" "$V/tamtam.db-shm"
   mkdir -p "$V/media" && cp medias/* "$V/media/"
   chown -R 1000:1000 "$V"
   docker start tam-tam-app
   ```
6. **Adresses** : dans Cloudflare (alveris-consulting.com) et chez Netim (tam-tam.africa), remplacer l'ancienne IP
   par la nouvelle. Relancer `bash installer` une fois tam-tam.africa propagé (branchement de l'adresse de secours).
7. **Vérifier** : la page affiche la bonne version ; connexion d'un compte de test ; un message part et arrive ;
   UptimeRobot repasse au vert ; la sauvegarde de la nuit suivante réussit (journal.txt).

## À faire pour réduire le temps de reprise

- Le jour de l'ouverture au public : passer à un serveur dédié à Tam-Tam (option B, environ 10 €/mois).

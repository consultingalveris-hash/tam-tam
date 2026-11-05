# tam-tam — version 1 (test entre proches)

En ligne sur https://tam-tam.alveris-consulting.com, sur le VPS LWS qui héberge aussi le CRM et Genius Recrutement.

- Inscription sur invitation : le premier compte est celui du propriétaire (adresse fixée dans l'installeur), puis chaque membre crée des liens d'invitation.
- Contacts : demande d'ami à accepter ; une personne invitée devient directement contact de celle qui l'a invitée.
- Discussions à deux et en groupe en temps réel (Server-Sent Events), photos, réponses, suppression pour tous, accusés de lecture, « écrit… ».
- Statuts publics ou privés (groupe privé), 24 h, avec le nombre de vues.
- Profil public et profil privé (moi uniquement, contacts ou groupe privé), blocage, signalement, suppression du compte.
- Chiffrement de bout en bout des messages et des photos (ECDH P-256 + AES-GCM dans le navigateur) : le serveur ne garde que des enveloppes illisibles et la clé publique de chaque membre. La clé privée est sauvegardée chiffrée par un code d'au moins 6 chiffres choisi par le membre (PBKDF2, 600 000 itérations). Codes de sécurité à comparer entre proches. Les statuts ne sont pas chiffrés de bout en bout.
- Verrouillage sur l'appareil par schéma, avec empreinte ou visage en option (WebAuthn). La session reste ouverte un an.
- Mot de passe oublié : code à 6 chiffres par e-mail (réglage SMTP par le propriétaire dans Réglages).
- Administration (propriétaire) : membres, signalements, liens de réinitialisation du mot de passe, réglage des e-mails.
- `/demo/` : la maquette d'origine (données dans le navigateur). `/conditions` : CGU et confidentialité (projet).

Application Node 22 sans dépendance (`app/`), base SQLite et photos dans le volume Docker `tam-tam-data` (sauvegarde quotidienne de la base dans `/data/backups`, 14 jours conservés).

## Installer ou mettre à jour sur le VPS

```sh
cd ~ && [ -d tam-tam ] || git clone https://github.com/consultingalveris-hash/tam-tam.git
cd ~/tam-tam && git pull && bash installer
```

Le script construit l'application, la lance à côté du CRM et ajoute le bloc du sous-domaine dans le Caddyfile du CRM (sauvegarde, validation et retour arrière automatique). Le CRM n'est pas redémarré.

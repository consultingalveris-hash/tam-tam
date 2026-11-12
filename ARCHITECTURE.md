# Organisation du code de Tam-Tam

Version 2.00 (novembre 2026). Pas de framework ni d'étape de construction : le serveur est du Node.js 22 (modules ES),
l'interface est du JavaScript de navigateur servi tel quel.

## Serveur (`app/`)

| Fichier | Rôle |
|---|---|
| `index.mjs` | point d'entrée : charge les modules de `srv/` dans l'ordre, trie les routes, démarre le serveur HTTP |
| `srv/core.mjs` | configuration (variables d'environnement), base SQLite et schéma, outils (`q1`, `qa`, `run`, `E`…), relations entre membres, flux temps réel (SSE, `push`), formats de sortie, entretien et sauvegardes, outils HTTP, table des routes (`R`, `Rfor`) |
| `srv/comptes.mjs` | inscription, connexion, sessions, profil, contacts, liste des discussions, signalements, adresses de secours, sauvegardes à emporter |
| `srv/appels.mjs` | appels 1-1 (signalisation WebRTC, serveur TURN), notifications Web Push |
| `srv/groupes.mjs` | appels de groupe (maillage ≤ 4, LiveKit au-delà), onglet Appels, discussions cachées, code QR |
| `srv/messages.mjs` | discussions et messages (envoi, modification, suppression), médias, statuts, groupes, souvenirs, partage de position, clés, mot de passe oublié, e-mails |
| `srv/google.mjs` | connexion avec Google |
| `srv/traduction.mjs` | traduction (Google puis Claude), base de traduction ; contient aussi, pour l’instant, l’administration (membres, signalements, e-mails, mesures) et le flux temps réel — à séparer |

Règles :
- Chaque module importe explicitement ce qu'il utilise et exporte ce qu'il déclare.
- Une route se déclare avec `R(méthode, regex, fonction, auth)` ; le rang du module (`Rfor(n)`) garde l'ordre des routes stable.
- Les modules ne doivent rien exécuter au chargement qui dépende d'un autre module de routes (les imports sont circulaires par endroits).

## Interface (`app/public/`)

Les fichiers sont des scripts classiques chargés **dans cet ordre** par `app.html` ; ils partagent leurs variables
globales (`S` = état, `api()`, `toast()`, `ACT`, `FORMS`…). Un fichier ne doit utiliser, *au moment de son chargement*,
que ce qui est défini dans un fichier chargé avant lui (sinon erreur « is not defined »).

| Ordre | Fichier | Rôle |
|---|---|---|
| 1 | `kit.js` | icônes, petits outils d'affichage |
| 2 | `secure.js` | chiffrement de bout en bout (enveloppes v1/v2), alerte de changement de clé (`KeyPin`), verrouillage |
| 3 | `app.js` | état, appels au serveur, connexion, démarrage, liste, contacts, discussion, événements |
| 4 | `sheets.js` | fenêtres (menus, vue unique, transfert, suppression, export…) |
| 5 | `status.js` | statuts |
| 6 | `settings.js` | réglages |
| 7 | `lock.js` | création/récupération des clés, verrouillage |
| 8 | `sound.js` | son des messages |
| 9 | `media.js` | messages vocaux, photos et vidéos (tailles, aperçus), accusés de lecture |
| 10 | `store.js` | données gardées sur l'appareil, file d'envoi hors ligne, mesures de vitesse |
| 11 | `profile.js` | vidéos du profil, profil privé chiffré |
| 12 | `translate.js` | traduction à la demande |
| 13 | `actions.js` | `ACT` (actions `data-act`) et `FORMS` (formulaires `data-form`) |
| 14+ | `call.js`, `gcall.js`, `device.js`, `tabs.js`, `emoji.js`, `camera.js`, `memories.js`, `sounds.js`, `secours.js` | appels, appareil, onglets, émojis, caméra, souvenirs, sonneries, adresses de secours |
| dernier | `start.js` | lance `boot()` |

`sw.js` (service worker) garde la liste `SHELL` des fichiers à mettre en cache : **tout nouveau fichier doit y être ajouté**,
ainsi que dans `app.html`.

## Vérifications

- `npm run verifier` (à la racine) : ESLint repère les noms inconnus ou mal écrits, dans le serveur comme dans l'interface.
- `tests/` : scénarios de bout en bout Playwright (voir `tests/README.md`).

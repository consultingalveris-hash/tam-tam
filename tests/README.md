# Tests de bout en bout (Playwright)

Chaque `t-*.mjs` pilote de vrais navigateurs (Chromium, Playwright) contre un serveur local
et affiche `NO ERRORS` quand tout va bien. Ils ont servi de non-régression à chaque version.

Lancer un serveur de test (port 3555), puis un test :

```bash
cd app && rm -rf var && OWNER_EMAIL=owner@exemple.org BASE_URL=http://localhost:3555 PORT=3555 node index.mjs &
cd tests && node t-smoke.mjs
```

- Traduction : lancer `node trmock.mjs` (faux Google, port 3666) et `node claudemock.mjs` (faux Anthropic, port 3667),
  puis le serveur avec `TR_URL=http://localhost:3666/t CLAUDE_URL=http://localhost:3667/v1`.
- Appels de groupe (t-194) : un serveur LiveKit local est nécessaire (`LK_URL`, `LK_KEY`, `LK_SECRET`).
- Adresses de secours (t-198) : deux `proxy.mjs` devant le même serveur (voir l'en-tête du test).

Limites : pas de tests unitaires, pas d'intégration continue ; certains tests contiennent des chemins absolus
de l'environnement où ils ont été écrits (à adapter).

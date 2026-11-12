// Vérification automatique du code (npm run verifier) : repère les noms mal écrits, les variables inconnues,
// les erreurs évidentes. Les fichiers de l'interface partagent leurs variables globales (chargés l'un après l'autre
// par app.html) : on déclare donc à chaque fichier les noms définis au premier niveau des autres.
import js from '@eslint/js';
import globals from 'globals';
import fs from 'node:fs';

const PUB = 'app/public';
const files = fs.readdirSync(PUB).filter(f => f.endsWith('.js') && !['jsqr.js', 'sw.js', 'mb.js'].includes(f));
const shared = {};
for (const f of files) {
  const src = fs.readFileSync(`${PUB}/${f}`, 'utf8');
  for (const m of src.matchAll(/^(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm)) shared[m[1]] = 'writable';
  for (const m of src.matchAll(/^(?:const|let) (.*)$/gm)) for (const k of m[1].matchAll(/(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=(?!=)/g)) shared[k[1]] = 'writable';
  for (const m of src.matchAll(/^const\s*\{([^}]+)\}\s*=/gm)) for (const n of m[1].split(',')) { const k = n.split(':').pop().trim(); if (k) shared[k] = 'writable'; }
}
const relaxed = { 'no-unused-vars': 'off', 'no-empty': 'off', 'no-useless-escape': 'off', 'no-prototype-builtins': 'off', 'no-control-regex': 'off', 'no-cond-assign': 'off', 'no-async-promise-executor': 'off', 'no-misleading-character-class': 'off', 'no-redeclare': 'off' };

export default [
  { ignores: ['app/public/jsqr.js', 'app/public/mb.js', 'app/public/lkc/**', 'app/public/demo/**', 'node_modules/**', 'mobile/**', 'tests/**'] },
  js.configs.recommended,
  { files: ['app/public/**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...shared, LivekitClient: 'readonly' } }, rules: relaxed },
  { files: ['app/public/mb.js'], languageOptions: { sourceType: 'module' } },
  { files: ['app/public/sw.js'], languageOptions: { globals: { ...globals.serviceworker } }, rules: relaxed },
  { files: ['app/index.mjs', 'app/srv/**/*.mjs', 'outils/**/*.mjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } }, rules: relaxed },
  { files: ['relais/**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.serviceworker } }, rules: relaxed },
];

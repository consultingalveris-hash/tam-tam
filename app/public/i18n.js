/* Langue de l'application : français (par défaut) ou anglais. Choix gardé sur l'appareil ; sinon, langue du téléphone. */
'use strict';
const I18N = (() => {
  let l = ''; try { l = localStorage.getItem('tt:ui') || ''; } catch {}
  if (l !== 'fr' && l !== 'en') l = /^fr\b/i.test(navigator.language || 'fr') ? 'fr' : 'en';
  document.documentElement.lang = l;
  if (l === 'en') document.write('<script src="/i18n-en.js"><\/script>');
  return {lang: l, set(v) { try { localStorage.setItem('tt:ui', v); } catch {} location.reload(); }};
})();

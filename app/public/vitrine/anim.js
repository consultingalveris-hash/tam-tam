/* Vitrine : les visages bougent un par un, au hasard, tantôt vers la gauche, tantôt vers la droite. */
'use strict';
(() => {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const faces = [...document.querySelectorAll('.faces .fc')]; if (!faces.length) return;
  let last = -1;
  const tick = () => {
    let i; do { i = Math.floor(Math.random() * faces.length); } while (i === last && faces.length > 1); last = i;
    const dx = (Math.random() < .5 ? -1 : 1) * (14 + Math.random() * 30), dy = (Math.random() - .5) * 8;
    faces[i].style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`;
    setTimeout(() => { if (Math.random() < .55) faces[i].style.transform = ''; }, 1600 + Math.random() * 1200);
    setTimeout(tick, 650 + Math.random() * 900);
  };
  setTimeout(tick, 800);
})();

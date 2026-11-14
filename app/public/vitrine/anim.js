/* Vitrine : les visages bougent un par un, au hasard, tantôt vers la gauche, tantôt vers la droite. */
'use strict';
(() => {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const faces = [...document.querySelectorAll('.faces .fc')]; if (!faces.length) return;
  let last = -1;
  const tick = () => {
    let i; do { i = Math.floor(Math.random() * faces.length); } while (i === last && faces.length > 1); last = i;
    // gauche et droite à tour de rôle pour chaque visage, puis retour à sa place
    faces[i].dir = -(faces[i].dir || (Math.random() < .5 ? 1 : -1));
    const dx = faces[i].dir < 0 ? -(12 + Math.random() * 14) : 14 + Math.random() * 18, dy = (Math.random() - .5) * 8;
    faces[i].style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`;
    setTimeout(() => { faces[i].style.transform = ''; }, 1500 + Math.random() * 1000);
    setTimeout(tick, 650 + Math.random() * 900);
  };
  setTimeout(tick, 800);
})();

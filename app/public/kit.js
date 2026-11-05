/* Icônes, logo et avatars repris de la maquette tam-tam */
const BUBBLE = 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1.2-4.4A8 8 0 1 1 21 12z';
const svg = (inner, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const I = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  more: svg('<circle cx="12" cy="5" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.7" fill="currentColor" stroke="none"/>'),
  back: svg('<path d="M19 12H5"/><path d="m12 5-7 7 7 7"/>'),
  phone: svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
  video: svg('<rect x="2" y="6" width="14" height="12" rx="2.5"/><path d="m16 10.5 6-3.5v10l-6-3.5z"/>'),
  send: svg('<path d="M3.4 20.4 21.5 12 3.4 3.6 3 10l12 2-12 2z"/>'),
  emoji: svg('<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  image: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>'),
  pin: svg('<path d="M12 16v6"/><path d="M9 3h6l-1 6 3 3.5V15H7v-2.5L10 9z"/>'),
  mute: svg('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>'),
  sound: svg('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>'),
  newchat: svg(`<path d="${BUBBLE}"/><path d="M13 9v6M10 12h6"/>`),
  chats: svg(`<path d="${BUBBLE}"/>`),
  lives: svg('<rect x="3" y="4" width="18" height="13" rx="3"/><path d="m10.5 8 4.5 2.5-4.5 2.5z"/><path d="M8 21h8"/>'),
  heart: svg('<path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z"/>'),
  eye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  translate: svg('<path d="M3 5h9M7.5 3v2M5 5c.6 3.2 2.8 5.8 6 7.2M10.5 5c-.7 3.6-3 6.2-7 7.6"/><path d="m12.5 20 4-9 4 9M14 17h5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  reply: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v3"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>'),
  userplus: svg('<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
  chev: svg('<path d="m6 9 6 6 6-6"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  callIn: svg('<path d="M17 7 7 17M7 9v8h8"/>'),
  callOut: svg('<path d="M7 17 17 7M9 7h8v8"/>'),
};
const LOGO = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5c7.7 0 14 5.6 14 12.5s-6.3 12.5-14 12.5c-1.6 0-3.2-.25-4.6-.7L5 29.5l1.7-5.3C3.8 21.9 2 18.6 2 15 2 8.1 8.3 2.5 16 2.5z" fill="var(--accent)"/><path d="M9.5 10.5h13c0 4.2-2.6 5.6-3.9 7.3l1.6 4.7h-8.4l1.6-4.7c-1.3-1.7-3.9-3.1-3.9-7.3z" fill="#fff"/><path d="M11.6 13.6l2.9 3.7M20.4 13.6l-2.9 3.7M16 13.4v3.9" fill="none" stroke="var(--accent)" stroke-width="1" stroke-linecap="round"/><ellipse cx="16" cy="10.5" rx="6.5" ry="2.4" fill="var(--brand-2)" stroke="#fff" stroke-width="1.2"/></svg>`;
const WORD = 'tam<i>-</i>tam';
I.camera = svg('<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>');
I.clip = svg('<path d="M21 11.5 12.4 20a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6L15.4 6.6"/>');
I.gal = svg('<rect x="7" y="3" width="14" height="14" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12"/><path d="m7 14 4-4 3 3 2-2 5 5"/>');
I.doc = svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>');
I.rotL = svg('<path d="M3 4v6h6"/><path d="M3.5 10A9 9 0 1 1 6 17"/>');
I.rotR = svg('<path d="M21 4v6h-6"/><path d="M20.5 10A9 9 0 1 0 18 17"/>');
I.lock = svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
I.globe = svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>');
I.play = svg('<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>');
I.key = svg('<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14.5 8.5l2 2"/>');
I.shield = svg('<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>');
I.flag = svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>');
I.eyeOff = svg('<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.6C3.8 8.3 2 12 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');
I.block = svg('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>');
I.plus = svg('<path d="M12 5v14M5 12h14"/>');
I.loc = svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>');
I.grip = svg('<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>');
I.userplus = svg('<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/>');
const AV_DESIGNS = {
  f1: ['f', 'Cheveux longs'], f2: ['f', 'Afro'], f3: ['f', 'Foulard'], f4: ['f', 'Tresses'], f5: ['f', 'Chignon'], f6: ['f', 'Carré'],
  m1: ['m', 'Classique'], m2: ['m', 'Crâne rasé'], m3: ['m', 'Barbe'], m4: ['m', 'Locks'], m5: ['m', 'Kufi'], m6: ['m', 'Lunettes'],
};
const AV_COLORS = [
  ['turq', 'Turquoise', '#0097a7', '#004f58'], ['bleu', 'Bleu', '#1e4fd8', '#0d2370'], ['violet', 'Violet', '#7b1fa2', '#3b0c50'],
  ['rouge', 'Rouge', '#d32f2f', '#6a1010'], ['orange', 'Orange', '#ef6c00', '#743300'], ['vert', 'Vert', '#2e7d32', '#103813'],
  ['rose', 'Rose', '#c2185b', '#5a0a29'], ['brun', 'Brun', '#6d4c41', '#2e1f1a'], ['noir', 'Noir', '#263238', '#05080a'],
];
function avSvg(d, b, h) {
  const head = (cy = 16, r = 7) => `<circle cx="20" cy="${cy}" r="${r}" fill="${b}"/>`;
  const sh = `<path d="M5 40c.6-7.8 6.7-12.4 15-12.4S34.4 32.2 35 40z" fill="${b}"/>`;
  const cap = `<path d="M12.8 15.2c-.2-5.3 3.1-8.4 7.2-8.4s7.4 3.1 7.2 8.4c-1.6-2.4-4-3.2-7.2-3.2s-5.6.8-7.2 3.2z" fill="${h}"/>`;
  const inner = {
    f1: `<path d="M10.5 22c-.8-9 3.2-15 9.5-15s10.3 6 9.5 15c-.3 3-1.6 5-3.2 6H13.7c-1.6-1-2.9-3-3.2-6z" fill="${h}"/>${head(16.5, 6.6)}${sh}`,
    f2: `<circle cx="20" cy="14.5" r="11.2" fill="${h}"/>${sh}${head(17.5, 6.4)}`,
    f3: `${sh}${head(18, 6.4)}<path d="M12.6 17.4c-1.1-6.6 2.2-11.6 7.4-11.6s8.5 5 7.4 11.6c-1.9-2.3-4.4-3.2-7.4-3.2s-5.5.9-7.4 3.2z" fill="${h}"/><ellipse cx="24.5" cy="5.6" rx="4.6" ry="3.1" transform="rotate(-18 24.5 5.6)" fill="${h}"/>`,
    f4: `${sh}<rect x="10.6" y="13" width="3.6" height="18" rx="1.8" fill="${h}"/><rect x="25.8" y="13" width="3.6" height="18" rx="1.8" fill="${h}"/>${head(16.5, 6.8)}${cap}`,
    f5: `<circle cx="20" cy="6.4" r="4.4" fill="${h}"/>${sh}${head(16.5, 6.8)}${cap}`,
    f6: `<path d="M11.4 21c-.7-8 3.4-13.4 8.6-13.4s9.3 5.4 8.6 13.4c-.1 1.4-.8 2.4-1.8 2.8H13.2c-1-.4-1.7-1.4-1.8-2.8z" fill="${h}"/>${sh}${head(16.8, 6.6)}<path d="M13.2 15.4c.3-4.6 3.1-7.2 6.8-7.2s6.5 2.6 6.8 7.2c-2.2-1.6-4.4-2.9-6.8-2.9s-4.6 1.3-6.8 2.9z" fill="${h}"/>`,
    m1: `${head()}${cap}${sh}`,
    m2: `<circle cx="12.9" cy="16.6" r="1.7" fill="${b}"/><circle cx="27.1" cy="16.6" r="1.7" fill="${b}"/>${head()}${sh}`,
    m3: `${head()}${cap}<path d="M13.3 17.6c.5 5.2 3.3 8.3 6.7 8.3s6.2-3.1 6.7-8.3c-1.1 2.9-3.6 4.6-6.7 4.6s-5.6-1.7-6.7-4.6z" fill="${h}"/>${sh}`,
    m4: `${[11, 14, 23.4, 26.4].map(x => `<rect x="${x}" y="9" width="2.6" height="17" rx="1.3" fill="${h}"/>`).join('')}${sh}${head()}${cap}`,
    m5: `${head()}<path d="M12.6 14.2c0-5 3.3-8 7.4-8s7.4 3 7.4 8z" fill="${h}"/><rect x="12.4" y="13.2" width="15.2" height="1.8" rx=".9" fill="${b}" opacity=".55"/>${sh}`,
    m6: `${head()}${cap}<g fill="none" stroke="${h}" stroke-width="1.2"><circle cx="17" cy="16.6" r="2.3"/><circle cx="23" cy="16.6" r="2.3"/><path d="M19.3 16.4h1.4M14.7 16.2l-1.6-.6M25.3 16.2l1.6-.6"/></g>${sh}`,
  }[d] || `${head()}${sh}`;
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${inner}</svg>`;
}
const colOf = k => AV_COLORS.find(c => c[0] === k) || AV_COLORS[0];

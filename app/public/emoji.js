/* tam-tam — émoticônes : un panneau qui insère l'émoticône à l'endroit du curseur
   (messages, légendes de photos et vidéos, statuts). */
const EMO = [
  ['Récents', '🕘', []],
  ['Visages', '😀', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖'.split(' ')],
  ['Gestes', '👍', '👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🫶 👀 👂 👃 🧠 🫀 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👮 🧕 🤵 👰 🤰 🤱 👼 🎅 🦸 🧑‍🎓 🧑‍🏫 🧑‍⚕️ 🧑‍🌾 🧑‍🍳 🧑‍💻 🧑‍🔧 💃 🕺 👯 🧘 🏃 🚶 👫 👪'.split(' ')],
  ['Cœurs', '❤️', '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☯️ ✡️ 🔯 💯 💢 💥 💫 💦 💨 🕳️ 💬 💭 💤 ✨ 🌟 ⭐ 🔥 🎉 🎊'.split(' ')],
  ['Nature', '🦁', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦓 🦒 🐘 🦏 🦛 🐪 🐫 🦘 🐊 🐢 🐍 🦎 🐙 🐠 🐟 🐬 🐳 🦈 🐝 🐛 🦋 🐌 🐞 🐜 🌵 🌴 🌳 🌲 🌱 🌿 🍀 🍁 🍂 🌾 🌺 🌻 🌹 🌷 🌼 🌸 💐 🌍 🌙 ☀️ ⛅ 🌧️ ⛈️ 🌈 ❄️ 🌊'.split(' ')],
  ['Cuisine', '🍲', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥜 🫘 🍞 🥖 🥚 🍳 🧈 🥞 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍚 🍙 🍘 🥘 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🥛 ☕ 🍵 🧃 🥤 🧋 🍺 🍻 🥂 🍷 🍹'.split(' ')],
  ['Activités', '⚽', '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🏹 🎣 🛹 🎿 🏋️ 🤸 🤼 🤽 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🧩'.split(' ')],
  ['Voyages', '✈️', '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🗺️ 🗿 🗽 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🏕️ 🏠 🏡 🏘️ 🏢 🏬 🏥 🏦 🏨 🏪 🏫 🏛️ ⛪ 🕌 🕍 🛕'.split(' ')],
  ['Objets', '💡', '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🎙️ ⏰ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 💸 💵 💶 💷 💰 💳 💎 ⚖️ 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 🔫 💣 🔪 🛡️ 🔮 💈 💊 💉 🩸 🧬 🌡️ 🧹 🧺 🧻 🚽 🛁 🔑 🗝️ 🚪 🛋️ 🛏️ 🧸 🎁 🎈 🎀 🪅 ✉️ 📩 📦 📜 📄 📅 📆 📇 📈 📉 📊 📋 📌 📍 📎 📏 📐 ✂️ 🗂️ 📁 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🔗 ✏️ 🖊️ 🖋️ 🖌️ 🖍️ 📝 🔍 🔒 🔓'.split(' ')],
  ['Drapeaux', '🌍', '🇸🇳 🇨🇲 🇨🇮 🇲🇱 🇧🇫 🇬🇳 🇳🇪 🇹🇬 🇧🇯 🇬🇦 🇨🇬 🇨🇩 🇹🇩 🇨🇫 🇬🇶 🇲🇷 🇬🇲 🇬🇼 🇨🇻 🇸🇱 🇱🇷 🇬🇭 🇳🇬 🇲🇦 🇩🇿 🇹🇳 🇱🇾 🇪🇬 🇸🇩 🇪🇹 🇰🇪 🇺🇬 🇷🇼 🇧🇮 🇹🇿 🇲🇬 🇿🇦 🇦🇴 🇲🇿 🇿🇲 🇿🇼 🇳🇦 🇧🇼 🇭🇹 🇫🇷 🇧🇪 🇨🇭 🇨🇦 🇺🇸 🇬🇧 🇪🇸 🇵🇹 🇮🇹 🇩🇪 🇧🇷 🇨🇳 🇮🇳 🇸🇦 🇦🇪 🇹🇷 🏳️ 🏴 🏁 🇺🇳'.split(' ')],
];
const Emoji = {
  target: null, cat: 1,
  recent() { try { return JSON.parse(localStorage.getItem('tt-emo') || '[]'); } catch { return []; } },
  keep(e) { try { const r = [e, ...this.recent().filter(x => x !== e)].slice(0, 32); localStorage.setItem('tt-emo', JSON.stringify(r)); } catch {} },
  // Bouton à placer à côté d'un champ : data-emo="#idDuChamp"
  btn: (sel, cls = 'ib') => `<button class="${cls} emo-btn" type="button" data-emo="${sel}" aria-label="Émoticônes" title="Émoticônes">${I.emoji}</button>`,
  toggle(sel, anchor) {
    if (this.el && this.target === sel) return this.close();
    this.close(); this.target = sel; if (!this.recent().length && this.cat === 0) this.cat = 1;
    this.el = document.createElement('div'); this.el.className = 'emo-panel'; this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-label', 'Émoticônes');
    const host = anchor.closest('.edit, .st-comp, #compose, .sv-reply') || document.body;
    (host.id === 'compose' ? host : host).appendChild(this.el);
    if (host === document.body || host.id === 'compose') this.el.classList.add('emo-float');
    this.render();
  },
  render() {
    const list = this.cat === 0 ? this.recent() : EMO[this.cat][2];
    this.el.innerHTML = `<div class="emo-tabs">${EMO.map(([n, ic], i) => `<button type="button" data-emocat="${i}" aria-pressed="${this.cat === i}" aria-label="${n}" title="${n}">${ic}</button>`).join('')}<button type="button" class="emo-x" data-emox="1" aria-label="Fermer les émoticônes">${I.close}</button></div>
      <div class="emo-grid">${list.length ? list.map(e => `<button type="button" data-emoi="${e}">${e}</button>`).join('') : '<p class="hint">Vos émoticônes récentes apparaîtront ici.</p>'}</div>`;
  },
  insert(e) {
    const f = document.querySelector(this.target); if (!f) return this.close();
    const a = f.selectionStart ?? f.value.length, b = f.selectionEnd ?? f.value.length;
    f.value = f.value.slice(0, a) + e + f.value.slice(b); const p = a + e.length;
    try { f.setSelectionRange(p, p); } catch {}
    f.dispatchEvent(new Event('input', {bubbles: true})); this.keep(e);
  },
  close() { if (this.el) this.el.remove(); this.el = null; this.target = null; },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-emo]'); if (b) { e.preventDefault(); e.stopPropagation(); return Emoji.toggle(b.dataset.emo, b); }
  if (!Emoji.el) return;
  const c = e.target.closest('[data-emocat]'); if (c) { e.preventDefault(); e.stopPropagation(); Emoji.cat = +c.dataset.emocat; return Emoji.render(); }
  const i = e.target.closest('[data-emoi]'); if (i) { e.preventDefault(); e.stopPropagation(); return Emoji.insert(i.dataset.emoi); }
  if (e.target.closest('[data-emox]')) { e.preventDefault(); return Emoji.close(); }
  if (!e.target.closest('.emo-panel')) Emoji.close();
}, true);

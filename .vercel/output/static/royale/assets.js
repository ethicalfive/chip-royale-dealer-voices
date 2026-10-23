// Applies config.js asset paths over the built-in art, and swaps synth sounds for files where configured.
(() => {
  const A = window.BJ_CONFIG.assets, css = [];
  const u = p => `url("${p}")`;
  if (A.cardBack) css.push(`.card.back,.shoe i,.pshoe i,.pdisc{background-image:${u(A.cardBack)}!important}`);
  if (A.felt) css.push(`.felt{background-image:${u(A.felt)}}`);
  if (A.feltAlt) css.push(`.felt.burgundy{background-image:${u(A.feltAlt)}}`);
  if (A.lobbyBg) css.push(`#lobby,#login{background-image:${u(A.lobbyBg)}}`);
  if (A.chipImage) css.push(`.chiprow button{background:${u(A.chipImage)} center/contain no-repeat!important}`);
  // standalone: hide lobby/store/social entry points without changing layout
  css.push('#leave,#msgBtn,#frBtn{visibility:hidden!important;pointer-events:none}');
  const st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st);
  try {
    for (const [k, p] of Object.entries(A.sounds || {})) if (p) {
      const a = new Audio(p);
      SFX[k] = () => { if (typeof muted !== 'undefined' && muted) return; const x = a.cloneNode(); x.play().catch(() => {}); };
    }
  } catch (e) {}
})();

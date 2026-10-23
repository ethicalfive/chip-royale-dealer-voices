// ---------- roulette (European single zero) ----------
// The server owns the result (crypto RNG); the wheel + ball here are visual only and are steered to land on the server's number.
// Optional art: drop PNGs into public/art/ and they replace the built-in canvas/CSS art (see docs/V0.12.md for sizes/prompts):
//   (list the names in art/index.json)
//   art/roulette-wheel.png  rotating wheel face, 0 pocket centred at 12 o'clock, pockets clockwise in European order
//   art/croupier.png        croupier portrait (transparent)      art/roulette-felt.png  stage backdrop      art/roulette-board.png  board felt texture
const RWHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RRED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const rColor = n => n === 0 ? 'green' : RRED.has(n) ? 'red' : 'black';
const SEG = Math.PI * 2 / 37, W_SPEED = 0.55; // wheel turns at a constant gentle speed (rad/s), so its angle is a pure function of time
const ART = {}, artList = Promise.resolve([]);
function artTry(name, ok) { artList.then(l => { if (!Array.isArray(l) || !l.includes(name)) return; const i = new Image(); i.onload = () => { ART[name] = i; ok(i); }; i.src = `art/${name}.png`; }); }
// ----- sound (fb_f948feefdb): layered WebAudio, no files -----
// ball roll = looping band-passed noise whose pitch + level follow the ball speed; fret ticks get sparser and softer as it slows;
// pocket drop = woody thump + rattle; croupier calls get a soft two-note chime; chips clink with random pitch; wins get a short arpeggio
const RSND = { roll: null,
  rollStart() { if (muted) return; try { const a = AC(), n = a.createBufferSource(), b = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), x = b.getChannelData(0); let last = 0;
    for (let i = 0; i < x.length; i++) { last = last * .96 + (Math.random() * 2 - 1) * .04; x[i] = last * 6 + (Math.random() * 2 - 1) * .05; }
    n.buffer = b; n.loop = true; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.value = 900; const g = a.createGain(); g.gain.value = 0; n.connect(f).connect(g).connect(a.destination); n.start();
    g.gain.linearRampToValueAtTime(.16, a.currentTime + .25); this.roll = { n, f, g }; } catch {} },
  rollSet(speed) { const r = this.roll; if (!r) return; const a = AC(); r.f.frequency.setTargetAtTime(380 + 1300 * speed, a.currentTime, .05); r.g.gain.setTargetAtTime(.02 + .14 * speed, a.currentTime, .08); },
  rollStop() { const r = this.roll; if (!r) return; this.roll = null; const a = AC(); r.g.gain.setTargetAtTime(0, a.currentTime, .08); setTimeout(() => { try { r.n.stop(); } catch {} }, 600); },
  tick(v = 1) { if (muted) return; noiseBurst(.025, .12 * v, 0, 3800 + Math.random() * 1500); tone(2400 + Math.random() * 900, .03, 'square', .02 * v); },
  drop() { if (muted) return; tone(140, .18, 'sine', .22, 0, 70); noiseBurst(.07, .18, 0, 900); [.07, .15, .24].forEach((t, i) => { noiseBurst(.03, .1 / (i + 1), t, 3000); tone(1900 - i * 200, .03, 'square', .015 / (i + 1), t); }); },
  chime(hi) { if (muted) return; tone(hi ? 988 : 784, .5, 'sine', .07); tone(hi ? 1319 : 1047, .7, 'sine', .055, .16); },
  chip() { if (muted) return; const f = 2600 + Math.random() * 1200; tone(f, .05, 'triangle', .06); tone(f * 1.5, .04, 'sine', .03, .012); noiseBurst(.03, .08, 0, 4000); },
  win(big) { if (muted) return; [523, 659, 784, 1047].concat(big ? [1319] : []).forEach((f, i) => tone(f, .25, 'triangle', .08, i * .09)); } };
// ----- board -----
// geometry in board units: x 0..14 (zero = 1 unit, 12 number columns, the 2:1 column bets), y 0..4.6 (3 number rows, dozens 0.8, outside 0.8)
const BX = 14, BY = 4.6, ex = x => (x / BX * 100) + '%', ey = y => (y / BY * 100) + '%';
const nCell = n => n === 0 ? [0.5, 1.5] : [1 + Math.floor((n - 1) / 3) + .5, 2 - ((n - 1) % 3) + .5];
const OUTS = [['low', '1–18', 1], ['even', 'EVEN', 3], ['red', '◆', 5], ['black', '◆', 7], ['odd', 'ODD', 9], ['high', '19–36', 11]];
function rKeyOf(nums) { nums = [...new Set(nums)].sort((a, b) => a - b); const [a] = nums;
  if (nums.length === 1) return 'n:' + a; if (nums.length === 2) return `sp:${a}-${nums[1]}`;
  if (nums.length === 3) return a === 0 ? 'tr:' + nums.join('-') : 'st:' + a; if (nums.length === 4) return a === 0 ? 'co:0' : 'co:' + a; if (nums.length === 6) return 'sl:' + a; return null; }
function rCovers(key) { const [k, v] = key.split(':'), a = v === undefined ? 0 : +v.split('-')[0], R = (x, y, s = 1) => { const r = []; for (let i = x; i <= y; i += s) r.push(i); return r; };
  switch (k) { case 'n': return [a]; case 'sp': case 'tr': return v.split('-').map(Number); case 'st': return R(a, a + 2); case 'co': return a === 0 ? [0, 1, 2, 3] : [a, a + 1, a + 3, a + 4]; case 'sl': return R(a, a + 5);
    case 'red': return [...RRED]; case 'black': return R(1, 36).filter(x => !RRED.has(x)); case 'odd': return R(1, 36, 2); case 'even': return R(2, 36, 2); case 'low': return R(1, 18); case 'high': return R(19, 36);
    case 'd1': return R(1, 12); case 'd2': return R(13, 24); case 'd3': return R(25, 36); case 'c1': return R(1, 34, 3); case 'c2': return R(2, 35, 3); case 'c3': return R(3, 36, 3); } return []; }
// where a chip sits for a bet key (board units)
function rSpot(key) { const k = key.split(':')[0];
  if (k === 'c1' || k === 'c2' || k === 'c3') return [13.5, { c3: .5, c2: 1.5, c1: 2.5 }[k]];
  if (k[0] === 'd' && k.length === 2) return [1 + (+k[1] - 1) * 4 + 2, 3.4]; const o = OUTS.find(x => x[0] === k); if (o) return [o[2] + 1, 4.2];
  const nums = rCovers(key), cs = nums.map(nCell); let x = cs.reduce((s, c) => s + c[0], 0) / cs.length, y = cs.reduce((s, c) => s + c[1], 0) / cs.length;
  if (k === 'st' || k === 'sl' || key === 'co:0') y = 3; if (key === 'co:0') x = 1; if (k === 'tr') x = 1; return [x, y]; }
function rBuild() { let h = `<div class="rcell rz" style="left:0;top:0;width:${ex(1)};height:${ey(3)}">0</div>`;
  for (let c = 0; c < 12; c++) for (let r = 0; r < 3; r++) { const n = c * 3 + 3 - r; h += `<div class="rcell rn ${RRED.has(n) ? 'red' : 'blk'}" data-n="${n}" style="left:${ex(1 + c)};top:${ey(r)};width:${ex(1)};height:${ey(1)}"><b>${n}</b></div>`; }
  ['c3', 'c2', 'c1'].forEach((k, r) => h += `<div class="rcell ro" data-k="${k}" style="left:${ex(13)};top:${ey(r)};width:${ex(1)};height:${ey(1)}">2:1</div>`);
  ['1st 12', '2nd 12', '3rd 12'].forEach((t, i) => h += `<div class="rcell ro" data-k="d${i + 1}" style="left:${ex(1 + i * 4)};top:${ey(3)};width:${ex(4)};height:${ey(.8)}">${t}</div>`);
  OUTS.forEach(([k, t, x]) => h += `<div class="rcell ro ${k === 'red' ? 'ored' : k === 'black' ? 'oblk' : ''}" data-k="${k}" style="left:${ex(x)};top:${ey(3.8)};width:${ex(2)};height:${ey(.8)}">${t}</div>`);
  $('rBoard').innerHTML = `<div class="rgrid">${h}<div class="rchipl" id="rChipL"></div><div class="rhint hidden" id="rHint"></div></div>`; }
// tap → which bet: centre of a number = straight; near an edge = split / street (bottom edge); near a corner = corner / six line (bottom edge)
function rHit(e) { const g = $('rBoard').firstChild.getBoundingClientRect(), x = (e.clientX - g.left) / g.width * BX, y = (e.clientY - g.top) / g.height * BY;
  if (y < 0 || y > BY || x < 0 || x > BX) return null;
  if (y >= 3.8) { const o = OUTS.find(o => x >= o[2] && x < o[2] + 2); return o ? o[0] : null; }
  if (y >= 3) return x < 1 || x >= 13 ? null : 'd' + (1 + Math.min(2, Math.floor((x - 1) / 4)));
  if (x >= 13) return ['c3', 'c2', 'c1'][Math.min(2, Math.floor(y))];
  if (x < 1) return 'n:0';
  const col = Math.min(11, Math.floor(x - 1)), row = Math.min(2, Math.floor(y)), fx = x - 1 - col, fy = y - row, E = .27, n = col * 3 + 3 - row;
  const L = fx < E, Rt = fx > 1 - E, T = fy < E && row > 0, B = fy > 1 - E, hn = L ? (col > 0 ? n - 3 : 0) : Rt ? (col < 11 ? n + 3 : null) : null;
  if (B && row === 2) { // bottom edge: street, or six line at a column boundary
    if (Rt && col < 11) return 'sl:' + n; if (L && col > 0) return 'sl:' + (n - 3); if (L && col === 0) return 'co:0'; return 'st:' + n; }
  const vn = T ? n + 1 : B ? n - 1 : null;
  if (hn !== null && vn !== null) return hn === 0 ? rKeyOf([0, n, vn]) : rKeyOf([n, hn, vn, hn + (vn - n)]);
  if (hn !== null) return rKeyOf([n, hn]); if (vn !== null) return rKeyOf([n, vn]); return 'n:' + n; }
const rLabel = k => { const c = rCovers(k), t = k.split(':')[0]; return { n: 'Straight', sp: 'Split', st: 'Street', tr: 'Trio', co: 'Corner', sl: 'Six line' }[t] ? `${{ n: 'Straight', sp: 'Split', st: 'Street', tr: 'Trio', co: 'Corner', sl: 'Six line' }[t]} ${c.join('·')} · pays ${36 / c.length - 1}:1` : `${k.toUpperCase()} · pays ${36 / c.length - 1}:1`; };
let rChip = 0, rBuilt = false, rLastKey = '', rHintT;
$('rBoard').addEventListener('pointerdown', e => { if (!rou) return; const k = rHit(e); if (!k) return; e.preventDefault();
  if (rou.phase !== 'betting') return toast('No more bets'); const amt = (rou.tier.chips || [rou.tier.min])[rChip]; send({ type: 'rouBet', key: k, amount: amt }); rLastKey = k; RSND.chip();
  const hn = $('rHint'); hn.textContent = rLabel(k); hn.classList.remove('hidden'); clearTimeout(rHintT); rHintT = setTimeout(() => hn.classList.add('hidden'), 1400);
  const [x, y] = rSpot(k), g = $('rBoard').firstChild, p = document.createElement('i'); p.className = 'rping'; p.style.left = ex(x); p.style.top = ey(y); g.appendChild(p); setTimeout(() => p.remove(), 500); });
$('rChips').onclick = e => { const b = e.target.closest('button'); if (b) { rChip = +b.dataset.i; rRender(); } };
$('rUndo').onclick = () => send({ type: 'rouUndo' }); $('rClear').onclick = () => send({ type: 'rouClear' }); $('rRebet').onclick = () => send({ type: 'rouRebet' });
$('rLeave').onclick = () => send({ type: 'rouLeave' });
$('rSeats').onclick = e => { const el = e.target.closest('[data-cname]'); if (el) openCard(el.dataset.cname); };
function rRender(nt) { const t = rou; if (!t) return; if (!rBuilt) { rBuild(); rBuilt = true; rWheelInit(); }
  const mine = t.seats.find(s => s && s.name === me.name) || { bets: {}, total: 0 }, chips = t.tier.chips || [t.tier.min]; if (nt) rChip = Math.min(rChip, chips.length - 1);
  $('rInfo').textContent = `🎡 ${t.tier.name.replace('Room', 'Roulette')} · ${fmt(t.limits.min)}–${fmt(t.limits.outsideMax)}`;
  $('rChips').innerHTML = chips.map((v, i) => `<button class="c${i} ${i === rChip ? 'sel' : ''}" data-i="${i}">${fmt(v)}</button>`).join('');
  $('rHist').innerHTML = t.history.slice(-14).reverse().map((n, i) => `<span class="${rColor(n)} ${i === 0 && t.phase !== 'spinning' ? 'last' : ''}">${n}</span>`).join('') || '<span class="none">No spins yet</span>';
  // chips on the board: table totals per spot, mine ringed gold
  $('rChipL').innerHTML = Object.entries(t.board).map(([k, b]) => { const [x, y] = rSpot(k), my = mine.bets[k] || 0; return `<i class="rchip ${my ? 'mine' : ''} ${k === rLastKey ? 'drop' : ''}" style="left:${ex(x)};top:${ey(y)}" title="${k}">${fmt(my || b.total)}</i>`; }).join('');
  rLastKey = '';
  const res = t.phase === 'settled' ? t.result : null; document.querySelectorAll('#rBoard .rcell').forEach(el => { const k = el.dataset.k || (el.dataset.n !== undefined ? 'n:' + el.dataset.n : 'n:0'); el.classList.toggle('win', res !== null && rCovers(k).includes(res)); });
  $('rSeats').innerHTML = t.seats.map((s, i) => !s ? Seats.emptyC(t, i) : `<div class="cseat ${s.name === me.name ? 'me' : ''}" data-cname="${esc(s.name)}"><div class="av" style="background-image:url(${avUrl(s.avatar)})"><span class="vipb">${VIPI[s.vip] || ''}</span><span class="lvb">${s.level}</span></div>
    <div class="nm">${esc(s.display)}</div><div class="small">${s.net !== null && s.net !== undefined && t.phase === 'settled' ? `<i class="${s.net >= 0 ? 'win' : 'lose'}">${s.net >= 0 ? '+' + fmt(s.net) : '-' + fmt(-s.net)}</i>` : s.total ? fmt(s.total) : ''}</div></div>`).join('');
  const open = t.phase === 'betting'; $('rUndo').disabled = !open || !mine.total; $('rClear').disabled = !open || !mine.total; $('rRebet').disabled = !open || !mine.canRebet || mine.total > 0;
  $('rBoard').classList.toggle('closed', !open);
  if (t.phase === 'spinning' && !rSpinS && t.result !== null) rSpin({ result: t.result, spinMs: t.spinMs, late: Date.now() - t.spinAt });
  if (t.phase === 'settled' && !rSpinS) { rRest = t.result; rShowRes(t.result); } if (t.phase === 'betting') { $('rRes').classList.add('hidden'); if (!rSpinS) rRest = rRest; } }
// ----- croupier -----
const CROUPIER_SVG = `<svg viewBox="0 0 80 80" aria-hidden="true"><defs><radialGradient id="cfS" cx=".45" cy=".4"><stop offset="0" stop-color="#f6d2b4"/><stop offset="1" stop-color="#c98f6c"/></radialGradient><linearGradient id="cfV" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2a2a33"/><stop offset="1" stop-color="#0d0d12"/></linearGradient></defs>
  <path d="M8 80c2-16 14-24 32-24s30 8 32 24z" fill="url(#cfV)"/><path d="M30 56l10 14 10-14z" fill="#f4f1ea"/><path d="M33 60l7 4 7-4-7 6z" fill="#b3122a"/><path d="M34 60l-5-3v7zM46 60l5-3v7z" fill="#d11a36"/><circle cx="40" cy="61" r="1.6" fill="#7d0b1c"/>
  <rect x="35" y="44" width="10" height="12" rx="4" fill="#d9a585"/><ellipse cx="40" cy="32" rx="15" ry="17" fill="url(#cfS)"/><path d="M25 30c-1-13 7-20 15-20s17 6 15 20c-2-7-6-11-15-11s-13 4-15 11z" fill="#1d140f"/>
  <ellipse cx="34" cy="33" rx="1.8" ry="2.2" fill="#2b1a10"/><ellipse cx="46" cy="33" rx="1.8" ry="2.2" fill="#2b1a10"/><path d="M31 29q3-2 6 0M43 29q3-2 6 0" stroke="#2b1a10" stroke-width="1.4" fill="none"/><path d="M35 41q5 4 10 0" stroke="#8a4a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M33 38q7 2 14 0" stroke="#2b1a10" stroke-width="1.6" fill="none" opacity=".75"/></svg>`;
$('cAv').innerHTML = CROUPIER_SVG;
artTry('croupier', i => { $('cAv').innerHTML = ''; $('cAv').style.backgroundImage = `url(${i.src})`; $('cAv').classList.add('art'); });
artTry('roulette-felt', i => $('rStage').style.backgroundImage = `url(${i.src})`);
artTry('roulette-board', i => $('rBoard').style.setProperty('--board-art', `url(${i.src})`));
let bubT; function say(text, ms = 2400, cls = '') { const b = $('cBub'); b.textContent = text; b.className = 'cbubble ' + cls; if (!reduced) b.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.05)', opacity: 1, offset: .7 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
  clearTimeout(bubT); bubT = setTimeout(() => b.classList.add('hidden'), ms); }
function rouCall(c) { if (c === 'place') { say('Place your bets, please!'); RSND.chime(false); } if (c === 'last') { say('Last bets!', 2400, 'hot'); RSND.chime(true); } if (c === 'nomore') { say('No more bets.', 2200, 'hot'); RSND.chime(false); } }
function rouResult(m) { const mine = m.winners.includes(me.name); setTimeout(() => { say(`${m.result} ${m.result === 0 ? 'zero, green' : m.color}!${m.winners.length ? (mine ? ' Congratulations!' : ` Winner${m.winners.length > 1 ? 's' : ''}: ${m.winners.length}`) : ''}`, 3600, mine ? 'win' : '');
  rShowRes(m.result); const s = rou && rou.seats.find(x => x && x.name === me.name); if (mine) RSND.win(s && s.net > s.total * 5); else if (s && s.total) SFX.lose(); }, rSpinS ? Math.max(0, rSpinS.T - (performance.now() - rSpinS.t0)) + 250 : 0); }
function rShowRes(n) { const r = $('rRes'); r.textContent = n; r.className = 'rres ' + rColor(n); if (!reduced) r.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: .7 }, { transform: 'translate(-50%,-50%)', opacity: 1 }], { duration: 380, easing: 'ease-out' }); }
// ----- wheel + ball -----
let rCtx, rFace, rSpinS = null, rRest = null, rRaf = 0, rClick = 0;
const wheelAng = now => (now / 1000 * W_SPEED) % (Math.PI * 2);
const pocketAng = n => RWHEEL.indexOf(n) * SEG; // relative to the wheel, 0 = 12 o'clock, clockwise
// the wheel is always a circle: the canvas is sized in px to the largest square that fits its box, backing store = css size x devicePixelRatio,
// and everything is drawn in a 520x520 logical space scaled to it (no CSS stretching)
let rScale = 1;
function rSize() { const c = $('rWheel'), box = c.parentElement, s = Math.max(60, Math.floor(Math.min(box.clientWidth, box.clientHeight))), dpr = window.devicePixelRatio || 1, px = Math.round(s * dpr);
  c.style.width = c.style.height = s + 'px'; box.style.setProperty('--ws', s + 'px'); if (c.width !== px) { c.width = c.height = px; } rScale = px / 520; }
function rWheelInit() { const c = $('rWheel'); rCtx = c.getContext('2d'); rFace = document.createElement('canvas'); rFace.width = rFace.height = 1040; const fg = rFace.getContext('2d'); fg.scale(2, 2); drawFace(fg);
  rSize(); if (window.ResizeObserver) new ResizeObserver(rSize).observe(c.parentElement); addEventListener('resize', rSize);
  artTry('roulette-wheel', i => { const g = rFace.getContext('2d'); g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 1040, 1040); g.drawImage(i, 120, 120, 800, 800); g.restore(); /* face fills the image edge-to-edge; the canvas rim + ball track frame it */ });
  if (!rRaf) rRaf = requestAnimationFrame(rFrame); }
function drawFace(g) { const C = 260, R1 = 196, R2 = 150, R3 = 118; g.save(); g.translate(C, C);
  for (let i = 0; i < 37; i++) { const n = RWHEEL[i], a0 = i * SEG - SEG / 2 - Math.PI / 2, a1 = a0 + SEG; g.beginPath(); g.moveTo(Math.cos(a0) * R3, Math.sin(a0) * R3); g.arc(0, 0, R1, a0, a1); g.arc(0, 0, R3, a1, a0, true); g.closePath();
    const gr = g.createRadialGradient(0, 0, R3, 0, 0, R1); const base = n === 0 ? ['#0d8a43', '#06501f'] : RRED.has(n) ? ['#c8102e', '#7a0716'] : ['#26262b', '#0b0b0e']; gr.addColorStop(0, base[1]); gr.addColorStop(.55, base[0]); gr.addColorStop(1, base[1]); g.fillStyle = gr; g.fill();
    g.save(); g.rotate(i * SEG); g.fillStyle = '#f7ecd2'; g.font = 'bold 21px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 0, -(R1 - 22)); g.restore();
    g.strokeStyle = '#d9b45a'; g.lineWidth = 2; g.beginPath(); g.moveTo(Math.cos(a0) * R3, Math.sin(a0) * R3); g.lineTo(Math.cos(a0) * R1, Math.sin(a0) * R1); g.stroke(); }
  g.strokeStyle = '#e8c56a'; g.lineWidth = 3; [R1, R1 - 44, R3].forEach(r => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); });
  const cone = g.createRadialGradient(0, 0, 6, 0, 0, R3); // v0.16.1: rotation-invariant shading; the light is a fixed overlay (drawGlint) cone.addColorStop(0, '#9a6a3a'); cone.addColorStop(.6, '#5a3519'); cone.addColorStop(1, '#2c1608'); g.fillStyle = cone; g.beginPath(); g.arc(0, 0, R3 - 2, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 8; k++) { g.save(); g.rotate(k * Math.PI / 4); g.fillStyle = '#d4a84a33'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R3 - 6, -.18, .18); g.fill(); g.restore(); }
  // turret
  const gold = g.createRadialGradient(0, 0, 4, 0, 0, 80); gold.addColorStop(0, '#f4d77a'); gold.addColorStop(.5, '#d4a52c'); gold.addColorStop(1, '#9a7418'); g.fillStyle = gold;
  for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * Math.PI / 2); g.beginPath(); g.moveTo(-5, 0); g.lineTo(-3, -70); g.arc(0, -72, 7, Math.PI, 0); g.lineTo(5, 0); g.fill(); g.restore(); }
  g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill(); g.restore(); }
// v0.16.1 (fb_b0e04f7725): the specular light on the metal turret and cone is drawn AFTER the rotating face, in screen space, so it stays put
// like a real light source above the table while the wheel turns under it
function drawGlint(g) { g.save(); g.translate(260, 260);
  const c = g.createRadialGradient(-38, -46, 4, -30, -36, 86); c.addColorStop(0, '#ffffff2e'); c.addColorStop(1, '#ffffff00'); g.fillStyle = c; g.beginPath(); g.arc(0, 0, 116, 0, Math.PI * 2); g.fill();
  const h = g.createRadialGradient(-6, -7, 0, -6, -7, 11); h.addColorStop(0, '#fffbe8f2'); h.addColorStop(.45, '#fff3c499'); h.addColorStop(1, '#fff3c400'); g.fillStyle = h; g.beginPath(); g.arc(-6, -7, 11, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#fff6d055'; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, 15, Math.PI * 1.08, Math.PI * 1.42); g.stroke(); g.restore(); }
function drawRim(g) { const C = 260; g.save(); g.translate(C, C);
  const wood = g.createRadialGradient(0, 0, 200, 0, 0, 258); wood.addColorStop(0, '#2a1407'); wood.addColorStop(.25, '#6b3a17'); wood.addColorStop(.7, '#3d1f0b'); wood.addColorStop(1, '#170902'); g.fillStyle = wood; g.beginPath(); g.arc(0, 0, 258, 0, Math.PI * 2); g.fill();
  const track = g.createRadialGradient(0, 0, 196, 0, 0, 236); track.addColorStop(0, '#120a05'); track.addColorStop(.5, '#3a2414'); track.addColorStop(1, '#1b0e05'); g.fillStyle = track; g.beginPath(); g.arc(0, 0, 236, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d4a52c'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 238, 0, Math.PI * 2); g.stroke(); g.strokeStyle = '#d4a52c88'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 252, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; g.fillStyle = '#e9c66a'; g.beginPath(); g.ellipse(Math.cos(a) * 216, Math.sin(a) * 216, 5, 11, a, 0, Math.PI * 2); g.fill(); } // deflectors
  g.restore(); }
function ballAt(g, ang, r, z) { const x = 260 + Math.cos(ang - Math.PI / 2) * r, y = 260 + Math.sin(ang - Math.PI / 2) * r, s = 9 * (z || 1);
  g.fillStyle = '#0008'; g.beginPath(); g.ellipse(x + 3, y + 4, s, s * .8, 0, 0, Math.PI * 2); g.fill();
  const b = g.createRadialGradient(x - s * .35, y - s * .4, 1, x, y, s); b.addColorStop(0, '#fff'); b.addColorStop(.6, '#e6e6e6'); b.addColorStop(1, '#8d8d8d'); g.fillStyle = b; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
// spin: the ball runs counter to the wheel on the outer track, slows, drops off the track after ~62%, rattles over the frets with damped bounces and settles in the result pocket at T
function rouSpin(m) { const now = performance.now(), late = Math.max(0, m.late || 0), total = m.spinMs || 6500, T = Math.max(1500, total - 1300);
  const t0 = now - late, wT = wheelAng(Date.now() - late + T), target = wT + pocketAng(m.result), B0 = target + Math.PI * 2 * 7 + ((Math.random() * Math.PI * 2));
  rSpinS = { t0, T, total, result: m.result, B0, target, seed: Math.random() * 10 }; rRest = null; $('rRes').classList.add('hidden');
  if (late < 300 && !reduced) SFX.flip(); if (late < s0T(m)) RSND.rollStart(); }
const s0T = m => Math.max(1500, (m.spinMs || 6500) - 1300) * .9;
const ease = x => 1 - Math.pow(1 - x, 2.2), smooth = x => x * x * (3 - 2 * x);
function rFrame() { rRaf = requestAnimationFrame(rFrame); if (view !== 'roulette' || !rCtx) { if (RSND.roll) RSND.rollStop(); return; } const g = rCtx, now = performance.now(), wa = wheelAng(Date.now());
  g.setTransform(rScale, 0, 0, rScale, 0, 0); g.clearRect(0, 0, 520, 520); drawRim(g); g.save(); g.translate(260, 260); g.rotate(wa); g.drawImage(rFace, -260, -260, 520, 520); g.restore(); drawGlint(g);
  const RT = 222, RP = 135; let s = rSpinS;
  if (s) { const t = now - s.t0;
    if (t >= s.total + 400 && rou && rou.phase !== 'spinning') { rRest = s.result; rSpinS = s = null; }
    else if (t < s.T) { const x = t / s.T, base = s.B0 + (s.target - s.B0) * ease(x); let r = RT, ang = base, z = 1; RSND.rollSet(Math.pow(1 - x, 1.2) * (x > .62 ? .6 : 1));
      if (x > .62) { const y = (x - .62) / .38, dec = Math.pow(1 - y, 1.6); r = RT - (RT - RP) * smooth(Math.min(1, y * 1.25)) + Math.abs(Math.sin(y * 19 + s.seed)) * 16 * dec; ang = base + Math.sin(y * 23 + s.seed) * SEG * 1.4 * dec; z = 1 + .12 * Math.abs(Math.sin(y * 19 + s.seed)) * dec;
        const ph = Math.floor((y * 19 + s.seed) / Math.PI); if (ph !== rClick && dec > .08) { rClick = ph; RSND.tick(.4 + dec); } }
      ballAt(g, ang, r, z); }
    else { if (!s.dropped) { s.dropped = true; RSND.rollStop(); if (t - s.T < 500) RSND.drop(); } const w = Math.min(1, (t - s.T) / 400); ballAt(g, wa + pocketAng(s.result) + Math.sin(w * 9) * SEG * .12 * (1 - w), RP, 1); } }
  if (!s && rRest !== null) ballAt(g, wa + pocketAng(rRest), RP, 1);
  // round timer
  const tt = rou; if (!tt) return; const bar = $('rBar'), txt = $('rTxt'), box = $('rTimer');
  if (tt.phase === 'betting' && tt.deadline) { const left = Math.max(0, tt.deadline - Date.now()); bar.style.transform = `scaleX(${Math.min(1, left / tt.betMs)})`; const last = left <= 5000; box.classList.toggle('last', last); box.classList.remove('spin');
    txt.textContent = `${last ? 'Last bets!' : 'Place your bets'} · ${Math.ceil(left / 1000)}s`; }
  else if (tt.phase === 'betting') { bar.style.transform = 'scaleX(1)'; box.classList.remove('last', 'spin'); txt.textContent = 'Place a bet to start the round'; }
  else if (tt.phase === 'spinning') { bar.style.transform = 'scaleX(0)'; box.classList.remove('last'); box.classList.add('spin'); txt.textContent = 'No more bets · spinning…'; }
  else { bar.style.transform = 'scaleX(0)'; box.classList.remove('last', 'spin'); txt.textContent = s ? 'No more bets · spinning…' : `${tt.result} ${rColor(tt.result).toUpperCase()}`; } }

// v0.16 table features. Loaded after app.js and uses its globals (table, me, send, renderTable, SFX, tone, muted, reduced, cardHTML, fmt).
//  * Table style setting: 'legacy' (default, untouched) or 'premium'. Premium is a pure reskin. It draws its own layer over the
//    same #felt from the same `table` state the server already sends; the legacy DOM keeps rendering underneath (visibility:hidden),
//    so every mechanic, message and handler stays the legacy one. The choice is saved on the server profile (setProfile.tableSkin),
//    mirrored in localStorage so it applies before the profile arrives.
//  * Premium only: perspective felt + padded rail (runtime SVG sized to the felt), tier palette (emerald / crimson / midnight neon),
//    dealer chip tray in perspective that acts as the house bank (losing bets slide in, payouts come out), every player's bet as a
//    chip pile tinted to that player, back-bet ("behind") piles, framed avatars, totals in pills, status badges, result banners.
//  * Both skins: Rebet (fb_38ee8a6fa1; Rebet x2 button in premium), your-turn chime + haptic (fb_48cf42ebb2, respects mute),
//    blackjack and pair animations (fb_8adb60c243).
(() => {
'use strict';
const SKINS = ['legacy', 'premium'];
let skin = SKINS.includes(localStorage.tableSkin) ? localStorage.tableSkin : 'legacy';
const isP = () => skin === 'premium';
const PAL_OF = id => /platinum|diamond/.test(id || '') ? 'neon' : /silver|gold/.test(id || '') ? 'crimson' : 'emerald';
const PAL = {
  emerald: { felt: ['#1a8a5c', '#0b4a31', '#021a10'], rail: ['#3c3c3c', '#161616', '#030303'], hi: '#9a9a9a', trim: ['#fff1b8', '#d9a83a', '#5c3d07'], glow: '#22f5c8', ink: '#f3cf72', ink2: '#e2b445', apron: ['#101010', '#000'] },
  crimson: { felt: ['#c8343a', '#8e1a22', '#4a070c'], rail: ['#7a4428', '#3a1b0d', '#140703'], hi: '#c98a5e', trim: ['#ffe39a', '#c68d2e', '#6b4310'], glow: null, ink: '#ffe1a0', ink2: '#ffd27a', apron: ['#2a140a', '#0d0502'] },
  neon: { felt: ['#4a3fc4', '#28228a', '#0d0a3a'], rail: ['#4a3d80', '#1c1440', '#06031a'], hi: '#a99cff', trim: ['#ffffff', '#b8b4d8', '#4b4670'], glow: '#ff3df0', glow2: '#3de2ff', ink: '#d7d2ff', ink2: '#7fe8ff', apron: ['#130c2a', '#040110'] } };
const TINT = ['#ff6b81', '#4cc3ff', '#ffd24a', '#7dff9a', '#c08bff']; // per seat: tints that player's chips (ghost tokens)
const TUBE = ['#d23a3a', '#2f6fe0', '#22a35a', '#1d1d1d', '#8a3fe0', '#f08a1c', '#f2f2f2', '#e84aa0']; // tray tubes; chip colour = tier chip index
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const handBet = s => s.hands && s.hands.length ? s.hands.reduce((a, h) => a + h.bet, 0) : s.bet;
const isBJh = (h, single) => single && h.cards.length === 2 && h.score === 21;
// ---------------- setting ----------------
window.setTableSkin = (v, fromServer) => { if (!SKINS.includes(v)) return; const changed = v !== skin; skin = v; localStorage.tableSkin = v;
  if (!fromServer && me) send({ type: 'setProfile', tableSkin: v }); skinLabel(); applySkin(); if (changed && !fromServer) toast(v === 'premium' ? '🎴 Premium table style on' : '🃏 Legacy table style on'); };
window.tableSkin = () => skin;
function skinLabel() { const b = document.getElementById('skinTog'); if (b) b.textContent = `🎴 Table style: ${skin === 'premium' ? 'Premium' : 'Legacy'}`; }
{ const mute = $('mute'); if (mute && !document.getElementById('skinTog')) { const b = document.createElement('button'); b.id = 'skinTog'; b.className = 'tiny'; b.type = 'button'; mute.insertAdjacentElement('afterend', b); b.onclick = () => setTableSkin(skin === 'premium' ? 'legacy' : 'premium'); } skinLabel(); }
const _rp = renderProfile; renderProfile = function () { _rp.apply(this, arguments); if (me && SKINS.includes(me.tableSkin) && me.tableSkin !== skin) setTableSkin(me.tableSkin, true); skinLabel(); };
function applySkin() { const T = $('table'); T.classList.toggle('premium', isP()); ['emerald', 'crimson', 'neon'].forEach(p => T.classList.remove('pal-' + p));
  if (!isP()) { const L = document.getElementById('ptable'); if (L) L.remove(); P.reset(); return; }
  if (table) { T.classList.add('pal-' + PAL_OF(table.tier && table.tier.id)); pRender(table); } }
// ---------------- hooks into the legacy renderer ----------------
// v0.16: a table you only VIEW gets a single table update, rendered before the screen is shown -> render again once it is visible
{ const _show = show; show = function (v) { const was = view; _show.apply(this, arguments); if (v === 'table' && was !== 'table' && isP() && table) try { pRender(table); } catch (e) { console.error('premium', e); } }; }
const _rt = renderTable; renderTable = function () { _rt.apply(this, arguments); try { common(table); if (isP()) { $('table').classList.add('pal-' + PAL_OF(table.tier.id)); pRender(table); const lg = $('log'); if (lg && table.log) lg.innerHTML = table.log.slice(-2).map(l => `<div class="ll">${esc(l)}</div>`).join(''); } } catch (e) { console.error('premium', e); } }; // v0.16: premium log = one element per line so each line can end in an ellipsis
const _fly = flyChip; flyChip = function () { if (isP() && view === 'table') return; return _fly.apply(this, arguments); };
const _fe = floatEmoji; floatEmoji = function (i, emoji, name) { // emoji bubbles rise from the premium avatar when premium is on
  const av = isP() && view === 'table' && i >= 0 && document.querySelector(`#ptable .pseat[data-i="${i}"] .pav`), real = av && $('seat' + i);
  if (!av || !real) return _fe.apply(this, arguments); real.id = 'seat-x'; av.id = 'seat' + i; try { _fe.apply(this, arguments); } finally { av.removeAttribute('id'); real.id = 'seat' + i; } };
{ let rq = 0; const again = () => { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; if (isP() && table && view === 'table') pRender(table); }); };
  addEventListener('resize', again); addEventListener('relayout', again);
  // v0.16.1: re-render whenever the felt's box really changes (whatever caused it), so the table art can never stay drawn for a stale size
  if (window.ResizeObserver) { let last = ''; new ResizeObserver(() => { const f = $('felt'), k = f.clientWidth + 'x' + f.clientHeight; if (k !== last) { last = k; again(); } }).observe($('felt')); } }
// ---------------- both skins: rebet, your-turn cue, blackjack / pair fx ----------------
const lastKey = () => 'cr16rebet:' + (table && table.tier ? table.tier.id : '');
let prevPhase = '', turnKey = '', fxSeen = new Set(), roundNo = 0;
SFX.turn = () => { tone(784, .12, 'triangle', .14); tone(1175, .18, 'triangle', .12, .11); tone(1568, .16, 'sine', .07, .22); };
SFX.bj = () => [659, 784, 988, 1319, 1568].forEach((f, i) => tone(f, .22, 'triangle', .12, i * .07));
function rebet(mult) { const t = table, last = JSON.parse(sessionStorage[lastKey()] || 'null'); const i = t.seats.findIndex(s => s && s.name === me.name), s = t.seats[i];
  if (!last || !s || t.phase !== 'betting') return; const room = Math.max(0, t.tier.max - s.bet); let bet = Math.min(last.bet * mult, room, me.chips); bet = Math.floor(bet);
  if (bet < t.tier.min && s.bet + bet < t.tier.min) return toast(`Not enough chips to rebet ${fmt(last.bet * mult)}`);
  send({ type: 'bet', amount: bet }); const pair = Math.min(last.pair * mult, t.tier.max / 10 - s.pair, me.chips - bet); if (pair > 0) send({ type: 'pair', amount: Math.floor(pair) }); SFX.chip(); }
window.crRebet = rebet;
{ const c = $('clear'), oc = c.onclick; c.onclick = e => c.dataset.rebet ? rebet(1) : oc && oc(e); }
{ const r = $('rebet2'); if (r) r.onclick = () => rebet(2); }
function common(t) {
  const myIdx = t.seats.findIndex(s => s && s.name === me.name), mine = t.seats[myIdx];
  if (prevPhase === 'betting' && t.phase !== 'betting' && mine && mine.bet > 0 && !t.tourney) sessionStorage[lastKey()] = JSON.stringify({ bet: mine.bet, pair: mine.pair || 0 });
  if (t.phase === 'betting' && prevPhase !== 'betting') { fxSeen = new Set(); roundNo++; }
  // rebet: the Clear slot becomes "Rebet <amount>" while you have no bet (both skins; same button, no layout change)
  const last = JSON.parse(sessionStorage[lastKey()] || 'null'), canRe = !!(t.phase === 'betting' && mine && !mine.bet && last && !t.tourney), c = $('clear');
  if (canRe) { c.dataset.rebet = 1; c.textContent = `↻ Rebet ${fmt(last.bet + last.pair)}`; c.disabled = false; } else if (c.dataset.rebet) { delete c.dataset.rebet; c.textContent = 'Clear'; }
  const r2 = $('rebet2'); if (r2) { r2.disabled = !canRe || me.chips < last.bet * 2; r2.textContent = canRe ? `Rebet ×2 ${fmt((last.bet + last.pair) * 2)}` : 'Rebet ×2'; }
  // your turn (each hand, incl. after a split): chime + short vibration, both muted by the sound setting
  const k = t.phase === 'playing' && mine && t.turn === myIdx ? `${roundNo}|${mine.active}|${mine.hands.length}` : '';
  if (k && k !== turnKey) { if (!muted) { SFX.turn(); try { navigator.vibrate && navigator.vibrate([35, 50, 35]); } catch (e) { } } $('table').classList.add('myturn'); }
  if (!k) $('table').classList.remove('myturn'); turnKey = k;
  // blackjack / pair animations
  if (['playing', 'insurance', 'settled', 'dealing'].includes(t.phase)) t.seats.forEach((s, i) => { if (!s || !s.hands || !s.hands.length) return; const h = s.hands[0];
    if (h.cards.length >= 2 && !fxSeen.has('p' + i) && s.hands.length === 1 && h.cards[0].r === h.cards[1].r && h.cards.length === 2) { fxSeen.add('p' + i); if (s.pair) fx('pair', i, s.pair * 11); else fx('pairNo', i); }
    if (isBJh(h, s.hands.length === 1) && !fxSeen.has('b' + i)) { fxSeen.add('b' + i); fx('bj', i, Math.floor(h.bet * 1.5)); } });
  prevPhase = t.phase; }
function fx(kind, i, amt) { const mineSeat = table.seats[i] && table.seats[i].name === me.name;
  if (kind === 'bj' && mineSeat && !muted) SFX.bj(); if (kind === 'pair' && mineSeat && !muted) SFX.win();
  if (isP()) return P.fx(kind, i, amt, mineSeat);
  if (kind === 'pairNo') return; const seat = $('seat' + i); if (!seat) return; const r = seat.getBoundingClientRect(); if (!r.width) return;
  const e = document.createElement('div'); e.className = 'bjfx ' + kind; e.innerHTML = `<b>${kind === 'bj' ? 'BLACKJACK!' : 'PAIR!'}</b>${amt ? `<small>+${fmt(amt)}</small>` : ''}<i></i><i></i><i></i><i></i><i></i><i></i>`;
  e.style.left = r.left + r.width / 2 + 'px'; e.style.top = r.top + r.height * .42 + 'px'; $('fx').appendChild(e); setTimeout(() => e.remove(), reduced ? 1400 : 1900); }
// ---------------- premium layer ----------------
const P = { cards: new Map(), lv: null, lvTier: '', settled: null, pairDone: new Set(), pairHide: new Set(), sz: '', fxQ: [] };
P.reset = () => { P.cards.clear(); P.settled = null; P.sz = ''; };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
function geo(W, H) { const u = clamp(Math.min(W / 400, H / 330), .72, 1.5), g = { W, H, u };
  g.cw = 38 * u; g.ch = 54 * u; g.dcw = 42 * u; g.dch = 60 * u; g.A = 40 * u; g.mw = 22 * u; g.sx = Math.min((W - g.mw) / 5, 112 * u) * .98; // left strip (mw) reserved for the future PAY x2 meter
  g.tray = { w: Math.min(W * .42, 210 * u), h: 32 * u, top: 1 * u }; g.dTop = g.tray.h * .9 + 4 * u; g.dBot = g.dTop + g.dch;
  const nameH = 24 * u; g.port = H > W; // phone portrait felt (landscape / desktop felts are wider than tall) g.strip = 0;
  g.shoe = { x: W - 30 * u, y: g.dTop + 18 * u }; g.discard = { x: 30 * u, y: g.dTop + 18 * u };
  if (g.port) { // v0.16 (Sam): portrait table = much shallower arc; seats, cards, bet + pair circles sit higher, and a dedicated strip below the rail holds chat + the table log
    g.strip = Math.round(clamp(.15 * H, 64, 118)); const R = clamp(H * .055, 14, 34), rx = W * 1.32, ry = H * .9, yFB = H - g.strip, cy = yFB - R - ry; g.rail = { cx: W / 2, cy, rx, ry, R };
    const top = yFB - R * .85 - g.A / 2 - nameH - 2 * u, sag = x => ry * (1 - Math.sqrt(Math.max(0, 1 - ((x - W / 2) / rx) ** 2))); // seats follow the rail's own curve
    g.seats = [0, 1, 2, 3, 4].map(i => { const x = (W + g.mw) / 2 + (i - 2) * g.sx, yAv = top - sag(x), yBet = yAv - g.A / 2 - 17 * u; return { x, yAv, yBet, handBot: yBet - 12 * u }; });
    // felt print sits between the dealer and the highest first-row cards (its lowest ring is drawn at 1.34x the text radius)
    const cardTop = Math.min(...g.seats.map(z => z.handBot)) - g.ch - 4 * u, tr = Math.max(g.dBot + 10 * u - cy, Math.min(g.dBot + .15 * H - cy, (cardTop - cy) / 1.34));
    g.text = { cy, ry: tr, rx: tr * rx / ry * .96 }; }
  else { const base = H - nameH - g.A / 2 - .03 * H, lift = Math.min(.155 * H, 90 * u);
    g.seats = [0, 1, 2, 3, 4].map(i => { const f = [1, .32, 0, .32, 1][i], x = (W + g.mw) / 2 + (i - 2) * g.sx, yAv = base - lift * f, yBet = yAv - g.A / 2 - 17 * u; return { x, yAv, yBet, handBot: yBet - 12 * u }; });
    const rx = W * .74, ry = H * .95, cy = -H * .12; g.rail = { cx: W / 2, cy, rx, ry, R: clamp(H * .055, 14, 34) };
    const textBot = g.dBot + (H > 380 ? .2 : .1) * H; g.text = { cy, ry: textBot - cy, rx: (textBot - cy) * rx / ry * .96 }; }
  g.meter = { x: 4 * u, y: g.dTop + 46 * u, w: 14 * u }; g.meter.h = Math.max(40 * u, g.seats[0].yBet - g.meter.y);
  g.pop = { x: W / 2, y: Math.min(g.dBot + (g.seats[2].handBot - g.ch - g.dBot) / 2, H * .46) };
  return g; }
function feltSVG(g, p) { const { W, H } = g, { cx, cy, rx, ry, R } = g.rail, K = (ry + R) / ry, f = 1 / K, st = o => (f + (1 - f) * o).toFixed(4), P0 = PAL[p], u = g.u;
  const t = g.text, arc = (id, k1, k2) => `<path id="${id}" d="M ${cx - t.rx * k1} ${cy} A ${t.rx * k1} ${t.ry * k2} 0 0 0 ${cx + t.rx * k1} ${cy}" fill="none"/>`;
  const f1 = clamp(15 * u, 10, 24), f2 = clamp(8.5 * u, 6.5, 13), f3 = clamp(9.5 * u, 7, 15);
  return `<svg class="pfeltsvg" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs>
  <radialGradient id="pfF" cx=".5" cy=".38" r=".66"><stop offset="0" stop-color="${P0.felt[0]}"/><stop offset=".62" stop-color="${P0.felt[1]}"/><stop offset="1" stop-color="${P0.felt[2]}"/></radialGradient>
  <linearGradient id="pfR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P0.rail[0]}"/><stop offset=".4" stop-color="${P0.rail[1]}"/><stop offset="1" stop-color="${P0.rail[2]}"/></linearGradient>
  <linearGradient id="pfT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P0.trim[0]}"/><stop offset=".5" stop-color="${P0.trim[1]}"/><stop offset="1" stop-color="${P0.trim[2]}"/></linearGradient>
  <linearGradient id="pfA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P0.apron[0]}"/><stop offset="1" stop-color="${P0.apron[1]}"/></linearGradient>
  <radialGradient id="pfP" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${P0.rail[2]}"/><stop offset="${st(0)}" stop-color="${P0.rail[2]}"/><stop offset="${st(.2)}" stop-color="${P0.rail[1]}"/><stop offset="${st(.44)}" stop-color="${P0.rail[0]}"/><stop offset="${st(.52)}" stop-color="${P0.hi}"/><stop offset="${st(.62)}" stop-color="${P0.rail[0]}"/><stop offset="${st(.86)}" stop-color="${P0.rail[1]}"/><stop offset="1" stop-color="${P0.rail[2]}"/></radialGradient>
  <radialGradient id="pfS" cx=".5" cy=".3" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".17"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="pfB" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="${(6 * u).toFixed(1)}"/></filter>
  ${arc('pfa1', 1, 1)}${arc('pfa2', 1.07, 1.1)}${arc('pfa3', 1.2, 1.26)}</defs>
  <rect width="${W}" height="${H}" fill="url(#pfA)"/>
  <ellipse cx="${cx}" cy="${cy + R * .8}" rx="${rx * K}" ry="${ry * K}" fill="#000" opacity=".75" filter="url(#pfB)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx * K + 4}" ry="${ry * K + 4}" fill="url(#pfT)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx * K}" ry="${ry * K}" fill="url(#pfP)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx + 3}" ry="${ry + 3}" fill="url(#pfT)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#pfF)"/>
  <ellipse cx="${cx}" cy="${H * .26}" rx="${rx * .75}" ry="${ry * .5}" fill="url(#pfS)"/>
  ${P0.glow ? `<ellipse cx="${cx}" cy="${cy}" rx="${rx * K + 2}" ry="${ry * K + 2}" fill="none" stroke="${P0.glow}" stroke-width="2.2" class="pneon"/><ellipse cx="${cx}" cy="${cy}" rx="${rx - 5}" ry="${ry - 5}" fill="none" stroke="${P0.glow2 || P0.glow}" stroke-opacity=".5" stroke-width="1.2"/>` : ''}
  <rect x="0" y="0" width="${W}" height="${6 * u}" fill="url(#pfR)"/><rect x="0" y="${6 * u}" width="${W}" height="${1.6 * u}" fill="url(#pfT)"/>
  <g class="pprint" fill="${P0.ink}"><text font-size="${f1}" class="t1"><textPath href="#pfa1" startOffset="50%" text-anchor="middle">BLACKJACK PAYS 3 TO 2</textPath></text>
  <text font-size="${f2}" class="t2"><textPath href="#pfa2" startOffset="50%" text-anchor="middle">Dealer must draw to 16 and stand on all 17s</textPath></text>
  <path d="M ${cx - t.rx * 1.16} ${cy} A ${t.rx * 1.16} ${t.ry * 1.2} 0 0 0 ${cx + t.rx * 1.16} ${cy} M ${cx - t.rx * 1.28} ${cy} A ${t.rx * 1.28} ${t.ry * 1.34} 0 0 0 ${cx + t.rx * 1.28} ${cy}" fill="none" stroke="${P0.ink2}" stroke-width="1.2" opacity=".75"/>
  <text font-size="${f3}" class="t3" fill="${P0.ink2}"><textPath href="#pfa3" startOffset="50%" text-anchor="middle">◆ INSURANCE PAYS 2 TO 1 ◆</textPath></text></g></svg>`; }
function chipDisc(ci, cls = '') { return `<i class="pchip ${cls}" style="--c:${TUBE[ci % TUBE.length]}"></i>`; }
function breakdown(v, chips) { const out = []; const cs = chips.map((c, i) => [c, i]).reverse(); for (const [c, i] of cs) while (v >= c && out.length < 7) { out.push(i); v -= c; } if (!out.length && v > 0) out.push(0); return out.reverse(); }
function ensureLayer(t) { let L = document.getElementById('ptable'); const f = $('felt');
  if (!L) { L = el('div', 'ptable'); L.id = 'ptable'; L.innerHTML = `<div class="pbg"></div><div class="ptrayw"><div class="ptray"></div></div><div class="pshoe"><i></i><i></i><i></i></div><div class="pdisc"></div><div class="pmeter" data-reserved="payx2" aria-hidden="true"></div>
    <div class="pdealer"><span class="ppill pdpill"></span></div><div class="pseats"></div><div class="pcards"></div><div class="pfx"></div>
    <div class="ppop hidden"><h3>PLACE YOUR BET</h3><div class="pbar"><i></i></div><div class="plim"></div></div><div class="pban hidden"><div class="pburst"></div><b></b><small></small></div>`;
    f.insertBefore(L, f.firstChild); P.cards.clear(); P.sz = '';
    L.addEventListener('click', onClick); }
  return L; }
function trayLevels(t) { const id = t.id + ':' + t.tier.id; if (P.lvTier !== id || !P.lv) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; P.lv = TUBE.map((_, i) => { h = (h * 1103515245 + 12345) | 0; return .32 + ((h >>> 8) % 1000) / 1000 * .6; }); P.lvTier = id; } return P.lv; }
function renderTray(L, g, t) { const tr = L.querySelector('.ptray'), w = L.querySelector('.ptrayw'); w.style.cssText = `left:${g.W / 2 - g.tray.w / 2}px;top:${g.tray.top}px;width:${g.tray.w}px;height:${g.tray.h}px`;
  const lv = trayLevels(t); if (tr.children.length !== TUBE.length) tr.innerHTML = TUBE.map((c, i) => `<div class="ptube" data-t="${i}"><div class="proll" style="--c:${c}"></div></div>`).join('');
  [...tr.children].forEach((tb, i) => tb.firstChild.style.setProperty('--lv', (lv[i] * 100).toFixed(1) + '%')); }
function nudge(i, d) { const lv = P.lv; if (!lv) return; lv[i] = clamp(lv[i] + d, .12, .98); const tb = document.querySelector(`#ptable .ptube[data-t="${i}"] .proll`); if (tb) tb.style.setProperty('--lv', (lv[i] * 100).toFixed(1) + '%'); }
function tubeXY(i) { const L = document.getElementById('ptable'), tb = L && L.querySelector(`.ptube[data-t="${i}"] .proll`); if (!tb) return [0, 0]; const r = tb.getBoundingClientRect(), lr = L.getBoundingClientRect(); return [r.left + r.width / 2 - lr.left, r.top - lr.top + 2]; }
function flyChips(list, from, to, done, opt = {}) { // list of chip colour indexes; from/to: [x,y] or fn(i)
  const L = document.getElementById('ptable'); if (!L || reduced) { done && done(); return; } const fx = L.querySelector('.pfx'); let left = list.length; if (!left) { done && done(); return; }
  list.forEach((ci, k) => { const a = typeof from === 'function' ? from(ci) : from, b = typeof to === 'function' ? to(ci) : to, c = el('i', 'pfly pchip'); c.style.setProperty('--c', TUBE[ci % TUBE.length]); fx.appendChild(c);
    const dl = k * 70 + (opt.delay || 0), s = opt.s || 1; c.style.left = '0px'; c.style.top = '0px';
    c.animate([{ transform: `translate(${a[0]}px,${a[1]}px) scale(${s})`, opacity: 0 }, { opacity: 1, offset: .08 }, { transform: `translate(${(a[0] + b[0]) / 2}px,${Math.min(a[1], b[1]) - 26 * (opt.u || 1)}px) scale(${s * 1.12})`, offset: .5 }, { transform: `translate(${b[0]}px,${b[1]}px) scale(${s * .9})`, opacity: 1 }],
      { duration: opt.dur || 560, delay: dl, easing: 'cubic-bezier(.35,.1,.3,1)', fill: 'both' }).onfinish = () => { c.remove(); opt.each && opt.each(ci); if (!--left) done && done(); }; }); }
function pileHTML(v, chips, tint, mine, cls = '') { if (!v) return ''; const b = breakdown(v, chips); return `<div class="ppile ${cls} ${mine ? 'mine' : 'ghost'}" style="--tint:${tint}"><div class="pring"></div>${b.map((ci, k) => `<i class="pchip" style="--c:${TUBE[ci % TUBE.length]};--k:${k}"></i>`).join('')}<b>${fmt(v)}</b></div>`; }
function status(t, s, i) { if (!s.hands || !s.hands.length) return s.ready && t.phase === 'betting' ? 'READY' : '';
  if (t.phase === 'settled') return (s.result || '').split('/').map(r => r === 'BLACKJACK' && s.hands.length === 1 ? 'BLACKJACK' : r === 'SURRENDER' ? 'SURR' : r).join(' · ');
  if (s.hands.length === 1) { const h = s.hands[0]; if (isBJh(h, true)) return 'BLACKJACK'; if (h.score > 21) return 'BUST'; if (h.bet > s.bet && h.done) return 'DOUBLE'; if (h.done && t.turn !== i) return 'STAND'; if (t.turn === i && t.phase === 'playing') return ''; return ''; }
  return t.turn === i && t.phase === 'playing' ? 'SPLIT' : s.hands.every(h => h.done) ? 'STAND' : 'SPLIT'; }
const badgeCls = s => /BLACKJACK/.test(s) ? 'bj' : /WIN/.test(s) ? 'win' : /BUST|LOSE/.test(s) ? 'lose' : /PUSH/.test(s) ? 'push' : /READY/.test(s) ? 'ready' : 'std';
function pRender(t) { if (view !== 'table' && !$('table').offsetParent) return; const f = $('felt'), W = f.clientWidth, H = f.clientHeight; if (!W || !H) return;
  const L = ensureLayer(t), g = geo(W, H), pal = PAL_OF(t.tier.id), myIdx = t.seats.findIndex(s => s && s.name === me.name);
  f.classList.toggle('pstrip', !!g.strip); f.style.setProperty('--pstrip', g.strip + 'px');
  const sz = `${W}x${H}:${pal}`; if (P.sz !== sz) { P.sz = sz; L.querySelector('.pbg').innerHTML = feltSVG(g, pal); }
  L.style.setProperty('--u', g.u); L.style.setProperty('--cw', g.cw + 'px'); L.style.setProperty('--dcw', g.dcw + 'px'); L.dataset.pal = pal;
  renderTray(L, g, t);
  { const m = L.querySelector('.pmeter'); m.style.cssText = `left:${g.meter.x}px;top:${g.meter.y}px;width:${g.meter.w}px;height:${g.meter.h}px`; } // reserved, empty until PAY x2 ships
  const sh = L.querySelector('.pshoe'); sh.style.left = g.shoe.x + 'px'; sh.style.top = g.shoe.y + 'px'; const dc = L.querySelector('.pdisc'); dc.style.left = g.discard.x + 'px'; dc.style.top = g.discard.y + 'px';
  // phase transitions: new round clears settle state; cards from last round slide to the discard pile
  if (t.phase === 'betting' && P.phase && P.phase !== 'betting') { for (const [k, c] of P.cards) { c.el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${g.discard.x - c.x - g.cw / 2}px,${g.discard.y - c.y - g.ch / 2}px) rotate(-14deg) scale(.6)`, opacity: 0 }], { duration: reduced ? 1 : 420, easing: 'ease-in', fill: 'forwards' }).onfinish = () => c.el.remove(); } P.cards.clear(); P.settled = null; P.pairDone.clear(); P.pairHide.clear(); }
  // ---- cards ----
  const want = new Map();
  const dN = t.dealer.length, dw = g.dcw, dstep = Math.min(dw * .55, dN > 1 ? (g.sx * 1.6 - dw) / (dN - 1) : 0), dx0 = W / 2 - (dw + dstep * (dN - 1)) / 2;
  t.dealer.forEach((c, j) => want.set('d' + j, { c, x: dx0 + j * dstep, y: g.dTop, w: dw, h: g.dch, z: 10 + j, full: 1 }));
  const dp = L.querySelector('.pdpill'), hid = t.dealer.some(c => c.r === '?'); dp.textContent = dN ? (hid ? '' : '') + (t.dealerSoft && t.dealerScore < 21 && !hid ? `${t.dealerScore - 10}/${t.dealerScore}` : t.dealerScore) : ''; dp.className = 'ppill pdpill' + (dN ? ' show' : '') + (t.dealerScore > 21 ? ' bust' : '');
  dp.style.left = dx0 - 6 * g.u + 'px'; dp.style.top = g.dTop + g.dch / 2 + 'px';
  t.seats.forEach((s, i) => { if (!s || !s.hands) return; const G = g.seats[i], n = s.hands.length, sf = n > 1 ? .8 : 1, w = g.cw * sf, h = g.ch * sf, rowStep = h * .6;
    s.hands.forEach((hd, k) => { const cn = hd.cards.length, maxRow = g.sx * .94, step = Math.min(w * .44, cn > 1 ? (maxRow - w) / (cn - 1) : 0), x0 = G.x - (w + step * (cn - 1)) / 2 + (n > 1 ? 6 * g.u : 0), y = G.handBot - h - k * rowStep;
      hd.cards.forEach((c, j) => want.set(`s${i}h${k}c${j}`, { c, x: x0 + j * step, y, w, h, z: 100 - k * 10 + j, si: i, hk: k })); }); });
  const layer = L.querySelector('.pcards'); let deal = 0;
  for (const [k, c] of P.cards) if (!want.has(k)) { c.el.remove(); P.cards.delete(k); }
  for (const [k, wv] of want) { let c = P.cards.get(k); const face = wv.c.r === '?' ? '?' : wv.c.r + wv.c.s;
    if (!c) { const e = el('div', 'pcard' + (wv.full ? ' full' : ' mini')); e.innerHTML = cardHTML(wv.c, ''); layer.appendChild(e); c = { el: e, face }; P.cards.set(k, c);
      e.style.cssText = `left:${wv.x}px;top:${wv.y}px;width:${wv.w}px;height:${wv.h}px;z-index:${wv.z}`;
      if (!reduced) { const from = /h[1-3]c0$/.test(k) ? P.cards.get(k.replace(/h(\d)c0$/, 'h0c1')) : null, fx0 = from ? from.x : g.shoe.x - wv.w / 2, fy0 = from ? from.y : g.shoe.y - wv.h / 2;
        e.animate([{ transform: `translate(${fx0 - wv.x}px,${fy0 - wv.y}px) rotate(${from ? 0 : -24}deg) scale(${from ? 1 : .5})`, opacity: from ? 1 : .2 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: deal++ * 90, easing: 'cubic-bezier(.2,.85,.3,1)', fill: 'backwards' }); } }
    else { if (c.face !== face) { const e = c.el; c.face = face; if (!reduced) e.animate([{ transform: 'perspective(400px) rotateY(0)' }, { transform: 'perspective(400px) rotateY(90deg)', offset: .5 }, { transform: 'perspective(400px) rotateY(0)' }], 420); setTimeout(() => { e.innerHTML = cardHTML(wv.c, ''); }, reduced ? 0 : 210); }
      const st = c.el.style; st.left = wv.x + 'px'; st.top = wv.y + 'px'; st.width = wv.w + 'px'; st.height = wv.h + 'px'; st.zIndex = wv.z; c.el.classList.toggle('mini', !wv.full); }
    c.x = wv.x; c.y = wv.y; }
  // ---- seats ----
  const SE = L.querySelector('.pseats'); if (SE.children.length !== 5) SE.innerHTML = [0, 1, 2, 3, 4].map(i => `<div class="pseat" data-i="${i}"></div>`).join('');
  const sv = P.settled; t.seats.forEach((s, i) => { const G = g.seats[i], E = SE.children[i], mine = i === myIdx, tint = TINT[i];
    E.style.cssText = `left:${G.x}px;--tint:${tint}`; E.className = 'pseat' + (s ? '' : ' empty') + (mine ? ' me' : '') + (s && t.turn === i && t.phase === 'playing' ? ' turn' : '') + (s && s.away ? ' away' : '');
    if (!s) { const o = Seats.open(t, i); E.classList.add(...o.cls.split(' ')); if (o.attr) E.dataset.sit = i; else delete E.dataset.sit; // v0.16: tap an open seat to sit / move
      E.innerHTML = `<div class="pspot" style="top:${G.yBet}px"></div><div class="pspot pair" style="top:${G.yBet + 3 * g.u}px;left:${27 * g.u}px"><span>P</span></div><div class="popen" style="top:${G.yAv}px">${o.label === 'Open' ? (myIdx >= 0 ? 'OPEN' : 'SIT') : o.label.toUpperCase()}</div>`; return; }
    delete E.dataset.sit;
    const st = status(t, s, i), main = sv && sv[i] ? sv[i].main : handBet(s), pairV = sv && sv[i] ? sv[i].pair : (P.pairHide.has(i) ? 0 : s.pair), backsV = (s.backs || []).reduce((a, b) => a + (sv && sv[i] && sv[i].backsGone ? 0 : b.amt), 0);
    const iBack = (s.backs || []).some(b => b.name === me.name), canBack = t.phase === 'betting' && !mine && myIdx >= 0 && !t.tourney && s.bet > 0;
    const pills = s.hands.map((hd, k) => { if (!hd.cards.length) return ''; const n = s.hands.length, sf = n > 1 ? .8 : 1, y = G.handBot - g.ch * sf - k * g.ch * sf * .6, act = t.turn === i && s.active === k && t.phase === 'playing';
      const txt = t.phase === 'settled' && hd.result && n > 1 ? (hd.result === 'BLACKJACK' ? 'BJ' : hd.result.slice(0, 4)) : (isBJh(hd, n === 1) ? 'BJ' : hd.soft && hd.score < 21 ? `${hd.score - 10}/${hd.score}` : hd.score);
      const cls = hd.score > 21 ? 'bust' : isBJh(hd, n === 1) ? 'bj' : hd.score === 21 ? 'tw' : '';
      return n > 1 ? `<span class="ppill show sm ${cls} ${act ? 'act' : ''}" style="left:${-g.sx * .47}px;top:${y + g.ch * sf * .3}px">${txt}</span>` : `<span class="ppill show ${cls} ${act ? 'act' : ''}" style="top:${y - 10 * g.u}px">${txt}</span>`; }).join('');
    E.innerHTML = `<div class="pspot ${mine && t.phase === 'betting' ? 'tap' : ''}" data-spot="${i}" style="top:${G.yBet}px">${pileHTML(main, t.tier.chips, tint, mine)}</div>
      ${true ? `<div class="pspot pair ${mine && t.phase === 'betting' && s.bet ? 'tap' : ''}" data-pair="${i}" style="top:${G.yBet + 3 * g.u}px;left:${27 * g.u}px">${pairV ? pileHTML(pairV, t.tier.chips, tint, mine, 'sm') : '<span>P</span>'}</div>` : ''}
      ${backsV || canBack ? `<div class="pspot behind ${canBack ? 'tap' : ''} ${iBack ? 'mineb' : ''}" data-behind="${i}" style="top:${G.yBet + 3 * g.u}px;left:${-27 * g.u}px">${backsV ? (s.backs || []).map((b, k) => { const bi = t.seats.findIndex(x => x && x.name === b.name); return pileHTML(b.amt, t.tier.chips, TINT[bi] || '#fff', b.name === me.name, 'sm k' + k); }).join('') : '<span>🎯</span>'}</div>` : ''}
      ${pills}
      <div class="pav" data-av="${i}" style="top:${G.yAv}px"><div class="pring2"></div><div class="pframe"><img src="${avUrl(s.avatar)}" alt=""></div>${s.vip ? `<span class="pvip v-${s.vip}">♛</span>` : ''}${st ? `<span class="pbadge ${badgeCls(st)}">${st}</span>` : ''}${s.ready && t.phase === 'betting' ? '<span class="prdy">✓</span>' : ''}</div>
      <div class="pwho" style="top:${G.yAv + g.A / 2 + 2 * g.u}px"><b>${s.away ? '📴' : ''}${esc(s.display || s.name)}</b><span>${fmt(s.chips)}</span></div>`; });
  // ---- bet popup / timer ----
  const pop = L.querySelector('.ppop'), showPop = t.phase === 'betting' && !t.tourney && myIdx >= 0 && !(myIdx >= 0 && t.seats[myIdx].bet > 0 && t.seats[myIdx].ready);
  pop.classList.toggle('hidden', !showPop); pop.style.left = g.pop.x + 'px'; pop.style.top = g.pop.y + 'px';
  pop.querySelector('.plim').innerHTML = `<span>BET</span><b>${fmt(t.tier.min)} ~ ${fmt(t.tier.max)}</b><span>PAIR</span><b>up to ${fmt(t.tier.max / 10)}</b>`;
  // ---- settle: house bank collects losing bets into the tray, pays winners out of it ----
  if (t.phase === 'settled' && !P.settled) settleAnim(t, g);
  if (t.phase !== 'settled' && t.phase !== 'betting') pairAnim(t, g);
  P.phase = t.phase; P.g = g; tick(); }
function spotXY(i, kind) { const g = P.g, G = g.seats[i]; return kind === 'pair' ? [G.x + 27 * g.u, G.yBet + 3 * g.u] : kind === 'behind' ? [G.x - 27 * g.u, G.yBet + 3 * g.u] : [G.x, G.yBet]; }
function avXY(i) { const G = P.g.seats[i]; return [G.x, G.yAv]; }
function pairAnim(t, g) { t.seats.forEach((s, i) => { if (!s || !s.pair || P.pairDone.has(i) || !s.hands || !s.hands[0] || s.hands[0].cards.length < 2) return; P.pairDone.add(i);
  // any seat: a hit is paid 11:1 out of the dealer tray onto the PAIR circle, then stake + win go to that player; a miss slides into the tray
  const c = s.hands[0].cards, b = breakdown(s.pair, t.tier.chips), hide = () => { P.pairHide.add(i); redrawPiles(); };
  if (c[0].r === c[1].r) { const win = breakdown(s.pair * 11, t.tier.chips); setTimeout(() => flyChips(win, tubeXY, spotXY(i, 'pair'), () => { hide(); flyChips(b.concat(win).slice(0, 8), spotXY(i, 'pair'), avXY(i), null, { u: g.u }); }, { u: g.u, s: .8, each: ci => nudge(ci, -.02) }), 500); }
  else setTimeout(() => { hide(); flyChips(b, spotXY(i, 'pair'), tubeXY, null, { u: g.u, s: .8, each: ci => nudge(ci, .02) }); }, 700); }); }
function settleAnim(t, g) { const sv = P.settled = {}; const myIdx = t.seats.findIndex(s => s && s.name === me.name); let myNet = null, myRes = [];
  t.seats.forEach((s, i) => { if (!s || !s.hands || !s.hands.length) return; const bet = handBet(s); sv[i] = { main: bet, pair: 0 }; let pay = 0;
    s.hands.forEach(h => { pay += h.result === 'BLACKJACK' ? h.bet * 2.5 : h.result === 'WIN' ? h.bet * 2 : h.result === 'PUSH' ? h.bet : h.result === 'SURRENDER' ? h.bet / 2 : 0; });
    pay = Math.floor(pay); const lost = bet - Math.min(bet, pay), won = Math.max(0, pay - bet), from = spotXY(i), b = c => breakdown(c, t.tier.chips);
    if (i === myIdx) { myNet = pay - bet; myRes = s.hands.map(h => h.result); }
    setTimeout(() => { if (P.settled !== sv) return;
      if (lost) { flyChips(b(lost), from, tubeXY, () => { if (P.settled !== sv) return; sv[i].main = pay; redrawPiles(); }, { u: g.u, each: ci => nudge(ci, .025) }); if (!pay) { sv[i].main = 0; redrawPiles(); } else { sv[i].main = pay; redrawPiles(); } }
      if (won) flyChips(b(won), tubeXY, from, () => { if (P.settled !== sv) return; sv[i].main = pay; redrawPiles(); setTimeout(() => collect(i, sv, pay), 650); }, { u: g.u, each: ci => nudge(ci, -.025) });
      else if (pay) setTimeout(() => collect(i, sv, pay), 900); }, 250 + i * 120);
    // back bets on this seat: each backer's pile is collected or paid by the bank, then goes to the backer
    const br = s.backResult || {}; if ((s.backs || []).length) setTimeout(() => { if (P.settled !== sv) return; sv[i].backsGone = 1; redrawPiles();
      (s.backs || []).forEach(bk => { const r = br[bk.name] || 0, bi = t.seats.findIndex(x => x && x.name === bk.name), to = bi >= 0 ? avXY(bi) : spotXY(i, 'behind');
        if (r < 0) flyChips(b(-r), spotXY(i, 'behind'), tubeXY, null, { u: g.u, s: .8, each: ci => nudge(ci, .015) }); else flyChips(b(bk.amt + r), r > 0 ? tubeXY : spotXY(i, 'behind'), to, null, { u: g.u, s: .8 }); }); }, 450 + i * 120); });
  if (myNet !== null) setTimeout(() => { const d = t.dealerScore; if (myRes.includes('BLACKJACK') && myRes.length === 1) banner('BLACKJACK!', '+' + fmt(myNet), 'bj'); else if (myNet > 0) banner(d > 21 ? 'DEALER BUST' : 'YOU WIN', '+' + fmt(myNet), 'win');
    else if (myNet === 0) banner('PUSH', 'bet returned', 'push'); else if (myRes.every(r => r === 'BUST')) banner('BUST', '-' + fmt(-myNet), 'bust'); else banner('DEALER WINS', '-' + fmt(-myNet), 'lose'); }, 200); }
function collect(i, sv, amt) { if (P.settled !== sv || !amt) return; const t = table; sv[i].main = 0; redrawPiles(); flyChips(breakdown(amt, t.tier.chips), spotXY(i), avXY(i), null, { u: P.g.u }); }
function redrawPiles() { if (table && isP()) pRender(table); }
function banner(txt, sub, kind) { const b = document.querySelector('#ptable .pban'); if (!b) return; b.className = 'pban ' + kind; b.querySelector('b').textContent = txt; b.querySelector('small').textContent = sub || '';
  b.style.left = P.g.W / 2 + 'px'; b.style.top = P.g.pop.y + 'px'; void b.offsetWidth; b.classList.add('go'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.add('hidden'), 2300);
  if ((kind === 'bj' || kind === 'win') && !reduced) shower(kind === 'bj' ? 22 : 10); }
function shower(n) { const L = document.getElementById('ptable'); if (!L) return; const fx = L.querySelector('.pfx'), g = P.g;
  for (let k = 0; k < n; k++) { const c = el('i', 'pchip pcoin'); c.style.setProperty('--c', TUBE[k % 6]); fx.appendChild(c); const x = g.W / 2 + (Math.random() - .5) * g.W * .7, y = g.pop.y - 30 * g.u;
    c.animate([{ transform: `translate(${g.W / 2}px,${y}px) scale(.3)`, opacity: 0 }, { transform: `translate(${(x + g.W / 2) / 2}px,${y - 60 * g.u}px) scale(1.1) rotateY(180deg)`, opacity: 1, offset: .25 }, { transform: `translate(${x}px,${g.H * .9}px) scale(.9) rotateY(720deg)`, opacity: 0 }], { duration: 1500, delay: Math.random() * 300, easing: 'cubic-bezier(.3,0,.7,1)' }).onfinish = () => c.remove(); } }
P.fx = (kind, i, amt, mineSeat) => { if (kind === 'pairNo') return; const L = document.getElementById('ptable'); if (!L || !P.g) return; const G = P.g.seats[i], e = el('div', 'pfxtag ' + kind, `<b>${kind === 'bj' ? 'BLACKJACK!' : 'PAIR!'}</b>${amt ? `<small>+${fmt(amt)}</small>` : ''}`);
  e.style.left = G.x + 'px'; e.style.top = (G.handBot - P.g.ch - 22 * P.g.u) + 'px'; L.querySelector('.pfx').appendChild(e); setTimeout(() => e.remove(), 1900);
  if (mineSeat && kind === 'pair') banner('PAIR!', '+' + fmt(amt), 'win'); };
function onClick(e) { const t = table; if (!t) return; const sp = e.target.closest('[data-spot],[data-pair],[data-behind],[data-av]'); if (!sp) return; const myIdx = t.seats.findIndex(s => s && s.name === me.name);
  if (sp.dataset.av !== undefined) { const s = t.seats[+sp.dataset.av]; if (s) openCard(s.name); return; }
  if (t.phase !== 'betting') return;
  if (sp.dataset.spot !== undefined && +sp.dataset.spot === myIdx) { send({ type: 'bet', amount: betAmt() }); SFX.chip(); flyChips(breakdown(betAmt(), t.tier.chips).slice(0, 3), [P.g.W / 2, P.g.H], spotXY(myIdx), null, { u: P.g.u }); }
  else if (sp.dataset.pair !== undefined && +sp.dataset.pair === myIdx) { if (!$('pairBtn').disabled) $('pairBtn').click(); else toast('Place a main bet before the pair side bet'); }
  else if (sp.dataset.behind !== undefined) { const s = t.seats[+sp.dataset.behind]; if (!s || myIdx < 0) return; const amt = Math.max(t.tier.min, betAmt()); send({ type: 'backBet', target: s.name, amount: amt }); toast(`🎯 Backing ${s.display || s.name} with ${fmt(amt)}`); } }
// timers: bet popup bar and the turn ring follow the server deadline
function tick() { const t = table, L = document.getElementById('ptable'); if (!t || !L || !isP()) return; const left = t.deadline - (Date.now() + clockSkew);
  const pop = L.querySelector('.ppop'); if (!pop.classList.contains('hidden')) { const on = t.phase === 'betting' && left > 0, p = on ? clamp(left / (t.betMs || 12000), 0, 1) : 1; pop.querySelector('.pbar i').style.transform = `scaleX(${p})`; pop.classList.toggle('hurry', on && left < 4000); pop.classList.toggle('idle', !on);
    pop.querySelector('h3').textContent = on ? `PLACE YOUR BET · ${Math.ceil(left / 1000)}s` : 'PLACE YOUR BET'; }
  const r = L.querySelector('.pseat.turn .pring2'); if (r) { const p = t.phase === 'playing' && left > 0 ? clamp(left / (t.turnMs || 20000), 0, 1) : 0; r.style.setProperty('--p', (p * 360).toFixed(0) + 'deg'); r.classList.toggle('hurry', left < 5000); } }
setInterval(tick, 200);
applySkin();
})();

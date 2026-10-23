const $ = id => document.getElementById(id), M = 1e6;
const fmt = n => n >= 1e9 ? +(n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? +(n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? +(n / 1e3).toFixed(1) + 'K' : '' + n;
const esc = x => String(x).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const avUrl = i => { const A = (window.BJ_CONFIG && BJ_CONFIG.assets.avatars) || []; return A.length ? A[(+i || 0) % A.length] : `assets/img/avatar${(+i || 0) % 8}.webp`; };
let clockSkew = 0; if (localStorage.token) document.body.classList.add('booting');
var ws, me = null, table = null, reactions = [], retry = 0, pingT, cfg = { ads: { provider: 'stub' } };
let inviteCode = new URLSearchParams(location.search).get('t'), eventCode = new URLSearchParams(location.search).get('e');
// Room intent: the room the player chose to be in ('bj' | 'craps' | 'coin' | 'slots' | 'none'; '' = fresh tab, accept whatever the server restores).
// Room updates that don't match the intent are stale (in flight while leaving, or a seat the server restored on reconnect) and are ignored, never shown.
let room = sessionStorage.room || '', roomAt = 0;
function setRoom(r) { room = sessionStorage.room = r; roomAt = Date.now(); }
const INTENT = { join: 'bj', create: 'bj', crapsJoin: 'craps', coinJoin: 'coin', rouJoin: 'roulette', slotsJoin: 'slots', leave: 'none', crapsLeave: 'none', coinLeave: 'none', rouLeave: 'none' };
let rou = null; // roulette table view (public/roulette.js)
// v0.15.2: every room intent carries a sequence number (rq) that the server echoes on its leave replies, so a late "you're in the lobby" reply
// to an earlier leave can't cancel a join tapped after it (was a 1.5s time guess -> missed joins on slow links). Messages sent while the socket
// is down are queued and flushed after the next login instead of being dropped silently.
let authed = false, rqSeq = 0, lastIntentRq = 0, outbox = [], pendingJoin = null; const JOINS = { join: 'table', create: 'table', crapsJoin: 'craps', rouJoin: 'roulette', coinJoin: 'coin', eventJoin: null };
const QUEUE = /^(join|create|crapsJoin|rouJoin|coinJoin|view|rejoin|sit|leave|crapsLeave|rouLeave|coinLeave|action|insurance|bet|deal|clear|crapsBet|crapsRoll|crapsClear|rouBet|rouUndo|rouClear|rouRebet|coinBet|eventJoin)$/;
// v0.16: view / rejoin {game} are room intents too (game ids match room ids); sit carries an rq so its refusal can be matched
const intentOf = o => INTENT[o.type] || ((o.type === 'view' || o.type === 'rejoin') && VIEW_OF[o.game] ? o.game : null), VIEW_OF = { bj: 'table', craps: 'craps', roulette: 'roulette', coin: 'coin' };
const send = o => { const it = o && intentOf(o); if (it && !(o.type === 'leave' && o.resync)) { if (o.type === 'join' || o.type === 'create' || o.type === 'view') prevRoom = room; setRoom(o.quiet && o.type === 'leave' ? room : it); }
  if (o && o.type === 'leave' && o.resync) o.rq = ++rqSeq; else if (o && (it || o.type === 'eventJoin')) { o.rq = lastIntentRq = ++rqSeq; } // v0.16: a background resync is not a user intent, so it must not make the reply to the user's own leave look stale else if (o && o.type === 'sit') o.rq = ++rqSeq;
  if (o && (o.type in JOINS || o.type === 'view' || o.type === 'rejoin')) joinStart(o);
  if (ws && ws.readyState === 1 && (authed || !QUEUE.test(o.type))) return ws.send(JSON.stringify(o));
  if (o && QUEUE.test(o.type)) { outbox = outbox.filter(x => x.type !== o.type || o.type === 'crapsBet' || o.type === 'rouBet' || o.type === 'coinBet'); outbox.push(o); outbox = outbox.slice(-12); if (view !== 'login') toast('Reconnecting… your tap will be sent'); }
  return false; };
function flushOutbox() { const q = outbox; outbox = []; q.forEach((o, i) => setTimeout(() => ws && ws.readyState === 1 && ws.send(JSON.stringify(o)), 60 * i)); }
// join ack: the room view arriving (or a refusal/error) ends it; no answer in 6s -> re-send once (server join is idempotent), then say so
function joinStart(o) { const want = JOINS[o.type] !== undefined ? JOINS[o.type] : VIEW_OF[o.game]; const pj = pendingJoin = { o, want, at: Date.now(), tries: 1 }; document.body.classList.add('joining');
  clearTimeout(joinStart.t1); joinStart.t1 = setTimeout(() => { if (pendingJoin === pj) toast('Joining…'); }, 900);
  const chk = () => { if (pendingJoin !== pj) return; if (pj.tries < 2) { pj.tries++; ws && ws.readyState === 1 && ws.send(JSON.stringify(o)); pj.timer = setTimeout(chk, 6000); } else { joinDone(); toast("Couldn't join — check your connection and tap again"); } };
  pj.timer = setTimeout(chk, 6000); }
function joinDone() { if (pendingJoin) clearTimeout(pendingJoin.timer); pendingJoin = null; clearTimeout(joinStart.t1); document.body.classList.remove('joining'); }
setInterval(() => { if (pendingJoin && pendingJoin.want && view === pendingJoin.want) joinDone(); }, 150);
let prevRoom = '', resyncAt = 0;
// a stray room update arrived: drop it, and if we're meant to be out of every room, tell the server once (quietly, so the current screen stays put)
function stray(kind) { if (room === kind || room === '') { if (room === '') setRoom(kind); return false; }
  if ((room === 'none' || room === 'slots') && Date.now() - resyncAt > 1500) { resyncAt = Date.now(); send({ type: 'leave', quiet: true, resync: true }); } return true; }
const roomView = () => table ? 'table' : craps ? 'craps' : coin ? 'coin' : rou ? 'roulette' : room === 'slots' ? 'slots' : 'lobby';
function toast(t) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(e.t); e.t = setTimeout(() => e.style.display = 'none', 2600); }
let view = 'login'; function show(v) { view = v; if (v === 'lobby' && typeof lobbyLocks === 'function') lobbyLocks(); ['login', 'lobby', 'table', 'profile', 'craps', 'slots', 'coin', 'roulette', 'devlog'].forEach(x => $(x).classList.toggle('hidden', x !== v)); $('msgr').classList.toggle('hidden', !me || v === 'login'); $('msgBtn').classList.toggle('hidden', !me); $('frBtn').classList.toggle('hidden', !me); placeChat(v); window.Seats && Seats.pill(); if (me && typeof renderQuick === 'function') renderQuick(); }
// Layout mode + app height. The on-screen keyboard must never reflow the game: while a text field has focus the app keeps its height and layout
// class (the keyboard overlays the bottom; the chat bar is glued above it), so a portrait phone with the keyboard up (e.g. 412x397) never flips into the landscape layout.
const typingNow = () => { const e = document.activeElement; return !!e && (e.tagName === 'TEXTAREA' || (e.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit)$/.test(e.type))); };
let layoutKey = ''; var wide = false, chatReady = false;
function layoutMode() { const w = appW || innerWidth, h = appH || innerHeight, b = document.body; /* stable size, never the keyboard-shrunk viewport */ const land = w > h && h <= 500, wide = w >= 1000 && h >= 600, tall = !land && h >= 760, tabp = !wide && !land && w >= 700 && h > w;
  const k = [land, wide, tall, tabp].join(); if (k === layoutKey) return; layoutKey = k; b.classList.toggle('land', land); b.classList.toggle('wide', wide); b.classList.toggle('tall', tall); b.classList.toggle('tabp', tabp);
  if (typeof wideChanged === 'function') wideChanged(wide); }
let appH = 0;
// v0.16.1: dev-only layout-slot guard (docs/UI-STABILITY.md); never loaded unless the URL has ?devlayout=1
if (/[?&]devlayout=1\b/.test(location.search)) { const s = document.createElement('script'); s.src = '/devlayout.js'; document.head.appendChild(s); }
const touchUI = () => matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
// v0.16.1 (fb_29b8a29b0c, fb_c1cb14ed17, fb_379bd922ee): the on-screen keyboard must never re-layout the game. On touch screens a height drop at the
// same width is treated as the keyboard (frozen at the stable height) while a text field has focus, and also for 1.5s after it loses focus
// (sending a message / opening the emoji picker blurs the field while the keyboard is still animating closed). Only a shrink that outlives
// that (split-screen, a real window resize) is applied. Width changes (rotation) and growth always apply at once.
let appW = 0, shrinkT = 0, blurAt = -1e9; document.addEventListener('focusout', e => { const t = e.target; if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit)$/.test(t.type)))) blurAt = performance.now(); }, true);
function applyVV(h) { appH = h; appW = innerWidth; document.documentElement.style.setProperty('--vh', h + 'px'); if (document.body) layoutMode(); window.dispatchEvent(new Event('relayout')); }
// v0.16.2 root fix (fb_1b0dc420bf, fb_67eae0d751, fb_61a334d91e): on touch screens the app height is the largest innerHeight seen at the current
// width + orientation. It is reset only by a width/orientation change and only ever grows otherwise (URL bar hiding); keyboard, visualViewport and
// any other height-only shrink never touch the layout. Desktop (no touch) follows real window resizes. Shared by every game (bj, roulette, craps, coin).
let appO = '';
function fitVV() { const h = innerHeight, w = innerWidth, o = w > h ? 'l' : 'p'; clearTimeout(shrinkT);
  if (!touchUI()) { if (h !== appH || w !== appW) applyVV(h); }
  else if (!appH || w !== appW || (o !== appO && !typingNow())) { appO = o; applyVV(h); }
  else if (h > appH && !typingNow()) applyVV(h);
  window.scrollTo(0, 0); }
document.addEventListener('focusout', () => setTimeout(fitVV, 350));
// v0.15: on-screen keyboard inset (interactive-widget=overlays-content means the page is NOT resized): modals shrink above the keyboard instead of
// the browser panning the whole game up/down; the game layout underneath never moves.
// v0.15.1 (fb_958881a643): keyboard height from the VirtualKeyboard API (opted in explicitly), else the visual viewport; on Android builds that
// report neither while the keyboard overlays the page, fall back to an estimate (42% of the screen) once a text field has had focus for 450ms.
try { if (navigator.virtualKeyboard) navigator.virtualKeyboard.overlaysContent = true; } catch {}
let kbFocusAt = 0; document.addEventListener('focusin', () => { kbFocusAt = performance.now(); setTimeout(() => { kbInset(); typeof placeBar === 'function' && placeBar(); }, 480); });
function kbHeight() { if (!typingNow() || !touchUI()) return 0; let k = 0; try { if (navigator.virtualKeyboard) k = navigator.virtualKeyboard.boundingRect.height || 0; } catch {}
  const vv = window.visualViewport; if (vv) k = Math.max(k, innerHeight - vv.height - vv.offsetTop);
  if (k < 60 && innerHeight > innerWidth && performance.now() - kbFocusAt > 450 && !document.body.classList.contains('wide') && (!appH || innerHeight > appH * .85)) k = Math.round(innerHeight * .42); return Math.max(0, Math.round(k)); }
function kbInset() { const k = kbHeight();
  document.documentElement.style.setProperty('--kb', k + 'px'); document.body && document.body.classList.toggle('kbmodal', k > 0 && !!document.querySelector('.modal:not(.hidden)')); }
try { if (navigator.virtualKeyboard) navigator.virtualKeyboard.addEventListener('geometrychange', () => { kbInset(); typeof placeBar === 'function' && placeBar(); }); } catch {}
if (window.visualViewport) visualViewport.addEventListener('resize', kbInset); document.addEventListener('focusin', () => { kbInset(); setTimeout(kbInset, 300); }); document.addEventListener('focusout', () => setTimeout(kbInset, 300));
addEventListener('scroll', () => { if (scrollY && document.querySelector('.modal:not(.hidden)')) window.scrollTo(0, 0); }, { passive: true });
addEventListener('resize', fitVV); addEventListener('orientationchange', () => setTimeout(fitVV, 300)); fitVV();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// ---------- connection ----------
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => { authed = false; retry = 0; $('conn').classList.add('on'); if (localStorage.token) send({ type: 'resume', token: localStorage.token }); else { document.body.classList.remove('booting'); if (!me) show('login'); }
    clearInterval(pingT); pingT = setInterval(() => send({ type: 'ping' }), 20000); };
  ws.onclose = () => { authed = false; window.wsDropped = true; $('conn').classList.remove('on'); clearInterval(pingT); setTimeout(connect, Math.min(8000, 500 * 2 ** retry++)); };
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.type === 'error' && !/^Seat taken$/.test(m.error)) toast(m.error);
    if (m.type === 'notice') { toast(m.text); if (m.ok === 'resetPassword') { $('resetForm').classList.add('hidden'); $('loginForm').classList.remove('hidden'); } }
    if (m.type === 'needAge') $('ageGate').classList.remove('hidden');
    if (m.type === 'needLogin') { document.body.classList.remove('booting'); localStorage.removeItem('token'); me = null; table = null; show('login'); }
    if (m.type === 'joinRefused') { joinDone(); toast(m.error); setRoom(prevRoom === 'bj' && table ? 'bj' : prevRoom || 'none'); if (lobbyData) renderLobby(lobbyData); }
    if (m.type === 'lobbyUpdate' && me) { if (lobbyData) Object.assign(lobbyData, m); renderLobby(lobbyData || m); }
    if (m.type === 'removed') { sessionStorage.removeItem('lastTable'); Seats.forget(); if (room === 'bj') setRoom('none'); }
    if (m.type === 'reaction') floatEmoji(m.seat, m.emoji, m.name);
    if (m.type === 'seatRefused') { toast(m.error === 'Seat taken' ? 'Seat taken' : m.error); window.Seats && Seats.pill(); } // v0.16: lost a seat race -> stay viewing
    if (m.type === 'seatMoved') { try { SFX.chip(); } catch {} }
    if (m.type === 'chat') addChat(m);
    if (m.type === 'chatHistory') { $('chatFeed').innerHTML = ''; (m.chat || []).forEach(x => addChat(x, true)); updateChatUp(); }
    if (m.type === 'playerCard') showCard(m.card);
    if (m.type === 'craps' && !stray('craps')) { const nt = !craps || craps.id !== m.table.id; craps = m.table; table = null; coin = null; rou = null; if (nt) setupChips('cChipRow', craps.tier); Seats.room = craps; Seats.game = 'craps'; renderCraps(); Seats.seen('craps', craps); if (view !== 'profile' && view !== 'devlog') show('craps'); }
    if (m.type === 'crapsRoll' && craps) { animDice(m); const rb = $('cRoll'); rb.dataset.wait = '1'; rb.classList.add('rolling'); clearTimeout(rb._t); rb._t = setTimeout(() => { delete rb.dataset.wait; rb.classList.remove('rolling'); }, 1600); }
    if (m.type === 'slotInfo') slotInfo(m); if (m.type === 'slotResult') slotResult(m); if (m.type === 'slotFail') slotFail(m);
    if (m.type === 'coin' && !stray('coin')) { coin = m.room; table = null; craps = null; rou = null; Seats.room = coin; Seats.game = 'coin'; renderCoin(); Seats.seen('coin', coin); if (view !== 'profile' && view !== 'devlog') show('coin'); } if (m.type === 'coinFlip' && coin && (!m.room || m.room === coin.id)) coinFlip(m);
    if (m.type === 'roulette' && !stray('roulette')) { const nt = !rou || rou.id !== m.table.id; rou = m.table; table = craps = coin = null; Seats.room = rou; Seats.game = 'roulette'; rRender(nt); Seats.seen('roulette', rou); if (view !== 'profile' && view !== 'devlog') show('roulette'); }
    if (m.type === 'rouSpin' && rou) rouSpin(m); if (m.type === 'rouCall' && rou) rouCall(m.call); if (m.type === 'rouResult' && rou) rouResult(m);
    if (m.type === 'slotsRoom') renderSlotsRoom(m.players);
    if (m.type === 'hs') return hsAnswer(m);
    if (m.type === 'serverNotice') setServerNotice(m.notice);
    if (/^(events|eventGo|inviteCreated|inviteInfo|adminEvents|eventCreated)$/.test(m.type)) evMsg(m);
    if (m.type === 'dm') onDm(m);
    if (m.type === 'dmHistory') { dms[m.with] = m.msgs; renderMsgs(); }
    if (m.type === 'dmReaction') { const other = m.a === me.name ? m.b : m.a, x = (dms[other] || []).find(y => y.id === m.id); if (x) { x.reactions = m.reactions; if (other === activeTab) renderMsgs(true); } }
    if (m.type === 'adToken') runAd(m.token);
    if (m.type === 'profile') { authed = true; document.body.classList.remove('booting'); const first = !me; if (me) for (const k of ['friends', 'incoming', 'outgoing', 'blocked']) if (!Array.isArray(m.profile[k]) && Array.isArray(me[k])) m.profile[k] = me[k]; /* v0.16.3: a profile without a list never wipes it */ me = m.profile; if (first || window.wsDropped) { if (!$('frModal').classList.contains('hidden')) send({ type: 'friendsRefresh' }); } localStorage.token = me.token; renderProfile(); if (first) { afterLogin(); show(view === 'login' ? 'lobby' : view); } if (window.wsDropped) { window.wsDropped = false; spinResume(); } if (outbox.length) flushOutbox(); }
    // the server is the source of truth for where this socket is: 'lobby' = not in any room. quiet = we asked to leave for a solo screen (slots), so stay there.
    if (m.type === 'lobby' && me && ((m.rq && m.rq < lastIntentRq) || (!m.rq && pendingJoin))) { renderLobby(m); } // v0.15.2 root cause: the join that wakes an evicted server is preceded by an unsolicited lobby(resumed); it must not cancel that join // reply to an older leave; a newer join is in flight
    else if (m.type === 'lobby' && me) { table = null; craps = null; coin = null; rou = null; Seats.left(); renderLobby(m); 
      // told we're in no room: forget a room intent unless the player just picked one (this reply may predate it); slots is a solo screen and stays
      if (m.resumed) { if (!rejoin() && room !== 'slots') { if (room === 'coin' && view === 'coin') send({ type: 'coinJoin', mode: sessionStorage.coinMode || 'single' }); else setRoom('none'); } } else if (!m.quiet && room !== 'slots') setRoom('none');
      if (!m.quiet && view !== 'profile' && room !== 'slots' && view !== 'slots' && !(m.resumed && (room === 'coin' || !/^(table|craps|roulette|lobby)$/.test(view)))) show('lobby'); } // v0.15: a reconnect/server wake never pulls you out of dev log, feedback or a coin room
    if (m.type === 'table' && !stray('bj')) { craps = null; coin = null; rou = null; const nt = !table || table.id !== m.table.id; table = m.table; clockSkew = (m.table.now || Date.now()) - Date.now(); sessionStorage.lastTable = JSON.stringify(table.private ? { code: table.code, at: Date.now() } : { tier: table.tier.id, tableId: table.id, at: Date.now() });
      Seats.room = table; Seats.game = 'bj'; if (nt) setupBet(); renderTable(); if (view !== 'profile' && view !== 'slots') show('table'); Seats.seen('bj', table); } };
}
function afterLogin() { send({ type: 'events' }); if (eventCode) { send({ type: 'eventJoin', code: eventCode.toUpperCase() }); eventCode = null; history.replaceState(0, '', '/'); } if (inviteCode) { send({ type: 'join', code: inviteCode }); inviteCode = null; history.replaceState(0, '', '/'); } }
// seat lost by a server restart: rejoin the table only if the player meant to be there and was there in the last 3 minutes
// v0.16: every game rejoins the same seat (or keeps viewing the same table) through Seats.rejoin; private bj tables still rejoin by code
function rejoin() { const l = sessionStorage.lastTable; if (!(room === 'bj' && l && JSON.parse(l).code)) return Seats.rejoin(room); if (sessionStorage.rejoined === l) return false; const o = JSON.parse(l); if (!(Date.now() - (o.at || 0) < 180e3)) return false; sessionStorage.rejoined = l;
  send(o.code ? { type: 'join', code: o.code } : { type: 'join', tableId: o.tableId, tier: o.tier }); setTimeout(() => delete sessionStorage.rejoined, 5000); return true; }
// ---------- profile / friends / security ----------
function renderProfile() {
  $('me').textContent = me.display; $('meAv').src = avUrl(me.avatar); $('chips').textContent = '🪙 ' + fmt(me.chips); lobbyLocks();
  $('daily').disabled = me.dailyIn > 0; $('daily').textContent = me.dailyIn > 0 ? `🎁 ${Math.ceil(me.dailyIn / 36e5)}h` : `🎁 +${fmt(me.dailyAmt || 20000)}`; $('daily').title = 'Daily bonus';
  $('ad').disabled = me.adIn > 0; $('ad').textContent = me.adIn > 0 ? `📺 ${Math.ceil(me.adIn / 6e4)}m` : '📺 Boost'; $('ad').title = 'Watch an ad for a booster';
  $('missions').innerHTML = me.missions.map(m => `<div class="mission"><span>${m.text} ${m.prog}/${m.goal} · +${fmt(m.reward)}</span>
    <button class="tiny" ${m.prog < m.goal || m.claimed ? 'disabled' : ''} onclick="send({type:'claim',id:'${m.id}'})">${m.claimed ? '✔' : 'Claim'}</button></div>`).join('');
  if (document.activeElement !== $('pDisplay')) $('pDisplay').value = me.display;
  $('avGrid').innerHTML = [...Array(8)].map((_, i) => `<button class="av ${i === me.avatar ? 'on' : ''}" data-av="${i}" style="background-image:url(${avUrl(i)})"></button>`).join('');
  $('frBadge').textContent = me.incoming.length || '';
  $('fIncoming').innerHTML = me.incoming.length ? '<label>Requests</label>' + me.incoming.map(f => `<div class="frow"><span class="av sm" style="background-image:url(${avUrl(f.avatar)})"></span><span>${esc(f.display)} <small>@${f.name}</small></span>
    <button class="tiny primary" data-fa="friendAccept" data-n="${f.name}">Accept</button><button class="tiny" data-fa="friendDecline" data-n="${f.name}">Decline</button></div>`).join('') : '';
  const fon = me.friends.filter(f => f.online).length;
  $('fList').innerHTML = `<label>Friends <small class="fcount">${fon} online · ${me.friends.length}</small></label>` + (me.friends.slice().sort((a, b) => (b.online - a.online) || a.display.localeCompare(b.display)).map(f => `<div class="frow ${f.online ? 'on' : 'off'}"><span class="av sm ${f.online ? 'online' : ''}" style="background-image:url(${avUrl(f.avatar)})"><i class="odot ${f.online ? 'on' : ''}" title="${f.online ? 'Online' : 'Offline'}"></i></span><span class="fwho">${esc(f.display)} <small>@${f.name}</small><small class="floc">${f.online ? '🟢 ' + esc(f.loc ? f.loc.label + (f.loc.private ? ' (private)' : f.loc.full ? ' (full)' : '') : 'Online') : 'Offline'}</small></span>
    ${f.loc && f.loc.joinable ? `<button class="tiny primary" data-fjoin='${esc(JSON.stringify({ game: f.loc.game, tableId: f.loc.tableId, tier: f.loc.tier }))}'>Join</button>` : ''}<button class="tiny" data-dm="${f.name}">✉️ Message</button><button class="tiny frrm" data-frm="${f.name}" aria-label="Remove ${esc(f.display)} from friends">Remove</button></div>`).join('') || '<div class="small">No friends yet.</div>')
    + (me.outgoing.length ? `<div class="small">Pending: ${me.outgoing.map(esc).join(', ')}</div>` : '');
  $('incog').checked = !!me.incognito;
  $('fBlocked').innerHTML = me.blocked.length ? '<label>Blocked</label>' + me.blocked.map(n => `<div class="frow"><span>${esc(n)}</span><button class="tiny" data-unblock="${n}">Unblock</button></div>`).join('') : '';
  $('emailStatus').textContent = me.email ? `${me.email} ${me.emailVerified ? '✔ verified' : ''}` + (me.pendingEmail ? ` · pending: ${me.pendingEmail}` : '') : me.pendingEmail ? `Pending verification: ${me.pendingEmail}` : 'No recovery email set.';
  $('eCur').classList.toggle('hidden', !me.emailVerified); $('cpCur').parentElement.classList.toggle('hidden', !!me.emailVerified);
  $('mCap').textContent = `sent ${fmt(me.sentToday)}/${fmt(me.transferCap)} today`;
  renderStats(); renderQuick(); renderBubbles(); if (table) renderTable();
}
$('meBtn').onclick = () => { if (me) show(view === 'profile' ? roomView() : 'profile'); };
$('pClose').onclick = () => show(roomView());
// v0.14 friends presence: Join a friend's room, incognito toggle, live refresh while the Friends tab is open
function joinFriend(l) { if (!l) return; if (l.game === 'bj') send({ type: 'join', tableId: l.tableId, tier: l.tier }); else if (l.game === 'craps') send({ type: 'crapsJoin', tier: l.tier, tableId: l.tableId }); else if (l.game === 'roulette') send({ type: 'rouJoin', tier: l.tier, tableId: l.tableId }); else if (l.game === 'coin') send({ type: 'coinJoin', mode: l.mode || 'single' }); }
$('fList').addEventListener('click', e => { const b = e.target.closest('[data-fjoin]'); if (b) { try { joinFriend(JSON.parse(b.dataset.fjoin)); } catch (_) {} } });
$('incog').onchange = () => send({ type: 'setProfile', incognito: $('incog').checked });
setInterval(() => { if (!$('frModal').classList.contains('hidden') && document.visibilityState === 'visible') send({ type: 'friendsRefresh' }); }, 10000);
// v0.16.1: Friends lives in the top bar (👥 + pending-request badge) and opens as its own sheet over any screen; same pane, same handlers
$('frBtn').onclick = () => { const m = $('frModal'); if (!m.classList.contains('hidden')) return m.classList.add('hidden'); send({ type: 'friendsRefresh' }); $('pt-friends').classList.remove('hidden'); if (me) renderProfile(); m.classList.remove('hidden'); }; // v0.16.3 (fb_09f9354ec4): the Profile tab switcher used to hide this pane (still class ppane after the v0.16.1 move) -> empty sheet until reload
$('frClose').onclick = () => $('frModal').classList.add('hidden'); $('frModal').addEventListener('click', e => { if (e.target.id === 'frModal') $('frModal').classList.add('hidden'); });
document.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { if (b.dataset.pt === 'friends') send({ type: 'friendsRefresh' }); document.querySelectorAll('[data-pt]').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.ppane:not(#pt-friends)').forEach(p => p.classList.toggle('hidden', p.id !== 'pt-' + b.dataset.pt)); });
$('pSave').onclick = () => send({ type: 'setProfile', display: $('pDisplay').value });
$('avGrid').onclick = e => { const a = e.target.dataset.av; if (a !== undefined) send({ type: 'setProfile', avatar: +a }); };
$('fAddBtn').onclick = () => { send({ type: 'friendAdd', name: $('fAdd').value.trim() }); $('fAdd').value = ''; };
// v0.16.2: the friends pane lives in #frModal since v0.16.1, so its buttons are handled there too (they were dead after the move).
// fb_92cbfb1266: Remove sits apart at the far end and always asks first.
const frClick = e => { const b = e.target.closest('button'); if (!b) return; const d = b.dataset; if (d.fa) send({ type: d.fa, name: d.n }); if (d.unblock) send({ type: 'block', name: d.unblock, on: false }); if (d.dm) { $('frModal').classList.add('hidden'); openDm(d.dm); }
  if (d.frm) { const f = me.friends.find(x => x.name === d.frm); $('frcText').textContent = `Remove ${f ? f.display : d.frm} from friends?`; $('frConfirm').dataset.n = d.frm; $('frConfirm').classList.remove('hidden'); } };
$('profile').addEventListener('click', frClick); $('frModal').addEventListener('click', frClick);
$('frcCancel').onclick = () => $('frConfirm').classList.add('hidden'); $('frConfirm').addEventListener('click', e => { if (e.target.id === 'frConfirm') $('frConfirm').classList.add('hidden'); });
$('frcOk').onclick = () => { send({ type: 'friendRemove', name: $('frConfirm').dataset.n }); $('frConfirm').classList.add('hidden'); };
$('eSet').onclick = () => send({ type: 'setEmail', email: $('eNew').value, code: $('eCode').value || undefined });
$('eVerify').onclick = () => send({ type: 'verifyEmail', code: $('eCode').value });
$('eCur').onclick = () => send({ type: 'emailCodeCurrent' });
$('cpDo').onclick = () => send({ type: 'changePassword', password: $('cpNew').value, current: $('cpCur').value, code: $('eCode').value || undefined });
$('forgot').onclick = e => { e.preventDefault(); $('loginForm').classList.add('hidden'); $('resetForm').classList.remove('hidden'); $('rUser').value = $('uname').value; };
$('rBack').onclick = e => { e.preventDefault(); $('resetForm').classList.add('hidden'); $('loginForm').classList.remove('hidden'); };
$('rSend').onclick = () => send({ type: 'resetRequest', username: $('rUser').value.trim() });
$('rDo').onclick = () => send({ type: 'resetPassword', username: $('rUser').value.trim(), code: $('rCode').value.trim(), password: $('rPw').value });
// ---------- lobby ----------
const ROOM_ICON = { rookie: '🟢', bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💠', diamond: '💎' };
// server-wide notice (top bar): replaces the compliance line while active; tap shows the full text
const NOTICE0 = $('notice').innerHTML;
function setServerNotice(n) { srvNotice = n; const el = $('notice'); if (!n && EV.feed && EV.feed.announce.length) { el.classList.remove('srv', 'warn'); el.dataset.full = ''; return evTicker(true); } el.classList.toggle('srv', !!n); el.classList.toggle('warn', !!n && n.level === 'warn'); el.dataset.full = n ? n.msg : '';
  if (n) el.innerHTML = `<span class="nmsg">${n.level === 'warn' ? '⚠️' : '📢'} ${esc(n.msg)}</span>`; else el.innerHTML = NOTICE0;
  if (n && !reduced) el.animate([{ background: '#b8860b' }, { background: getComputedStyle(el).backgroundColor }], 900);
  if ($('nCur')) $('nCur').textContent = n ? `Live: [${n.level}] ${n.msg}${n.until ? ' · until ' + new Date(n.until).toLocaleTimeString() : ''} · by ${n.by}` : 'No notice'; }
$('notice').onclick = () => { if ($('notice').dataset.full) toast($('notice').dataset.full); };
$('nPost').onclick = () => { const msg = $('nMsg').value.trim(); if (!msg) return toast('Write a message'); send({ type: 'adminNotice', msg, level: $('nLevel').value, ttl: $('nTtl').value }); };
$('nClear').onclick = () => send({ type: 'adminNoticeClear' });
let lobbyData = null, gtab = sessionStorage.gtab || 'bj';
// v0.16.3 (fb_9552bc63e6, fb_034d6b07df): the blackjack control rows get their height pinned once per layout (width, stable height, layout
// class, skin), so nothing that changes with seated / bet / cleared state (button text, disabled state, emoji glyph metrics on Android) can
// resize a row and make the flex felt absorb the difference. Overflow stays visible (raised chips, glows).
let rowKey = ''; function lockRows() { const t = $('table'); if (!t || !t.offsetHeight) return; const k = [layoutKey, appH, innerWidth, t.classList.contains('premium')].join('|'); if (k === rowKey) return;
  const rows = [...t.querySelectorAll(':scope > .controls > .row, :scope > .banner')]; rows.forEach(r => r.style.height = ''); const hs = rows.map(r => r.getBoundingClientRect().height);
  rows.forEach((r, i) => { if (hs[i] > 0) { r.style.height = hs[i] + 'px'; r.style.flex = 'none'; } }); rowKey = k; }
addEventListener('relayout', () => { rowKey = ''; if (view === 'table') lockRows(); });
// v0.16.2 (fb_f3248bed5f): the lobby's affordable/locked shading follows the chip balance. Every balance change (refill, gift, daily bonus,
// shop, win, admin edit) arrives as a profile message -> renderProfile() -> lobbyLocks(); show('lobby') re-checks too. Only re-renders when a lock flips.
let lockKey = ''; const lockSig = (m, chips) => [m.tiers || [], m.craps || [], m.roulette || []].map(l => l.map(t => chips < t.min ? 1 : 0).join('')).join('|');
// UI-STABILITY: room cards have two fixed info lines (bets / players, ellipsis); the lock note joins the second line, so a lock flip
// or a player-count change never resizes a room card.
const tierInfo = (bets, rest, t, chips) => `<div class="small tinfo"><span>${bets}</span><span>${chips < t.min ? `🔒 needs ${fmt(t.min)} · ${rest.replace(/ playing/, '').replace(/^(<b[^>]*>)?/, '👥 $1')}` : rest}</span></div>`;
function lobbyLocks() { if (!lobbyData || !me) return; if (lockSig(lobbyData, me.chips) !== lockKey) renderLobby(lobbyData); }
function renderLobby(m) { lobbyData = m; const chips = me ? me.chips : 0; lockKey = lockSig(m, chips);
  window.TIERS_CACHE = m.tiers;
  $('tiers').innerHTML = m.tiers.map(t => `<div class="tier ${t.id} ${chips < t.min ? 'locked' : ''}"><h2>${ROOM_ICON[t.id] || ''} ${t.name}</h2>
    <div class="btns"><button class="primary" onclick="send({type:'view',game:'bj',tier:'${t.id}'})">View</button><button class="qj" onclick="send({type:'join',tier:'${t.id}'})">Quick join</button><button onclick="send({type:'create',tier:'${t.id}'})">🔒</button></div>
    ${tierInfo(`Bets ${fmt(t.min)}–${fmt(t.max)}`, `<b class="cnt">${t.players ?? t.tables.reduce((a, x) => a + x.players, 0)}</b> playing${t.tables.length > 2 ? ` · ${t.tables.length} tables` : ''}`, t, chips)}</div>`).join('');
  $('crapsList').innerHTML = (m.craps || []).map(t => `<div class="tier ${t.tier} ${chips < t.min ? 'locked' : ''}"><h2>🎲 ${t.name.replace('Room', 'Craps')}</h2>
    <div class="btns"><button class="primary" onclick="send({type:'view',game:'craps',tier:'${t.tier}'})">View</button><button class="qj" onclick="send({type:'crapsJoin',tier:'${t.tier}'})">Quick join</button></div>${tierInfo(`Bets ${fmt(t.min)}–${fmt(t.max)}`, `${t.players} playing`, t, chips)}</div>`).join('');
  $('rouList').innerHTML = (m.roulette || []).map(t => `<div class="tier ${t.tier} ${chips < t.min ? 'locked' : ''}"><h2>🎡 ${t.name.replace('Room', 'Roulette')}</h2>
    <div class="btns"><button class="primary" onclick="send({type:'view',game:'roulette',tier:'${t.tier}'})">View</button><button class="qj" onclick="send({type:'rouJoin',tier:'${t.tier}'})">Quick join</button></div>${tierInfo(`Single zero · bets ${fmt(t.min)}–${fmt(t.max)}`, `${t.players} playing`, t, chips)}</div>`).join('');
  const seen = new Set(); $('tourList').innerHTML = '<div class="small tnote">Sit &amp; Go: fixed 10,000-chip stack, 10 rounds, 2–5 players. Starts 20s after the 2nd player joins (instantly at 5). Chip awards 60/30/10 of the pool (chips have no monetary value).</div>' + (m.tourneys || []).filter(t => t.status === 'waiting' && !seen.has(t.id) && seen.add(t.id)).map(t => `<div class="tier tour"><h2>🏆 ${esc(t.name)}</h2>
    <div class="btns"><button class="primary" onclick="send({type:'join',tourney:'${t.id}'})">Buy in ${fmt(t.buyIn)}</button></div><div class="small">${t.players}/5 registered · pool ${fmt(t.pool)}${t.startsAt ? ' · starting soon' : ''}</div></div>`).join('')
    + (m.tourneys || []).filter(t => t.status === 'running').map(t => `<div class="small trun">▶ ${esc(t.name)} — round ${t.round}/${t.rounds}, ${t.players} players</div>`).join('');
  setGtab(gtab); }
function setGtab(g) { gtab = sessionStorage.gtab = g; document.querySelectorAll('[data-g]').forEach(b => b.classList.toggle('on', b.dataset.g === g));
  $('tiers').classList.toggle('hidden', g !== 'bj'); $('rouList').classList.toggle('hidden', g !== 'rou'); $('crapsList').classList.toggle('hidden', g !== 'craps'); $('tourList').classList.toggle('hidden', g !== 'tour'); $('moreList').classList.toggle('hidden', g !== 'more'); }
document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => setGtab(b.dataset.g));
// ---------- sound ----------
let actx, muted = localStorage.muted === '1';
const AC = () => actx = actx || new (window.AudioContext || window.webkitAudioContext)();
function tone(f, d, type = 'sine', v = .15, t0 = 0, slide) { if (muted) return; const a = AC(), t = a.currentTime + t0, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d); }
function noiseBurst(d, v = .2, t0 = 0, hp = 1500) { if (muted) return; const a = AC(), t = a.currentTime + t0, n = a.createBufferSource(), b = a.createBuffer(1, a.sampleRate * d, a.sampleRate), x = b.getChannelData(0);
  for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / x.length) ** 2; n.buffer = b; const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = a.createGain(); g.gain.value = v; n.connect(f).connect(g).connect(a.destination); n.start(t); }
const SFX = { deal: t => noiseBurst(.09, .25, t, 2500), flip: t => { noiseBurst(.06, .2, t, 1200); tone(900, .05, 'triangle', .05, t); },
  chip: t => { tone(2600, .06, 'triangle', .12, t); tone(3400, .05, 'triangle', .08, (t || 0) + .03); }, tap: () => tone(700, .04, 'square', .03), pop: () => tone(520, .12, 'sine', .08, 0, 900),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, 'triangle', .12, i * .09)), lose: () => tone(330, .5, 'sawtooth', .06, 0, 140) };
const muteLbl = () => $('mute').textContent = muted ? '🔇 Sound off' : '🔊 Sound on'; muteLbl();
$('mute').onclick = () => { muted = !muted; localStorage.muted = muted ? '1' : '0'; muteLbl(); };
document.addEventListener('pointerdown', e => { if (e.target.closest('button') && !e.target.closest('.chiprow')) SFX.tap(); });
// ---------- table ----------
function setupBet() { const r = $('betRange'), t = table.tier; r.min = t.min; r.max = t.max; r.step = t.min; r.value = t.min; document.querySelector('.betrow .unit').textContent = t.unitLabel || ''; setupChips('chipRow', t); syncNum(); }
function setupChips(id, t) { $(id).innerHTML = (t.chips || [t.min]).map((v, i) => `<button class="c${i}" data-v="${v}">${fmt(v)}</button>`).join(''); }
const unit = () => (table && table.tier.unit) || M;
function syncNum() { $('betNum').value = +($('betRange').value / unit()).toFixed(2); }
$('betRange').oninput = syncNum;
$('betNum').onchange = () => { const t = table.tier, v = Math.round(Math.min(t.max, Math.max(t.min, +$('betNum').value * unit())) / t.min) * t.min; $('betRange').value = v; syncNum(); };
const betAmt = () => +$('betRange').value;
$('betBtn').onclick = () => send({ type: 'bet', amount: betAmt() });
$('insYes').onclick = () => { send({ type: 'insurance', take: true }); $('insPrompt').classList.add('hidden'); }; $('insNo').onclick = () => { send({ type: 'insurance', take: false }); $('insPrompt').classList.add('hidden'); };
$('pairBtn').onclick = () => send({ type: 'pair', amount: Math.min(betAmt(), table.tier.max / 10) });
const resCls = r => /WIN|BLACKJACK/.test(r || '') ? 'win' : /LOSE|BUST/.test(r || '') ? 'lose' : '';
const VIPI = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💠', diamond: '💎' };
// card fan: overlap so a hand of n cards always fits its row (single hand: big cards; split hands: one compact row each)
function overlap(n, hands) { if (n < 2) return 0; const avail = hands > 1 ? 40 : 66, cw = hands > 1 ? 22 : 32; return Math.round(Math.min(hands > 1 ? -12 : -10, (avail - cw) / (n - 1) - cw)); }
// running total label: soft hands show both values (e.g. 7/17), naturals show BJ
const totLbl = (sc, sft, n, single) => n === 2 && sc === 21 && single ? 'BJ' : sft && sc < 21 ? `${sc - 10}/${sc}` : '' + sc;
const totCls = (sc, n, single) => sc > 21 ? 'bust' : sc === 21 ? (n === 2 && single ? 'bj' : 'tw') : '';
// long single hands (5+ cards) wrap into two overlapping rows so every rank stays readable; split rows tighten their fan instead
function cardsHTML(cards, n, key) { const row = (cs, off) => `<div class="cards" style="--ov:${overlap(cs.length, n)}px">${cs.map((c, j) => cardHTML(c, key + (off + j))).join('')}</div>`;
  if (n === 1 && cards.length >= 5) { const a = Math.ceil(cards.length / 2); return `<div class="crows">${row(cards.slice(0, a), 0)}${row(cards.slice(a), a)}</div>`; }
  return row(cards, 0); }
function handHTML(t, i, s, h, k) { const n = s.hands.length, act = t.turn === i && s.active === k && t.phase === 'playing', single = n === 1;
  return `<div class="hand ${act ? 'act' : ''} ${h.done && n > 1 && t.phase === 'playing' && !act ? 'done' : ''} ${resCls(h.result)}">
    ${cardsHTML(h.cards, n, `s${i}h${k}c`)}
    <span class="tot ${totCls(h.score, h.cards.length, single)}">${h.result && t.phase === 'settled' ? `<i class="res ${resCls(h.result)}">${h.result === 'BLACKJACK' ? 'BJ' : h.result === 'SURRENDER' ? 'SUR' : h.result}</i>` : h.cards.length ? totLbl(h.score, h.soft, h.cards.length, single) : ''}</span></div>`; }
function renderTable() {
  const t = table, myIdx = t.seats.findIndex(s => s && s.name === me.name), mine = myIdx >= 0 ? t.seats[myIdx] : null;
  $('tinfo').textContent = t.tourney ? `🏆 ${t.tourney.name}` : `${t.tier.name} · ${fmt(t.tier.min)}–${fmt(t.tier.max)}`; renderTourney(t);
  $('felt').classList.toggle('burgundy', !['rookie', 'bronze'].includes(t.tier.id) && !t.tourney);
  $('dcards').innerHTML = t.dealer.map((c, j) => cardHTML(c, j === 1 && c.r !== '?' ? 'd1r' : 'd' + j)).join('');
  const hid = t.dealer.some(c => c.r === '?'); $('dscore').className = 'tot ' + (t.dealer.length ? totCls(t.dealerScore, hid ? 1 : t.dealer.length, true) : 'none');
  $('dscore').textContent = t.dealer.length ? (hid ? 'shows ' : '') + totLbl(t.dealerScore, t.dealerSoft, hid ? 1 : t.dealer.length, true) : '';
  const backed = t.seats.map((s, i) => s && (s.backs || []).some(x => x.name === me.name) ? i : -1).filter(i => i >= 0);
  $('seats').innerHTML = t.seats.map((s, i) => !s ? (o => `<div class="seat empty ${o.cls}" id="seat${i}" ${o.attr}><div class="av ghost"></div><div class="nm">${o.label}</div><div class="small"></div></div>`)(Seats.open(t, i)) :
    `<div class="seat ${s.name === me.name ? 'me' : ''} ${backed.includes(i) ? 'backed' : ''} ${t.turn === i ? 'turn' : ''} ${s.away ? 'away' : ''} ${t.phase === 'settled' ? (resCls(s.result) === 'win' ? 'win' : /LOSE|BUST/.test(s.result) && !/WIN/.test(s.result) ? 'lose' : '') : ''}" id="seat${i}" data-seat="${i}">
     <div class="av" style="background-image:url(${avUrl(s.avatar)})">${s.vip ? `<span class="vipb v-${s.vip}">${VIPI[s.vip]}</span>` : ''}${s.level ? `<span class="lvb">${s.level}</span>` : ''}</div><div class="nm">${s.away ? '📴' : ''}${esc(s.display || s.name)}</div>
     <div class="small">🪙${fmt(s.chips)}</div><div class="hands n${s.hands.length}">${s.hands.map((h, k) => handHTML(t, i, s, h, k)).join('')}</div>
     <div class="betspot ${s.bet ? 'on' : ''}">${s.bet ? fmt(s.hands.reduce((a, h) => a + h.bet, 0) || s.bet) : ''}${s.ready && t.phase === 'betting' ? '<span class="rdy">✓</span>' : ''}</div>
     <div class="betline">${s.pair ? '👯' + fmt(s.pair) : ''}${s.insurance ? ' 🛡' + fmt(s.insurance) : ''}${backLine(s)}</div></div>`).join('');
  renderBacking(t, backed);
  $('log').innerHTML = t.log.slice(-2).map(esc).join('<br>');
  $('invite').innerHTML = t.private ? `🔒${t.code} <button class="tiny" onclick="shareInvite()">🔗</button>` : '';
  const v = t.vote; let b = '';
  if (v) b = `Kick ${esc(v.target)}? ${v.yes}/${v.needed}` + (v.target !== me.name && mine ? ` <button onclick="send({type:'vote',yes:true})">Kick</button><button onclick="send({type:'vote',yes:false})">Keep</button>` : '');
  else if (t.tourney && t.tourney.status !== 'running') b = tourneyBanner(t.tourney);
  else b = `<span id="timer"></span><span class="betbar" id="betbar"><i></i></span>`;
  if ($('banner').dataset.b !== b) { $('banner').innerHTML = b; $('banner').dataset.b = b; }
  // insurance: a centred prompt on the felt (never squeezed into the banner); it blocks nothing else and times out server-side
  const insOn = t.phase === 'insurance' && !!mine && mine.hands.length > 0 && !mine.insDecided, ip = $('insPrompt');
  if (insOn) { $('insAmt').textContent = fmt(Math.floor(mine.hands[0].bet / 2)); if (ip.classList.contains('hidden')) { ip.classList.remove('hidden'); ip.dataset.d = t.deadline; if (!reduced) ip.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.06)', opacity: 1, offset: .7 }, { transform: 'translate(-50%,-50%)' }], { duration: 320, easing: 'ease-out' }); SFX.pop(); } }
  else ip.classList.add('hidden');
  const myTurn = t.phase === 'playing' && t.turn === myIdx, betting = t.phase === 'betting';
  document.querySelectorAll('[data-a]').forEach(b => b.disabled = !myTurn);
  ['clear', 'deal', 'betBtn', 'betRange', 'betNum'].forEach(id => $(id).disabled = !betting);
  lockRows();
  $('deal').textContent = betting && mine && mine.ready ? '✓ Ready' : 'Deal'; $('deal').classList.toggle('isready', !!(betting && mine && mine.ready));
  $('table').classList.toggle('betwin', betting && t.deadline > Date.now() + clockSkew && !t.tourney);
  $('pairBtn').disabled = !betting || !(mine && mine.bet);
  document.querySelectorAll('.chiprow button').forEach(b => b.disabled = !betting);
  animateTable(t, myIdx);
}
// betting window countdown: text + draining bar; everyone seated sees the same server deadline (clock-skew corrected)
function tickTimer() { const e = $('timer'), bar = $('betbar'); if (!e || !table) return; const now = Date.now() + clockSkew, left = table.deadline - now, live = table.seats.filter(s => s && !s.away);
  if (!$('insPrompt').classList.contains('hidden')) { const p = Math.max(0, Math.min(1, left / (table.insMs || 10000))); $('insBarI').style.transform = `scaleX(${p})`; }
  if (table.phase === 'betting' && !table.tourney) {
    if (left > 0) { const ready = live.filter(s => s.ready).length, bets = live.filter(s => s.bet > 0).length; e.innerHTML = `Bets close in <b>${Math.ceil(left / 1000)}s</b> · ${bets}/${live.length} bet · ${ready} ready`;
      ring(left); if (bar) { bar.style.visibility = 'visible'; bar.firstChild.style.transform = `scaleX(${Math.max(0, Math.min(1, left / (table.betMs || 12000)))})`; bar.classList.toggle('hurry', left < 4000); } }
    else { ring(0); e.textContent = live.length > 1 ? 'Place your bets — the first bet starts the countdown' : 'Place your bet and Deal'; if (bar) bar.style.visibility = 'hidden'; } return; }
  if (bar) bar.style.visibility = 'hidden'; ring(0);
  e.textContent = left > 0 ? `⏱ ${Math.ceil(left / 1000)}s · ${table.phase === 'playing' ? (table.seats[table.turn] ? (table.seats[table.turn].name === me.name ? 'your turn' : (table.seats[table.turn].display || table.seats[table.turn].name) + "'s turn") : 'playing') : table.phase}` : table.phase; }
setInterval(tickTimer, 200);
// big countdown ring in the empty felt area while the betting window is open
// v0.14 (fb_a7a9614f76): measure the free felt between the dealer row and the seats and fit the ring fully inside it
function placeRing() { const r = $('betRing'), f = $('felt'); if (!r || !f || !f.offsetParent) return; const fr = f.getBoundingClientRect(), d = f.querySelector('.dealer').getBoundingClientRect();
  const seatEls = [...document.querySelectorAll('#seats .seat, #seats > *')].filter(e => e.offsetParent); const st = seatEls.length ? Math.min(...seatEls.map(e => e.getBoundingClientRect().top)) : fr.bottom;
  const sb = seatEls.length ? Math.max(...seatEls.map(e => e.getBoundingClientRect().bottom)) : fr.top, lo = [sb + 4, fr.bottom - 6], hi = [d.bottom + 4, Math.min(st, fr.bottom) - 4];
  let [top, bot] = lo[1] - lo[0] > hi[1] - hi[0] ? lo : hi, cx = null; const em = seatEls.find(e => e.classList.contains('empty'));
  if (bot - top < 60 && em) { const er = em.getBoundingClientRect(), nm = em.querySelector('.nm'); top = (nm ? nm.getBoundingClientRect().bottom : er.top) + 6; bot = er.bottom - 6; cx = er.left + er.width / 2 - fr.left; }
  r.style.left = cx == null ? '' : Math.round(cx) + 'px'; const gap = bot - top, sz = Math.round(Math.max(44, Math.min(84, gap, cx == null ? 84 : em.getBoundingClientRect().width - 6))); r.style.width = r.style.height = sz + 'px'; r.style.marginLeft = -sz / 2 + 'px';
  r.style.top = Math.round(Math.max(top, Math.min(bot - sz, top + (gap - sz) / 2)) - fr.top) + 'px'; r.style.setProperty('--rs', sz / 84); }
addEventListener('resize', () => { if ($('betRing') && $('betRing').classList.contains('on')) placeRing(); });
function ring(left) { const r = $('betRing'); if (!r) return; const on = left > 0; if (on && !r.classList.contains('on')) placeRing(); r.classList.toggle('on', on); if (!on) return; const p = Math.max(0, Math.min(1, left / (table.betMs || 12000)));
  r.style.setProperty('--p', p); const sec = Math.ceil(left / 1000); if (r.dataset.s !== '' + sec) { r.dataset.s = sec; r.querySelector('b').textContent = sec; if (!reduced && sec <= 5) r.querySelector('b').animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], 300); } r.classList.toggle('hurry', left < 4000); }
// backer panel: the backed player's first hand, big, with total, stake and payout (the stake follows that hand only)
function renderBacking(t, backed) { const p = $('backPanel'); $('felt').classList.toggle('backing', backed.length > 0); if (!backed.length) { p.classList.add('hidden'); p.dataset.k = ''; return; }
  p.classList.remove('hidden'); p.innerHTML = backed.slice(0, 2).map(i => { const s = t.seats[i], b = s.backs.find(x => x.name === me.name), h = s.hands[0], r = s.backResult && s.backResult[me.name];
    const res = t.phase === 'settled' && r !== undefined && r !== null ? `<span class="bpay ${r > 0 ? 'win' : r < 0 ? 'lose' : ''}">${h && h.result ? h.result + ' ' : ''}${r > 0 ? '+' + fmt(r) : r < 0 ? '-' + fmt(-r) : 'push'}</span>` : '';
    return `<div class="bp" data-seat="${i}"><div class="bph">🎯 You're backing <b>${esc(s.display || s.name)}</b> · ${fmt(b.amt)}</div>
      <div class="bpb">${h && h.cards.length ? `<div class="cards">${h.cards.map((c, j) => cardHTML(c, `b${i}c${j}`)).join('')}</div><span class="tot ${totCls(h.score, h.cards.length, s.hands.length === 1)}">${totLbl(h.score, h.soft, h.cards.length, s.hands.length === 1)}</span>` : `<span class="small">${t.phase === 'betting' ? (s.bet ? 'waiting for the deal…' : 'waiting for their bet — refunded if they sit out') : ''}</span>`}${res}</div></div>`; }).join('');
  const k = t.phase + backed.join(); if (p.dataset.k !== k && t.phase === 'settled' && !reduced) { const pay = p.querySelector('.bpay.win'); if (pay) pay.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: .6 }, { transform: 'none' }], 500); } p.dataset.k = k; }
function backLine(s) { const b = s.backs || []; if (!b.length) return ''; const mine = b.find(x => x.name === me.name), r = s.backResult && s.backResult[me.name];
  return ` <span class="backs ${mine ? 'mine' : ''}" title="back bets">🎯${mine ? fmt(mine.amt) : b.length}${r !== undefined && r !== null ? ` <i class="${r > 0 ? 'win' : r < 0 ? 'lose' : ''}">${r > 0 ? '+' + fmt(r) : r < 0 ? '-' + fmt(-r) : '='}</i>` : ''}</span>`; }
let chipFrom = null;
$('chipRow').onclick = e => { const v = +e.target.dataset.v; if (v) { chipFrom = e.target; send({ type: 'bet', amount: v }); } };
// animations
let seenCards = new Set(), lastPhase = '', holeHidden = false, lastMyBet = 0, resultPlayed = false;
function flyChip(fromEl, toEl) { if (reduced || !fromEl || !toEl) return; const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect(), c = document.createElement('div'); c.className = 'flychip'; document.body.appendChild(c);
  c.animate([{ left: a.left + a.width / 2 - 14 + 'px', top: a.top + a.height / 2 - 14 + 'px', transform: 'scale(1.3)' }, { left: b.left + b.width / 2 - 14 + 'px', top: b.top + b.height / 2 - 14 + 'px', transform: 'scale(.8)' }], { duration: 380, easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = () => c.remove(); }
function animateTable(t, myIdx) {
  if (t.phase === 'betting' && lastPhase !== 'betting') { seenCards = new Set(); resultPlayed = false; }
  if (seenCards.has('d1')) seenCards.add('d1r'); const shoe = $('shoe').getBoundingClientRect(); let n = 0;
  document.querySelectorAll('#felt .card[data-k]').forEach(el => { const k = el.dataset.k; if (!k || seenCards.has(k)) return; seenCards.add(k);
    const r = el.getBoundingClientRect(), d = n++ * 110; SFX.deal(d / 1000);
    if (!reduced) el.animate([{ transform: `translate(${shoe.left - r.left}px,${shoe.top - r.top}px) rotate(-30deg) scale(.6)`, opacity: .6 }, { transform: 'none', opacity: 1 }], { duration: 320, delay: d, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }); });
  const hole = document.querySelector('#dcards .card:nth-child(2)'), hidden = !!(hole && hole.classList.contains('back'));
  if (holeHidden && hole && !hidden) { SFX.flip(); if (!reduced) hole.animate([{ transform: 'perspective(500px) rotateY(180deg)', filter: 'brightness(.4)' }, { transform: 'perspective(500px) rotateY(90deg)', filter: 'brightness(.7)', offset: .5 }, { transform: 'perspective(500px) rotateY(0)', filter: 'none' }], { duration: 450 }); }
  holeHidden = hidden;
  const mine = t.seats[myIdx]; const myBet = mine ? mine.bet + mine.pair : 0;
  if (t.phase === 'betting' && myBet > lastMyBet) { SFX.chip(); flyChip(chipFrom || $('betBtn'), document.querySelector(`#seat${myIdx} .betspot`)); }
  chipFrom = null; lastMyBet = t.phase === 'betting' ? myBet : 0;
  if (t.phase === 'settled' && !resultPlayed && mine && mine.result) { resultPlayed = true; resCls(mine.result) === 'win' ? SFX.win() : resCls(mine.result) === 'lose' ? SFX.lose() : 0; }
  lastPhase = t.phase;
}
// player menu (tap a seat)
let pmTarget = null;
$('seats').onclick = e => { const el = e.target.closest('[data-seat]'); if (!el) return; const s = table.seats[+el.dataset.seat]; if (!s) return; openCard(s.name); };
function openCard(name) { pmTarget = name; send({ type: 'playerCard', name }); }
function showCard(c) { pmTarget = c.name; const s = { name: c.name, avatar: c.avatar, display: c.display }; const fr = me.friends.some(f => f.name === c.name), bl = me.blocked.includes(s.name);
  $('pmHead').innerHTML = `<span class="av" style="background-image:url(${avUrl(s.avatar)})"></span><b>${esc(s.display || s.name)}</b> <small>@${s.name}</small>`;
  $('pmFriend').textContent = fr ? '✔ Friends' : me.outgoing.includes(s.name) ? '⏳ Requested' : '➕ Add friend'; $('pmFriend').disabled = fr || me.outgoing.includes(s.name);
  $('pmMsg').disabled = !fr; $('pmBlock').textContent = bl ? '✅ Unblock' : '🚫 Block'; $('pmKick').disabled = !table || !!table.vote || !table.seats.some(x => x && x.name === c.name);
  const lvPct = Math.min(100, Math.round(100 * c.xp / Math.max(1, c.nextXp)));
  $('pmHead').innerHTML += `<span class="vipchip v-${c.vip}">${c.vipIcon} ${c.vipName}</span>`;
  $('pmStats').innerHTML = `<div class="pmrow"><span>⭐ Lv ${c.level} · ${esc(c.rank)}</span><span>🪙 ${fmt(c.chips)}</span></div><div class="xpbar"><i style="width:${lvPct}%"></i></div>
    <div class="pmrow small"><span>${c.online ? '🟢 online' : '⚪ offline'}</span><span>${c.hands} hands</span></div>
    <div class="medals">${c.medals.length ? c.medals.map(m => `<button type="button" class="medal" data-tip="${esc(m.name)}" data-tipd="${esc(m.desc || '')}">${m.icon}</button>`).join('') : '<span class="small">No medals yet</span>'}</div>`;
  ['pmFriend', 'pmMsg', 'pmBlock', 'pmKick'].forEach(id => $(id).classList.toggle('hidden', !!c.self));
  const canBack = table && !table.tourney && table.phase === 'betting' && !c.self && table.seats.some(x => x && x.name === c.name) && table.seats.some(x => x && x.name === me.name);
  $('pmBack').classList.toggle('hidden', !canBack); if (canBack) $('pmBack').textContent = `🎯 Back ${esc(c.display || c.name)}'s hand · ${fmt(Math.max(table.tier.min, betAmt()))}`;
  $('pmenu').classList.remove('hidden'); }
$('pmenu').onclick = e => { if (e.target === $('pmenu')) $('pmenu').classList.add('hidden'); };
$('pmClose').onclick = () => $('pmenu').classList.add('hidden');
$('pmFriend').onclick = () => { send({ type: 'friendAdd', name: pmTarget }); $('pmenu').classList.add('hidden'); };
$('pmMsg').onclick = () => { openDm(pmTarget); $('pmenu').classList.add('hidden'); };
$('pmBlock').onclick = () => { send({ type: 'block', name: pmTarget, on: !me.blocked.includes(pmTarget) }); $('pmenu').classList.add('hidden'); };
$('pmBack').onclick = () => { const amt = Math.max(table.tier.min, betAmt()); send({ type: 'backBet', target: pmTarget, amount: amt }); $('pmenu').classList.add('hidden'); };
$('pmKick').onclick = () => { send({ type: 'votekick', target: pmTarget }); $('pmenu').classList.add('hidden'); };
// ---------- emoji reactions: float off the seat and drift across the screen ----------
// hot bar = most-recently-used first (a newly used emoji jumps to slot 1), padded with defaults; slot count follows the bar's real width
const usage = () => { try { const v = JSON.parse(localStorage['emojiRecent:' + (me && me.name)] || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const QUICK_DEF = ['👍', '😂', '🔥', '🎉', '😱', 'GG', '💰', '🙏', '😎', '👏'];
let quickKey = '';
// hot bar: stable slots. Using an emoji that is already in the bar never moves it; a new emoji replaces the least-used slot in place.
const lsKey = k => k + ':' + (me && me.name), lsGet = (k, d) => { try { const v = JSON.parse(localStorage[lsKey(k)] || 'null'); return v ?? d; } catch { return d; } };
function hotSlots(n) { let sl = lsGet('emojiSlots', null); if (!Array.isArray(sl)) sl = [...new Set([...usage(), ...QUICK_DEF])];
  for (const e of QUICK_DEF) { if (sl.length >= n) break; if (!sl.includes(e)) sl.push(e); } return sl.slice(0, Math.max(n, 5)); }
function renderQuick() { const bar = $('quickBar'); if (!bar.clientWidth) { quickKey = ''; return; } /* v0.16.1: never size the row while hidden (wrong width -> wrong count -> buttons resize later) */ const w = bar.clientWidth, n = Math.max(5, Math.min(10, Math.floor(w / 34))), list = hotSlots(n).slice(0, n), key = list.join('|');
  if (key === quickKey && bar.children.length === list.length) return; quickKey = key; const prev = [...bar.children].map(b => b.textContent);
  bar.innerHTML = list.map(e => `<button type="button">${e}</button>`).join('');
  if (!reduced) [...bar.children].forEach((b, i) => { if (prev.length && prev[i] !== list[i]) b.animate([{ transform: 'scale(.2) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: .7 }, { transform: 'none' }], 260); }); }
addEventListener('resize', () => { quickKey = ''; if (me) renderQuick(); });
function react(e) { send({ type: 'react', emoji: e }); const cnt = lsGet('emojiCount', {}); cnt[e] = (cnt[e] || 0) + 1;
  const bar = $('quickBar'), n = Math.max(5, bar.children.length || 5), sl = hotSlots(n);
  if (!sl.slice(0, n).includes(e)) { let k = 0; for (let i = 0; i < n; i++) if ((cnt[sl[i]] || 0) <= (cnt[sl[k]] || 0)) k = i; sl[k] = e; }
  localStorage[lsKey('emojiSlots')] = JSON.stringify(sl); localStorage[lsKey('emojiCount')] = JSON.stringify(cnt); renderQuick(); }
// rapid taps: no client-side delay (server allows a burst of 8, refilling 4/s); pointerdown so fast double-taps never get eaten as zoom/click delay
$('quickBar').addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); b.animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], 160); react(b.textContent); });
$('picker').onclick = e => { if (e.target.tagName === 'BUTTON') { react(e.target.textContent); $('picker').classList.add('hidden'); } };
// emoji picker for the chat input: inserts at the caret and keeps the keyboard/focus on the input
const CHAT_EMO = ['😀','😂','🤣','😅','😎','🤩','😍','🥳','😉','😏','🤔','😮','😱','😭','😤','😡','🤯','🤑','🙄','😴','👍','👎','👏','🙌','🙏','💪','🤞','✌️','🤝','👋','🔥','💯','💥','✨','⭐','🎉','🍀','💎','💰','🪙','🃏','♠️','♥️','♦️','♣️','🎲','🏆','👑','🚀','💀','👻','🐐','🦈','🍿','☕','🍕','🍻','❤️','💔','😈'];
$('chatPicker').innerHTML = CHAT_EMO.map(e => `<button type="button">${e}</button>`).join('');
function toggleChatPicker(on) { const p = $('chatPicker'), open = on ?? p.classList.contains('hidden'); p.classList.toggle('hidden', !open); $('chatEmo').classList.toggle('on', open); placeChatStack(); }
$('chatEmo').addEventListener('pointerdown', e => { e.preventDefault(); toggleChatPicker(); });
$('chatEmo').onclick = e => e.preventDefault();
$('chatPicker').addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); const i = $('chatIn'), a = i.selectionStart ?? i.value.length, z = i.selectionEnd ?? a;
  if ((i.value.length - (z - a) + b.textContent.length) > 200) return; i.value = i.value.slice(0, a) + b.textContent + i.value.slice(z); const c = a + b.textContent.length; i.setSelectionRange(c, c); if (document.activeElement !== i) i.focus({ preventScroll: true }); });
// chat bar open: lift the message feed above the bar (and the emoji picker) so nothing is covered
function placeChatStack() { const host = $('chatBar').parentElement, open = !$('chatBar').classList.contains('hidden'), emo = open && !$('chatPicker').classList.contains('hidden');
  host.classList.toggle('chatting', open); host.classList.toggle('chatemo', emo); }
$('pickBtn').onclick = () => { $('chatMenu').classList.add('hidden'); $('picker').classList.toggle('hidden'); placePicker(); };
// v0.15: in the coin/roulette/craps chat lanes the reaction picker had ~14px of room (42% of a thin lane); float it above the lane instead
function placePicker() { const e = $('picker'), lane = e.parentElement; e.classList.remove('floatpk'); e.style.top = e.style.bottom = e.style.height = ''; if (e.classList.contains('hidden') || !lane || !lane.classList.contains('chatlane')) return;
  const r = lane.getBoundingClientRect(), want = Math.min(216, Math.round(innerHeight * .45)); e.classList.add('floatpk');
  if (r.top - 8 >= Math.min(want, 120)) { e.style.bottom = Math.round(innerHeight - r.top + 4) + 'px'; e.style.height = Math.min(want, Math.round(r.top - 8)) + 'px'; }
  else { e.style.top = '8px'; e.style.height = Math.max(90, Math.min(want, Math.round(r.bottom - 8))) + 'px'; } }
addEventListener('resize', () => placePicker && $('picker') && placePicker());
const ANIM = { '🔥': 'flicker', '❤️': 'beat', '💔': 'beat', '😂': 'shake', '🤣': 'shake', '🎉': 'spin', '🎊': 'spin', '🪙': 'coin', '💰': 'bounce', '👏': 'clap', '😱': 'shake', '🤯': 'grow', '💥': 'grow', '🚀': 'rocket', '👋': 'wave', '🎲': 'spin', '⭐': 'spin', '✨': 'flicker', '💯': 'beat', '👍': 'bounce' };
function floatEmoji(i, emoji, name) {
  const so = SOCIAL[view], seat = (i >= 0 && view === 'table' && $('seat' + i)) || (name && so && so.seats && document.querySelector(`#${so.seats} [data-cname="${CSS.escape(name)}"]`)); if (!seat) return; const r = seat.getBoundingClientRect(), el = document.createElement('div');
  el.className = 'floater'; el.innerHTML = `<span class="em a-${ANIM[emoji] || 'wobble'}">${esc(emoji)}</span>`; el.style.left = r.left + r.width / 2 - 22 + 'px'; el.style.top = r.top + 10 + 'px';
  $('fx').appendChild(el); SFX.pop();
  if (reduced) { el.animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 0 }], 1800).onfinish = () => el.remove(); return; }
  const x0 = r.left + r.width / 2 - 22, dx = Math.max(-x0 + 4, Math.min(innerWidth - 48 - x0, (Math.random() - .5) * 240)), dy = -(innerHeight * (.45 + Math.random() * .25)), rot = (Math.random() - .5) * 60;
  el.animate([{ transform: 'translate(0,0) scale(.3)', opacity: 0 }, { transform: `translate(${dx * .2}px,-40px) scale(1.4)`, opacity: 1, offset: .12 },
    { transform: `translate(${dx * .6}px,${dy * .55}px) scale(1.1) rotate(${rot / 2}deg)`, opacity: 1, offset: .6 }, { transform: `translate(${dx}px,${dy}px) scale(.9) rotate(${rot}deg)`, opacity: 0 }],
    { duration: 3000, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => el.remove();
}
// ---------- table chat: session backlog + optional auto-fade, keyboard-safe input ----------
const opt = { chat: localStorage.optChat !== '0', friends: localStorage.optFriends === '1', fade: localStorage.optFade !== '0' };
$('optChat').checked = opt.chat; $('optFriends').checked = opt.friends; $('optFade').checked = opt.fade;
function setFade(v) { opt.fade = v; localStorage.optFade = v ? '1' : '0'; $('optFade').checked = v; $('fadeTog').textContent = `💬 Auto-fade chat: ${v ? 'on' : 'off'}`; $('chatWrap').classList.toggle('autofade', v); wakeChat(); }
$('optChat').onchange = () => { opt.chat = $('optChat').checked; localStorage.optChat = opt.chat ? '1' : '0'; $('chatWrap').classList.toggle('hidden', !opt.chat); };
$('optFriends').onchange = () => { opt.friends = $('optFriends').checked; localStorage.optFriends = opt.friends ? '1' : '0'; };
$('optFade').onchange = () => setFade($('optFade').checked); $('fadeTog').onclick = () => setFade(!opt.fade);
$('chatWrap').classList.toggle('hidden', !opt.chat);
let fadeT;
function wakeChat() { const w = $('chatWrap'); w.classList.remove('faded'); clearTimeout(fadeT); if (opt.fade && !w.classList.contains('open')) fadeT = setTimeout(() => w.classList.add('faded'), 8000); }
function updateChatUp() {}
function chatHistory(open) { const w = $('chatWrap'); w.classList.toggle('open', open); $('chatClose').classList.toggle('hidden', !open); wakeChat(); const f = $('chatFeed'); f.scrollTop = f.scrollHeight;
  if (open && !reduced) f.animate([{ transform: 'translateY(12px)', opacity: .4 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'ease-out' }); }
function addChat(m, quiet) {
  if (me.blocked.includes(m.name) || chatMuted().includes(m.name)) return;
  if (opt.friends && m.name !== me.name && !me.friends.some(f => f.name === m.name)) return;
  const f = $('chatFeed'), atBottom = f.scrollTop + f.clientHeight >= f.scrollHeight - 8;
  const d = document.createElement('div'); d.className = 'cmsg'; d.innerHTML = '<b></b> <span></span>'; d.children[0].textContent = (m.display || m.name) + ':'; d.children[0].dataset.name = m.name; d.children[1].textContent = m.text; evLinkify(d, m.text);
  f.appendChild(d); while (f.children.length > 100) f.firstChild.remove();
  if (atBottom || !$('chatWrap').classList.contains('open')) f.scrollTop = f.scrollHeight;
  updateChatUp(); if (!quiet) wakeChat();
}
// collapsed: tapping any message opens the scrollable history; open: tap a name for the player card, ✕ / tap outside closes
$('chatFeed').onclick = e => { if (!$('chatWrap').classList.contains('open')) return chatHistory(true); const n = e.target.dataset && e.target.dataset.name; if (n) openCard(n); };
$('chatClose').onclick = () => chatHistory(false);
$('chatFeed').addEventListener('wheel', e => { if (!$('chatWrap').classList.contains('open') && !document.body.classList.contains('docked') && e.deltaY < 0) chatHistory(true); }, { passive: true });
function closeChatUI(keepBar) { if (!keepBar) { if (document.activeElement === $('chatIn')) $('chatIn').blur(); $('chatBar').classList.add('hidden'); document.body.classList.remove('typing'); placeBar(); }
  toggleChatPicker(false); $('picker').classList.add('hidden'); $('chatMenu').classList.add('hidden'); if ($('chatWrap').classList.contains('open')) chatHistory(false); placeChatStack(); }
const CHAT_UI = '#chatBar,#chatPicker,#chatWrap,#chatMenu,#picker,#chatBtn,#pickBtn,#chatOpt,#quickBar';
document.addEventListener('pointerdown', e => { if (!SOCIAL[view] || e.target.closest(CHAT_UI)) return;
  const any = !$('chatBar').classList.contains('hidden') || !$('chatPicker').classList.contains('hidden') || !$('picker').classList.contains('hidden') || !$('chatMenu').classList.contains('hidden') || $('chatWrap').classList.contains('open');
  if (!any) return; if (e.target.closest('button, [data-a], .cbet, .spot, canvas')) { // v0.15.2: let the tapped game control get its click first, then close chat
    let done = false; const fin = () => { if (done) return; done = true; setTimeout(() => closeChatUI(), 0); }; document.addEventListener('click', fin, { once: true, capture: false }); setTimeout(fin, 700); return; }
  closeChatUI(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeChatUI(); });
// on-screen keyboard dismissed (Android back / hide keyboard) while the chat input still has focus: close the entry bar too
let kbBase = 0, kbOpen = false;
if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (document.activeElement !== $('chatIn')) { kbOpen = false; return; } const h = visualViewport.height;
  if (h < kbBase * .8) kbOpen = true; else if (kbOpen && h > kbBase * .9) { kbOpen = false; closeChatUI(); } });
function openChatBar() { if (document.body.classList.contains('docked')) { $('chatIn').focus(); return; } const bar = $('chatBar'), open = bar.classList.contains('hidden'); if (open) { kbBase = Math.max(window.visualViewport ? visualViewport.height : innerHeight, innerHeight * .5); kbOpen = false; } bar.classList.toggle('hidden', !open); $('picker').classList.add('hidden'); if (!open) toggleChatPicker(false); placeChatStack(); if (open) { $('chatIn').focus(); wakeChat(); const f = $('chatFeed'); f.scrollTop = f.scrollHeight; } }
$('chatBtn').onclick = openChatBar;
$('chatOpt').onclick = () => { $('picker').classList.add('hidden'); $('chatMenu').classList.toggle('hidden'); };
function sendChat() { const v = $('chatIn').value.trim(); if (v) send({ type: 'chat', text: v.slice(0, 200) }); $('chatIn').value = ''; }
$('chatBar').onsubmit = e => { e.preventDefault(); sendChat(); $('chatIn').focus(); };
$('chatIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendChat(); } });
$('chatIn').onblur = () => setTimeout(() => { document.body.classList.remove('typing'); placeBar(); if (!$('chatIn').value && document.activeElement !== $('chatIn') && $('chatPicker').classList.contains('hidden')) { $('chatBar').classList.add('hidden'); placeChatStack(); } }, 200);
$('chatIn').onfocus = () => { if (document.body.classList.contains('docked')) return; document.body.classList.add('typing'); placeBar(); setTimeout(placeBar, 300); };
// keep the chat bar (and its Send button) glued to the top of the on-screen keyboard
function placeBar() { const bar = $('chatBar'); if (!document.body.classList.contains('typing') || !window.visualViewport) { bar.style.top = ''; liftChat(null); return; }
  const vv = visualViewport, q = $('quickRow'), qr = q && q.offsetParent ? q.getBoundingClientRect() : null, kbTop = Math.min(vv.offsetTop + vv.height, innerHeight - kbHeight());
  // no on-screen keyboard: sit exactly over the reaction row it replaces, so nothing in the game moves or gets covered
  const kb = !qr || qr.bottom > kbTop + 1 || qr.height < 20; bar.classList.toggle('anch', !kb);
  if (!kb && qr) { bar.style.top = Math.round(qr.top + qr.height / 2 - bar.offsetHeight / 2) + 'px'; liftChat(null); return; }
  const top = Math.max(0, kbTop - bar.offsetHeight - 6); bar.style.top = top + 'px'; liftChat(top); }
// v0.14: with the on-screen keyboard up, lift the recent messages so they sit directly above the entry bar (visualViewport based, layout stays frozen)
function liftChat(barTop) { const w = $('chatWrap'), f = $('chatFeed'); if (barTop == null) { if (w.classList.contains('kbup')) { w.classList.remove('kbup'); w.style.bottom = w.style.maxHeight = ''; f.style.maxHeight = ''; } return; }
  const vv = window.visualViewport, room = Math.max(40, barTop - (vv ? vv.offsetTop : 0) - 10); w.classList.add('kbup'); w.style.bottom = Math.round(innerHeight - barTop + 4) + 'px'; f.style.maxHeight = Math.round(Math.min(170, room)) + 'px'; f.scrollTop = f.scrollHeight; }
if (window.visualViewport) { visualViewport.addEventListener('resize', placeBar); visualViewport.addEventListener('scroll', placeBar); }
// chat nodes are shared by the blackjack and craps felts
// ---------- shared social layer: chat strip/history, emoji picker, hot emoji bar and floating reactions work the same in every game room ----------
// lane = where the chat nodes live, seats = the player strip reactions float from (blackjack uses its seats by index)
const SOCIAL = { table: { lane: 'felt', seats: null }, craps: { lane: 'cLane', seats: 'cseats' }, coin: { lane: 'kLane', seats: 'kPlayers' }, slots: null /* single-player: social layer disabled (set { lane, seats } to enable) */, roulette: { lane: 'rLane', seats: 'rSeats' } };
function renderSlotsRoom(players) { if (!$('sPlayers')) return; $('sPlayers').innerHTML = (players || []).map(p => `<div class="cseat ${p.name === me.name ? 'me' : ''}" data-cname="${esc(p.name)}"><div class="av" style="background-image:url(${avUrl(p.avatar)})"><span class="vipb">${VIPI[p.vip] || ''}</span></div><div class="nm">${esc(p.display)}</div></div>`).join(''); }
if ($('sPlayers')) $('sPlayers').onclick = e => { const el = e.target.closest('[data-cname]'); if (el) openCard(el.dataset.cname); };
// wide screens (tablet landscape / desktop): chat lives in a side dock next to the centred game instead of overlaying it
wide = document.body.classList.contains('wide'); function wideChanged(w) { wide = w; if (chatReady) placeChat(view); }
chatReady = true;
function placeChat(v) { const docked = wide && !!SOCIAL[v]; document.body.classList.toggle('docked', docked); $('chatDock').classList.toggle('hidden', !docked);
  const host = docked ? $('chatDock') : $((SOCIAL[v] || SOCIAL.table).lane); ['chatWrap', 'chatPicker', 'chatBar', 'chatMenu', 'picker'].forEach(id => { if ($(id).parentElement !== host) host.appendChild($(id)); });
  const ctl = document.querySelector(`#${SOCIAL[v] ? v : 'table'} .controls`); if (SOCIAL[v] && $('quickRow').parentElement !== ctl) { ctl.appendChild($('quickRow')); quickKey = ''; if (me) requestAnimationFrame(renderQuick); }
  placeChatStack(); }
// ---------- private messenger ----------
const dms = {}, unread = {}; let openTabs = JSON.parse(sessionStorage.tabs || '[]'), activeTab = null;
function friendInfo(n) { return me.friends.find(f => f.name === n) || { name: n, display: n, avatar: 0 }; }
function onDm(m) { const other = m.from === me.name ? m.to : m.from; (dms[other] = dms[other] || []).push(m);
  if (m.from !== me.name && !(activeTab === other && !$('msgPanel').classList.contains('hidden'))) { unread[other] = (unread[other] || 0) + 1; SFX.pop(); }
  if (!openTabs.includes(other)) openTabs.push(other); renderTabs(); renderMsgs(); renderBubbles(); }
function openDm(n) { if (!openTabs.includes(n)) openTabs.push(n); activeTab = n; unread[n] = 0; send({ type: 'dmHistory', name: n }); $('msgPanel').classList.remove('hidden'); renderTabs(); renderMsgs(); renderBubbles(); }
function renderTabs() { sessionStorage.tabs = JSON.stringify(openTabs);
  $('mTabs').innerHTML = openTabs.map(n => { const f = friendInfo(n); return `<span class="mtab ${n === activeTab ? 'on' : ''}" data-tab="${n}"><span class="av sm" style="background-image:url(${avUrl(f.avatar)})"></span>${esc(f.display)}${unread[n] ? `<span class="badge">${unread[n]}</span>` : ''}<button class="x" data-close="${n}">×</button></span>`; }).join(''); }
function rxPills(m) { const r = m.reactions || {}, ks = Object.keys(r).filter(k => r[k].length); if (!ks.length) return '';
  return `<div class="rxs">${ks.map(k => `<button type="button" class="rx ${r[k].includes(me.name) ? 'mine' : ''}" data-rx="${esc(k)}" data-id="${m.id}" title="${esc(r[k].join(', '))}">${esc(k)}<b>${r[k].length}</b></button>`).join('')}</div>`; }
function renderMsgs(keep) { const list = dms[activeTab] || [], box = $('mMsgs'), st = box.scrollTop, atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
  box.innerHTML = ''; for (const m of list) { const w = document.createElement('div'); w.className = 'mrow ' + (m.from === me.name ? 'mine' : ''); const d = document.createElement('div'); d.className = 'mmsg ' + (m.from === me.name ? 'mine' : '') + (m.kind ? ' sys' : ''); if (m.id) d.dataset.mid = m.id;
    const t = document.createElement('span'); t.textContent = m.text; d.appendChild(t); evLinkify(d, m.text); w.appendChild(d); w.insertAdjacentHTML('beforeend', rxPills(m));
    if (m.kind === 'request' && m.to === me.name && me.chipReqs.some(r => r.id === m.reqId)) d.insertAdjacentHTML('beforeend', ` <button class="tiny primary" data-ans="${m.reqId}" data-acc="1">Accept</button><button class="tiny" data-ans="${m.reqId}">Decline</button>`);
    box.appendChild(w); } box.scrollTop = keep && !atEnd ? st : 1e9; }
// DM reactions: tap (or long-press) a message -> quick row of 6 + "more"; tap a pill to toggle your reaction
const DM_QUICK = ['❤️', '😂', '👍', '😮', '😭', '🔥'];
let rxTarget = null;
function openRx(el) { const p = $('rxPop'); rxTarget = el.dataset.mid; p.classList.remove('more'); p.innerHTML = DM_QUICK.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('') + '<button type="button" class="rxmore" data-more="1">＋</button><div class="rxall">' + (reactions || []).map(e => `<button type="button" data-e="${esc(e)}">${esc(e)}</button>`).join('') + '</div>';
  const m = (dms[activeTab] || []).find(x => x.id === rxTarget), mineSet = m && m.reactions ? Object.keys(m.reactions).filter(k => m.reactions[k].includes(me.name)) : [];
  p.querySelectorAll('[data-e]').forEach(b => b.classList.toggle('on', mineSet.includes(b.dataset.e)));
  p.classList.remove('hidden'); const r = el.getBoundingClientRect(), pr = $('msgPanel').getBoundingClientRect(), w = p.offsetWidth;
  p.style.left = Math.max(4, Math.min(pr.width - w - 4, r.left - pr.left + (el.classList.contains('mine') ? r.width - w : 0))) + 'px'; p.style.top = Math.max(4, r.top - pr.top - p.offsetHeight - 4) + 'px';
  document.querySelectorAll('.mmsg.rxsel').forEach(x => x.classList.remove('rxsel')); el.classList.add('rxsel');
  if (!reduced) p.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 160, easing: 'cubic-bezier(.3,1.4,.6,1)' }); }
function closeRx() { $('rxPop').classList.add('hidden'); rxTarget = null; document.querySelectorAll('.mmsg.rxsel').forEach(x => x.classList.remove('rxsel')); }
function dmReact(id, e) { if (activeTab && id) send({ type: 'dmReact', name: activeTab, id, emoji: e }); }
let lpT; $('mMsgs').addEventListener('pointerdown', e => { const el = e.target.closest('.mmsg[data-mid]'); clearTimeout(lpT); if (el) lpT = setTimeout(() => { lpT = 'fired'; openRx(el); }, 420); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => $('mMsgs').addEventListener(ev, () => { if (lpT !== 'fired') clearTimeout(lpT); }));
$('mMsgs').addEventListener('click', e => { const pill = e.target.closest('.rx'); if (pill) { dmReact(pill.dataset.id, pill.dataset.rx); pill.animate && pill.animate([{ transform: 'scale(1.3)' }, { transform: 'none' }], 180); return; }
  if (e.target.closest('button')) return; const el = e.target.closest('.mmsg[data-mid]'); if (lpT === 'fired') { lpT = null; return; } if (el && window.getSelection().isCollapsed) { rxTarget === el.dataset.mid && !$('rxPop').classList.contains('hidden') ? closeRx() : openRx(el); } else closeRx(); });
$('rxPop').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.more) { $('rxPop').classList.add('more'); return; } dmReact(rxTarget, b.dataset.e); closeRx(); });
function renderBubbles() { if (!me) return; const total = Object.values(unread).reduce((a, n) => a + n, 0); $('msgN').textContent = total ? (total > 99 ? '99+' : total) : ''; $('msgBtn').classList.toggle('has', !!total); }
$('msgBtn').onclick = () => { const p = $('msgPanel'); if (!p.classList.contains('hidden')) return p.classList.add('hidden');
  const first = Object.keys(unread).find(n => unread[n] > 0) || activeTab || openTabs[0] || (me.friends[0] && me.friends[0].name);
  if (!first) return toast('Add friends in your profile to message them'); openDm(first); };
$('mTabs').onclick = e => { const c = e.target.dataset.close; if (c) { openTabs = openTabs.filter(x => x !== c); delete unread[c]; if (activeTab === c) activeTab = openTabs[0] || null; if (!activeTab) $('msgPanel').classList.add('hidden'); else openDm(activeTab); renderTabs(); renderBubbles(); return; }
  const t = e.target.closest('[data-tab]'); if (t) openDm(t.dataset.tab); };
$('mMsgs').onclick = e => { const id = e.target.dataset.ans; if (id) send({ type: 'answerRequest', id, accept: !!e.target.dataset.acc }); };
$('mForm').onsubmit = e => { e.preventDefault(); const v = $('mIn').value.trim(); if (v && activeTab) send({ type: 'dm', to: activeTab, text: v }); $('mIn').value = ''; };
$('mMin').onclick = () => $('msgPanel').classList.add('hidden');
// v0.16 (fb_5a40a5ed87): gifts/requests in any amount: plain chips (2500) or with a K/M/B suffix (250K, 1.5M); server enforces the minimum
const parseAmt = v => { const m = /^\s*([\d.,]+)\s*([kmb])?\s*$/i.exec(String(v || '')); if (!m) return NaN; const n = +m[1].replace(/,/g, ''), k = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1; return Number.isFinite(n) ? Math.round(n * k) : NaN; };
const giftAmt = () => { const a = parseAmt($('mAmt').value), min = (me && me.giftMin) || 1000; if (!(a >= min)) { toast(`Enter an amount of at least ${fmt(min)} (e.g. 2500, 250K, 1.5M)`); return 0; } return a; };
$('mSend').onclick = () => { const a = giftAmt(); if (a && activeTab && confirm(`Send ${a.toLocaleString("en-US")} chips to ${friendInfo(activeTab).display}?`)) send({ type: 'sendChips', to: activeTab, amount: a }); };
$('mReq').onclick = () => { const a = giftAmt(); if (a && activeTab) send({ type: 'requestChips', to: activeTab, amount: a }); };
// ---------- rewarded ads (Google H5 Ad Placement API, falls back to stub) ----------
function loadAds() { if (cfg.ads.provider !== 'h5') return;
  window.adsbygoogle = window.adsbygoogle || []; window.adBreak = window.adConfig = function (o) { adsbygoogle.push(o); };
  const s = document.createElement('script'); s.async = true; s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.ads.client);
  s.crossOrigin = 'anonymous'; s.dataset.adClient = cfg.ads.client; if (cfg.ads.test) s.dataset.adbreakTest = 'on'; document.head.appendChild(s);
  adConfig({ preloadAdBreaks: 'on', sound: 'on' }); }
function runAd(token) {
  if (cfg.ads.provider === 'h5' && window.adBreak) { let shown = false;
    adBreak({ type: 'reward', name: 'chip_booster', beforeReward: showAdFn => { shown = true; muted || (actx && actx.suspend()); showAdFn(); },
      adViewed: () => send({ type: 'adClaim', token }), adDismissed: () => toast('Ad closed early — no reward'), afterAd: () => actx && actx.resume(),
      adBreakDone: info => { if (!shown) toast('No ad available right now (' + info.breakStatus + ')'); } }); return; }
  // stub: simulated ad
  let n = 2; $('adCount').textContent = n; $('adOverlay').classList.remove('hidden');
  const iv = setInterval(() => { n--; $('adCount').textContent = n; if (n <= 0) { clearInterval(iv); $('adOverlay').classList.add('hidden'); send({ type: 'adClaim', token }); } }, 1000);
}
$('ad').onclick = () => send({ type: 'adStart' });
// ---------- misc ----------
$('go').onclick = () => send({ type: 'login', username: $('uname').value, password: $('pw').value });
$('agree').onchange = () => { if ($('agree').checked) { $('agree').parentNode.classList.remove('need'); $('toast').style.display = 'none'; } };
$('reg').onclick = () => { if (!$('agree').checked) { toast('Please tick the box to accept the Terms and Privacy Policy'); $('agree').parentNode.classList.add('need'); return; } send({ type: 'register', terms: 1, dob: $('dob').value, username: $('uname').value, password: $('pw').value, email: $('regEmail').value.trim() || undefined }); };
$('logout').onclick = () => { sessionStorage.clear(); room = ''; send({ type: 'logout' }); };
$('joinCode').onclick = () => send({ type: 'join', code: $('code').value.trim() });
$('daily').onclick = () => send({ type: 'daily' });
$('leave').onclick = () => { sessionStorage.removeItem('lastTable'); send({ type: 'leave' }); };
$('clear').onclick = () => send({ type: 'clear' }); $('deal').onclick = () => send({ type: 'deal' });
document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => send({ type: 'action', action: b.dataset.a }));
function shareInvite() { const url = location.origin + '/?t=' + table.code; if (navigator.share) navigator.share({ title: 'Join my blackjack table', url }).catch(() => {}); else navigator.clipboard.writeText(url).then(() => toast('Invite link copied')); }
if (inviteCode) $('inviteNote').textContent = `🎟 Log in to join your friend's table (${inviteCode})`;
$('storeBtn').onclick = () => me.age18 ? openStore() : $('age').classList.remove('hidden');
$('ageYes').onclick = () => { send({ type: 'age', ok: true }); me.age18 = true; $('age').classList.add('hidden'); openStore(); };
$('ageNo').onclick = () => $('age').classList.add('hidden'); $('closeStore').onclick = () => $('store').classList.add('hidden');
async function openStore() {
  $('mode').textContent = cfg.stripeTest ? '[STRIPE TEST MODE]' : '[MOCK CHECKOUT — no payment]';
  if (!cfg.compliance) { $('packs').innerHTML = cfg.packs.map(p => `<button class="pack" onclick="buy('${p.id}')">🪙 ${fmt(p.chips)} chips${me.storeBonus ? ` + ${fmt(Math.floor(p.chips * me.storeBonus / 100))} VIP bonus` : ''} — $${(p.usd / 100).toFixed(2)} (test) <small>· +${p.usd} VIP pts</small></button>`).join(''); $('store').classList.remove('hidden'); return; }
  $('packs').innerHTML = cfg.packs.map(p => `<button class="pack" onclick="buy('${p.id}')"><b>${esc(p.name || '')}</b> · 🪙 ${fmt(p.chips)} chips${me.storeBonus ? ` + ${fmt(Math.floor(p.chips * me.storeBonus / 100))} VIP bonus` : ''}<br><span class="price">A$${(p.aud / 100).toFixed(2)} incl. GST (A$${(p.gst / 100).toFixed(2)})</span> <small>· +${p.aud} VIP pts · virtual chips only, no monetary value</small></button>`).join('');
  $('store').classList.remove('hidden');
}
async function buy(pack) { const r = await (await fetch('/api/checkout', { method: 'POST', body: JSON.stringify({ token: me.token, pack }) })).json(); if (r.url) location.href = r.url; else toast(r.error); }
const paid = new URLSearchParams(location.search).get('paid');
if (paid) fetch('/api/verify', { method: 'POST', body: JSON.stringify({ session: paid }) }).then(r => r.json()).then(r => { toast(r.credited ? 'Chips added!' : 'Already credited'); history.replaceState(0, '', '/'); });
// standalone: no service worker
fetch('/api/config').then(r => r.json()).then(c => { cfg = c; document.body.classList.toggle('compliance', !!c.compliance); reactions = c.reactions; $('picker').innerHTML = reactions.map(e => `<button>${e}</button>`).join(''); loadAds(); });

// ---------- developer mode ----------
const CLIENT_VERSION = '0.16.4';
const recentErrors = [];
window.addEventListener('error', e => { recentErrors.push({ t: Date.now(), msg: String(e.message).slice(0, 200), src: (e.filename || '').split('/').pop() + ':' + e.lineno }); recentErrors.splice(0, recentErrors.length - 10); });
window.addEventListener('unhandledrejection', e => { recentErrors.push({ t: Date.now(), msg: 'unhandled: ' + String(e.reason).slice(0, 200) }); recentErrors.splice(0, recentErrors.length - 10); });
const _origToast = toast; toast = function (t) { if (/error|failed|invalid/i.test(t)) { recentErrors.push({ t: Date.now(), msg: 'toast: ' + t }); recentErrors.splice(0, recentErrors.length - 10); } _origToast(t); };
function devRender() { if (!me) return; const isDev = me.role === 'developer';
  $('bugBtn').classList.toggle('hidden', !isDev); $('devTab').classList.toggle('hidden', !isDev);
  $('roleTag').textContent = isDev ? '🛠 Developer mode active' : '';
  $('bell').classList.toggle('hidden', !(me.notifications && me.notifications.length)); $('bellN').textContent = me.unreadNotifs || '';
  if (!$('nModal').classList.contains('hidden')) renderNotifs(); }
const _rp2 = renderProfile; renderProfile = function () { _rp2(); devRender(); };
$('devRedeem').onclick = () => { send({ type: 'redeemCode', code: $('devCode').value.trim() }); $('devCode').value = ''; };
function buildContext() {
  const myIdx = table ? table.seats.findIndex(s => s && s.name === me.name) : -1, mine = myIdx >= 0 ? table.seats[myIdx] : null;
  return { screen: view, tableId: table && table.id, tier: table && table.tier.id, phase: table && table.phase, seat: myIdx >= 0 ? myIdx : null,
    hands: mine ? mine.hands.map(h => ({ cards: h.cards.map(c => c.r + c.s).join(' '), score: h.score, bet: h.bet, result: h.result })) : null,
    dealer: table ? table.dealer.map(c => c.r + c.s).join(' ') : null, viewport: { w: innerWidth, h: innerHeight, vv: window.visualViewport ? Math.round(visualViewport.height) : null, vvw: window.visualViewport ? Math.round(visualViewport.width) : null, appH, dpr: devicePixelRatio, ratio: +(innerWidth / innerHeight).toFixed(3), screen: screen.width + 'x' + screen.height, orientation: (screen.orientation && screen.orientation.type) || (innerWidth > innerHeight ? 'landscape' : 'portrait'), layout: ['land', 'wide', 'tall', 'tabp', 'docked', 'typing'].filter(c => document.body.classList.contains(c)).join(' ') || 'portrait', keyboard: typingNow(), touch: matchMedia('(pointer:coarse)').matches, device: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '' },
    clientVersion: CLIENT_VERSION, userAgent: navigator.userAgent.slice(0, 160), online: ws && ws.readyState === 1, recentErrors: recentErrors.slice(-10), ts: new Date().toISOString() };
}
function buildSnapshot() { return { table, profile: { name: me.name, chips: me.chips, role: me.role }, ui: { picker: !$('picker').classList.contains('hidden'), chatBar: !$('chatBar').classList.contains('hidden'),
  messenger: !$('msgPanel').classList.contains('hidden'), openTabs, activeTab, opt, banner: $('banner').textContent, toast: $('toast').style.display === 'block' ? $('toast').textContent : null } }; }
$('bugBtn').onclick = () => { const c = buildContext(); $('fbCtx').textContent = `Auto context: ${c.screen}${c.tableId ? ' · table ' + c.tableId + ' (' + c.tier + ', ' + c.phase + ')' : ''}${c.seat !== null ? ' · seat ' + c.seat : ''} · ${c.viewport.w}x${c.viewport.h} · v${c.clientVersion} · ${c.recentErrors.length} recent errors`; $('fbModal').classList.remove('hidden'); $('fbText').focus(); };
$('fbClose').onclick = () => $('fbModal').classList.add('hidden');
document.addEventListener('pointerdown', e => { const b = e.target.closest('.modal button, .chatbar button, .msgpanel button'); if (b && typingNow()) e.preventDefault(); }, true); // v0.15.1 (fb_43267e6d96): first tap on Send sends
$('fbSend').onclick = () => { send({ type: 'feedback', text: $('fbText').value, context: buildContext(), snapshot: $('fbSnap').checked ? buildSnapshot() : null }); $('fbText').value = ''; $('fbModal').classList.add('hidden'); };
function renderNotifs() { const list = (me.notifications || []).slice().reverse();
  $('nList').innerHTML = list.map(n => `<div class="notif ${n.read ? '' : 'unread'}"><div class="small">${new Date(n.ts).toLocaleString()} · re: “${esc(n.feedbackText || '')}”</div><div class="ntext"></div>
    ${n.options && n.options.length ? `<div>${n.options.map(o => `<button class="tiny ${n.choice === o ? 'primary' : ''}" ${n.choice ? 'disabled' : ''} data-nid="${n.id}" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : ''}</div>`).join('') || '<div class="small">No notifications</div>';
  [...$('nList').querySelectorAll('.ntext')].forEach((el, i) => el.textContent = list[i].text); }
$('bell').onclick = () => { renderNotifs(); $('nModal').classList.remove('hidden'); if (me.unreadNotifs) send({ type: 'notifRead' }); };
$('nClose').onclick = () => $('nModal').classList.add('hidden');
$('nList').onclick = e => { const d = e.target.dataset; if (d.nid) send({ type: 'notifChoose', id: d.nid, choice: e.target.textContent }); };
// admin panel
let aRows = [];
$('myChipsBtn').onclick = () => { const v = Math.floor(+$('myChips').value); if (!(v >= 0)) return toast('Enter a chip amount'); send({ type: 'adminEdit', name: me.name, chips: v, display: me.display, avatar: me.avatar }); $('myChips').value = ''; };
// ---- developer player list: sortable, paginated, internal scroll; tap a row for the dev actions ----
const ago = ts => { if (!ts) return 'never'; const x = (Date.now() - ts) / 1000; return x < 60 ? 'just now' : x < 3600 ? Math.round(x / 60) + 'm ago' : x < 86400 ? Math.round(x / 3600) + 'h ago' : Math.round(x / 86400) + 'd ago'; };
let aState = { sort: 'seen', dir: '', page: 0, q: '' }, aOpen = null, aQT;
function aLoad() { send({ type: 'adminList', ...aState, size: 20 }); }
$('aQ').oninput = () => { clearTimeout(aQT); aQT = setTimeout(() => { aState.q = $('aQ').value.trim(); aState.page = 0; aLoad(); }, 250); };
$('aSort').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; const k = b.dataset.s; aState.dir = aState.sort === k ? (aState.dir === 'asc' ? 'desc' : 'asc') : ''; aState.sort = k; aState.page = 0; aLoad(); };
$('aPrev').onclick = () => { if (aState.page > 0) { aState.page--; aLoad(); } }; $('aNext').onclick = () => { aState.page++; aLoad(); };
document.querySelector('[data-pt="dev"]').addEventListener('click', aLoad);
$('aAuditBtn').onclick = () => send({ type: 'adminAudit' });
function rowActions(r) { const locked = r.role === 'developer' && r.name !== me.name;
  return locked ? '<div class="small">Developer account — read only</div>' : `<div class="rowl"><input class="aChips" type="number" value="${r.chips}" title="chips"><input class="aDisp" value="${esc(r.display)}" maxlength="20"><select class="aAv">${[...Array(8)].map((_, i) => `<option ${i === r.avatar ? 'selected' : ''}>${i}</option>`).join('')}</select><button class="tiny primary" data-act="save">Save</button></div>
   <div class="rowl"><button class="tiny" data-act="card">Player card</button><button class="tiny" data-act="reset">Reset</button>${r.name === me.name ? '' : `<button class="tiny" data-act="${r.banned ? 'unban' : 'ban'}">${r.banned ? 'Unban' : 'Ban'}</button><button class="tiny danger" data-act="delete">Delete</button>`}</div>`; }
function renderAdmin(m) { if (m) aList = m; const L = aList; if (!L) return;
  document.querySelectorAll('#aSort [data-s]').forEach(b => { b.classList.toggle('on', b.dataset.s === L.sort); b.dataset.dir = b.dataset.s === L.sort ? (L.dir === 'asc' ? '▲' : '▼') : ''; });
  $('aPage').textContent = `${L.page + 1}/${L.pages} · ${L.total} players · 🟢 ${L.online} online`; $('aPrev').disabled = L.page <= 0; $('aNext').disabled = L.page >= L.pages - 1;
  $('aRes').innerHTML = L.rows.map(r => `<div class="arow ${r.banned ? 'banned' : ''} ${aOpen === r.name ? 'open' : ''}" data-name="${r.name}"><div class="arl" data-act="toggle"><span class="av sm ${r.online ? 'online' : ''}" style="background-image:url(${avUrl(r.avatar)})"></span>
    <span class="an"><b>${esc(r.display)}</b><small>@${r.name}${r.role === 'developer' ? ' 🛠' : ''}${r.banned ? ' ⛔' : ''}</small></span><span class="av2"><span class="vipchip v-${r.vip}" title="${esc(r.vipName)}">${r.vipIcon || ''}</span> <small>Lv${r.level}</small></span>
    <span class="ac"><b>🪙${fmt(r.chips)}</b><small class="${r.online ? 'on' : ''}">${r.online ? '● online' : ago(r.lastSeen)}</small></span></div>${aOpen === r.name ? rowActions(r) : ''}</div>`).join('') || '<div class="small">No players</div>';
  aRows = L.rows; }
let aList = null;
$('aRes').onclick = e => { const t = e.target.closest('[data-act]'); if (!t) return; const act = t.dataset.act, row = t.closest('.arow'), name = row.dataset.name;
  if (act === 'toggle') { aOpen = aOpen === name ? null : name; renderAdmin(); if (!reduced && aOpen) { const el = $('aRes').querySelector('.arow.open'); el && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } return; }
  if (act === 'card') return openCard(name);
  if (act === 'save') send({ type: 'adminEdit', name, chips: +row.querySelector('.aChips').value, display: row.querySelector('.aDisp').value, avatar: +row.querySelector('.aAv').value });
  if (act === 'reset' && confirm('Reset chips & progress for ' + name + '?')) send({ type: 'adminReset', name });
  if (act === 'ban' && confirm('Ban ' + name + '?')) send({ type: 'adminBan', name, on: true });
  if (act === 'unban') send({ type: 'adminBan', name, on: false });
  if (act === 'delete' && confirm('Permanently delete ' + name + '?')) { send({ type: 'adminDelete', name }); aOpen = null; }
  setTimeout(aLoad, 300); };
// ---- Dev Log screen: TODO (add / edit / reorder / check off), changelog receipts, versions, feedback resolution ----
let DL = null, dlTab = 'todo', dlEdit = null, dlFb = [], dlFbF = 'open', dlFrom = 'profile';
$('openDevlog').onclick = () => { dlFrom = view; send({ type: 'devlog' }); send({ type: 'feedbackList' }); show('devlog'); };
$('dlBack').onclick = () => show(dlFrom === 'devlog' ? 'profile' : dlFrom);
document.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => { dlTab = b.dataset.dl; document.querySelectorAll('[data-dl]').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.dlpane').forEach(p => p.classList.toggle('hidden', p.id !== 'dl-' + dlTab)); if (dlTab === 'fb') send({ type: 'feedbackList' }); });
const PRI = { urgent: '🔴', high: '🟠', normal: '', low: '⚪' }, ST = { open: '○', 'in-progress': '◐' };
const dday = ts => ts ? new Date(ts).toISOString().slice(0, 10) : '';
function fbChips(ids) { return (ids || []).map(id => `<span class="fbid" data-fb="${id}">${id}</span>`).join(''); }
// v0.15 release notes: summary paragraph + New features + Fixes (each with a one-line description)
const relList = (h, L) => L && L.length ? `<div class="rnh">${h}</div><ul class="rnl">${L.map(e => `<li><b>${esc(e.title)}</b>${e.desc ? ` — ${esc(e.desc)}` : ''}</li>`).join('')}</ul>` : '';
const relNotes = v => `${v.summary ? `<p class="rsum">${esc(v.summary)}</p>` : ''}${relList('✨ New features', v.features)}${relList('🔧 Fixes', v.fixes)}`;
const relLines = L => (L || []).map(e => e.title + (e.desc ? ' — ' + e.desc : '')).join('\n');
let dlVerEdit = null;
function renderDevlog() { if (!DL) return; $('dlN').textContent = DL.todos.length || ''; $('dlNext').textContent = DL.next ? `next: ${DL.next}` : '';
  $('dlTodos').innerHTML = DL.todos.map((t, i) => dlEdit === t.id ? `<div class="todo edit" data-id="${t.id}"><input class="eT" value="${esc(t.title)}" maxlength="140"><textarea class="eN" maxlength="2000" placeholder="Notes">${esc(t.notes)}</textarea>
      <div class="rowl"><select class="eS">${['open', 'in-progress'].map(x => `<option ${x === t.status ? 'selected' : ''}>${x}</option>`).join('')}</select><select class="eP">${['urgent', 'high', 'normal', 'low'].map(x => `<option ${x === t.priority ? 'selected' : ''}>${x}</option>`).join('')}</select><input class="eF" value="${t.feedback.join(', ')}" placeholder="fb_… ids"></div>
      <div class="rowl"><button class="tiny primary" data-do="save">Save</button><button class="tiny" data-do="cancel">Cancel</button></div></div>`
    : `<div class="todo p-${t.priority} s-${t.status}" data-id="${t.id}"><button class="chk" data-do="done" title="Check off → changelog">✓</button><div class="tb" data-do="edit"><div class="tt">${PRI[t.priority]}${ST[t.status] || ''} ${esc(t.title)}</div>
      ${t.notes ? `<div class="tn">${esc(t.notes)}</div>` : ''}<div class="tm">${fbChips(t.feedback)}<span>${esc(t.createdBy || '')} · ${dday(t.createdAt)}${t.updatedAt !== t.createdAt ? ` · ✎ ${esc(t.updatedBy || '')}` : ''}</span></div></div>
      <div class="mv"><button class="tiny" data-do="up" ${i ? '' : 'disabled'}>▲</button><button class="tiny" data-do="down" ${i < DL.todos.length - 1 ? '' : 'disabled'}>▼</button></div></div>`).join('') || '<div class="small">Nothing to do 🎉</div>';
  $('dlLog').innerHTML = DL.versions.slice().reverse().map(v => `<div class="receipt ${v.released ? '' : 'next'}"><div class="rh"><b>${esc(v.v)}</b><span>${v.released ? esc(v.date || 'date unknown') : 'NEXT · unreleased'}</span></div>${v.title ? `<div class="rt">${esc(v.title)}</div>` : ''}${relNotes(v)}
    <details class="rcpt" ${v.summary ? '' : 'open'}><summary>Receipts</summary><div class="rl">${(v.items || []).map(it => `<div class="ri"><span>✔ ${esc(it.title)}</span>${it.feedback && it.feedback.length ? `<div class="rf">resolves ${fbChips(it.feedback)}</div>` : ''}<div class="rb">${esc(it.by || '')}${it.at ? ' · ' + dday(it.at) : ''}${it.notes ? ' · ' + esc(it.notes) : ''}</div></div>`).join('') || '<div class="small">No receipts yet</div>'}</div></details>
    <div class="rfoot">${(v.items || []).length} item${(v.items || []).length === 1 ? '' : 's'} · ${(v.items || []).reduce((a, it) => a + (it.feedback || []).length, 0)} feedback resolved</div></div>`).join('');
  $('dlVers').innerHTML = DL.versions.slice().reverse().map(v => `<div class="ver" data-v="${esc(v.v)}"><div class="rh"><b>${esc(v.v)}</b><span>${v.released ? esc(v.date || 'date unknown') : 'NEXT'}</span><button class="tiny" data-do="vedit">✎ Notes</button>${v.released ? '' : '<button class="tiny" data-do="release">Release</button>'}</div>${v.title ? `<div class="rt">${esc(v.title)}</div>` : ''}${v.notes ? `<div class="tn">${esc(v.notes)}</div>` : ''}
    ${dlVerEdit === v.v ? `<div class="vedit"><textarea class="vS" maxlength="2000" placeholder="Summary paragraph: what this version is about">${esc(v.summary || '')}</textarea>
      <textarea class="vF" placeholder="New features, one per line: Title — one-line description">${esc(relLines(v.features))}</textarea><textarea class="vX" placeholder="Fixes, one per line: Title — one-line description">${esc(relLines(v.fixes))}</textarea>
      <div class="rowl"><button class="tiny primary" data-do="vsave">Save notes</button><button class="tiny" data-do="vcancel">Cancel</button></div></div>` : relNotes(v)}</div>`).join('');
  renderFb(); }
function renderFb() { const L = dlFb.filter(f => dlFbF === 'all' || (dlFbF === 'done' ? !!f.resolved : !f.resolved)), vs = DL ? DL.versions.map(v => v.v) : [];
  $('dlFb').innerHTML = L.map(f => `<div class="fbr ${f.resolved ? 'res' : ''}" data-id="${f.id}"><div class="tm"><span class="fbid">${f.id}</span><span>@${esc(f.user)} · ${esc(f.screen || '?')} · ${dday(f.ts)}</span></div><div class="tn">${esc(f.text)}</div>
    ${f.resolved ? `<div class="rf">✔ resolved in <b>${esc(f.resolved.version)}</b> by ${esc(f.resolved.by || '')}</div>` : `<div class="rowl"><select class="fV">${vs.slice().reverse().map(v => `<option ${v === (DL && DL.next) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select><button class="tiny primary" data-do="resolve">Mark resolved</button><button class="tiny" data-do="totodo">→ TODO</button></div>`}</div>`).join('') || '<div class="small">None</div>'; }
$('dlFbF').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; dlFbF = b.dataset.f; document.querySelectorAll('#dlFbF [data-f]').forEach(x => x.classList.toggle('on', x === b)); renderFb(); };
$('dlFb').onclick = e => { const b = e.target.closest('[data-do]'); if (!b) return; const row = b.closest('.fbr'), f = dlFb.find(x => x.id === row.dataset.id);
  if (b.dataset.do === 'resolve') send({ type: 'feedbackResolve', id: f.id, version: row.querySelector('.fV').value });
  if (b.dataset.do === 'totodo') { send({ type: 'devlogTodo', title: f.text.slice(0, 120), notes: f.text, feedback: [f.id] }); toast('Added to TODO'); } };
$('dlAdd').onsubmit = e => { e.preventDefault(); const t = $('dlTitle').value.trim(); if (!t) return; send({ type: 'devlogTodo', title: t, priority: $('dlPrio').value }); $('dlTitle').value = ''; };
$('dlVer').onsubmit = e => { e.preventDefault(); send({ type: 'devlogVersion', v: $('dlVv').value.trim(), title: $('dlVt').value.trim() }); $('dlVv').value = $('dlVt').value = ''; };
$('dlVers').addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (!b) return; const box = b.closest('.ver'), vv = box && box.dataset.v;
  if (b.dataset.do === 'vedit') { dlVerEdit = dlVerEdit === vv ? null : vv; renderDevlog(); }
  if (b.dataset.do === 'vcancel') { dlVerEdit = null; renderDevlog(); }
  if (b.dataset.do === 'vsave') { send({ type: 'devlogVersion', edit: true, v: vv, summary: box.querySelector('.vS').value, features: box.querySelector('.vF').value, fixes: box.querySelector('.vX').value }); dlVerEdit = null; } });
$('dlVers').onclick = e => { const b = e.target.closest('[data-do="release"]'); if (b && confirm('Mark ' + b.closest('.ver').dataset.v + ' released today?')) send({ type: 'devlogVersion', edit: true, v: b.closest('.ver').dataset.v, release: true }); };
$('dlTodos').onclick = e => { const b = e.target.closest('[data-do]'); if (!b) return; const row = b.closest('.todo'), id = row.dataset.id, d = b.dataset.do;
  if (d === 'edit') { dlEdit = id; renderDevlog(); return; } if (d === 'cancel') { dlEdit = null; renderDevlog(); return; }
  if (d === 'save') { send({ type: 'devlogTodo', id, title: row.querySelector('.eT').value, notes: row.querySelector('.eN').value, status: row.querySelector('.eS').value, priority: row.querySelector('.eP').value, feedback: row.querySelector('.eF').value }); dlEdit = null; return; }
  if (d === 'up' || d === 'down') { if (!reduced) row.animate([{ transform: `translateY(${d === 'up' ? 8 : -8}px)` }, { transform: 'none' }], 180); send({ type: 'devlogMove', id, to: d }); return; }
  if (d === 'done') { if (!reduced) row.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(40px)', opacity: 0 }], { duration: 260, fill: 'forwards' }); setTimeout(() => send({ type: 'devlogDone', id }), 200); } };
const _onmsg = () => { const o = ws.onmessage; ws.onmessage = e => { o(e); const m = JSON.parse(e.data);
  if (m.type === 'adminResults' || m.type === 'adminList') { if (m.type === 'adminList') renderAdmin(m); else if (aList) aLoad(); }
  if (m.type === 'devlog') { DL = m; renderDevlog(); }
  if (m.type === 'feedbackList') { dlFb = m.feedback; renderFb(); }
  if (m.type === 'adminAudit') $('aAudit').innerHTML = m.lines.map(a => `<div>${esc(a.ts.slice(5, 16).replace('T', ' '))} <b>${esc(a.actor)}</b> ${esc(a.action)} ${esc(a.target)} ${esc(JSON.stringify(a.details || {}))}</div>`).join(''); }; };
const _connect = connect; connect = function () { _connect(); _onmsg(); };
// ---------- profile stats: VIP / level / medals ----------
function renderStats() { if (!me || me.level === undefined) return; const v = me.vipTiers.find(x => x.id === me.vip), nx = me.vipNext, pct = Math.min(100, Math.round(100 * me.xp / Math.max(1, me.nextXp)));
  $('pStats').innerHTML = `<div class="pmrow"><span class="vipchip v-${me.vip}">${v.icon} VIP ${v.name}</span><span>⭐ Lv ${me.level} · ${esc(me.rank)}</span></div>
    <div class="xpbar"><i style="width:${pct}%"></i></div><div class="small">XP ${me.xp}/${me.nextXp} · VIP points ${Math.floor(me.vipPts)}${nx ? ` · ${Math.ceil(nx.at - me.vipPts)} to ${nx.icon} ${nx.name}` : ' · top tier'}</div>
    <div class="small">Perks: daily ×${v.daily} (${fmt(me.dailyAmt)}) · store +${v.storeBonus}% · booster every ${v.adCooldownMin} min. Earn VIP points from purchases (100/$) and play.</div>
    <div class="medals">${(me.allMedals || me.medals).map(m => `<button type="button" class="medal ${m.have === false ? 'locked' : ''}" data-tip="${esc(m.name)}" data-tipd="${esc((m.have === false ? '🔒 Locked — ' : '✔ Earned — ') + (m.desc || ''))}" aria-label="${esc(m.name)}">${m.icon}</button>`).join('')}</div>`;
  $('pStats').querySelector('.vipchip').dataset.tip = `${v.icon} VIP ${v.name}`; $('pStats').querySelector('.vipchip').dataset.tipd = `Your VIP tier. Perks: daily ×${v.daily}, store +${v.storeBonus}%, booster every ${v.adCooldownMin} min.`; }
// v0.14 (fb_857868add6): tap a medal / badge to see what it means. Fixed-position popover, so nothing in the layout moves.
function showTip(el) { let t = $('tipPop'); if (!t) { t = document.createElement('div'); t.id = 'tipPop'; t.className = 'tippop hidden'; t.setAttribute('role', 'tooltip'); document.body.appendChild(t); }
  if (!el || t.dataset.for === el.dataset.tip && !t.classList.contains('hidden')) { t.classList.add('hidden'); t.dataset.for = ''; return; }
  t.innerHTML = `<b></b><div></div>`; t.children[0].textContent = el.dataset.tip; t.children[1].textContent = el.dataset.tipd || ''; t.dataset.for = el.dataset.tip; t.classList.remove('hidden');
  const r = el.getBoundingClientRect(), w = Math.min(260, innerWidth - 16); t.style.width = w + 'px'; t.style.left = Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))) + 'px';
  const h = t.offsetHeight, below = r.bottom + 8 + h < innerHeight; t.style.top = Math.round(below ? r.bottom + 8 : Math.max(8, r.top - 8 - h)) + 'px'; t.classList.toggle('up', !below); }
document.addEventListener('click', e => { const el = e.target.closest('[data-tip]'); if (el) { e.preventDefault(); showTip(el); } else if ($('tipPop') && !e.target.closest('#tipPop')) showTip(null); });
addEventListener('scroll', () => showTip(null), true);
// ---------- tournaments ----------
function tourneyBanner(T) { if (T.status === 'waiting') return `🏆 Buy-in ${fmt(T.buyIn)} · ${T.leaderboard.length}/5 · ${T.startsAt ? `starts in <span class="tcount" data-at="${T.startsAt}"></span>` : 'waiting for players'}`;
  return '🏁 Final: ' + (T.results || []).map(r => `#${r.place} ${esc(r.name)} ${r.prize ? '+' + fmt(r.prize) : ''}`).join(' · '); }
function renderTourney(t) { const T = t.tourney, el = $('tlb'); el.classList.toggle('hidden', !T); if (!T) return;
  el.innerHTML = `<div class="tlh">${T.status === 'running' ? `Round ${T.round}/${T.rounds}` : T.status === 'waiting' ? 'Registering' : 'Finished'} · pool ${fmt(T.pool)}</div>` +
    T.leaderboard.map((r, i) => `<div class="${r.name === me.name ? 'me' : ''} ${r.out ? 'out' : ''}">${i + 1}. ${esc(r.name)} <b>${r.stack.toLocaleString()}</b></div>`).join(''); }
setInterval(() => document.querySelectorAll('.tcount').forEach(e => e.textContent = Math.max(0, Math.ceil((+e.dataset.at - Date.now()) / 1000)) + 's'), 250);
// ---------- craps ----------
let craps = null, cChip = 0;
const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const pips = v => ({ 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[v]).map(p => `<i style="grid-area:${Math.ceil(p / 3)}/${(p - 1) % 3 + 1}"></i>`).join('');
function setDie(el, v) { el.dataset.v = v; el.innerHTML = pips(v); }
function chipStack(mine, others, tier) { if (!mine && !others) return ''; const ix = v => { const c = tier.chips; let k = 0; c.forEach((x, i) => { if (v >= x) k = i; }); return k; };
  return (others ? `<span class="tchip o c${ix(others)}" title="others">${fmt(others)}</span>` : '') + (mine ? `<span class="tchip c${ix(mine)}">${fmt(mine)}</span>` : ''); }
function renderCraps() { const t = craps, mi = t.seats.findIndex(s => s && s.name === me.name), mine = t.seats[mi];
  $('cinfo').textContent = `🎲 ${t.tier.name.replace('Room', 'Craps')} · ${fmt(t.tier.min)}–${fmt(t.tier.max)}`;
  const sumC = o => Object.values(o || {}).reduce((a, c) => a + (c.amt || 0) + (c.odds || 0), 0), sumV = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const amt = (s, k, n) => !s ? 0 : k === 'place' ? (s.place[n] || 0) : k === 'come' ? s.come : k === 'dontCome' ? (s.dontCome || 0) : (s[k] || 0);
  const comeOn = (s, n) => s ? ((s.comes[n] || {}).amt || 0) + ((s.comes[n] || {}).odds || 0) + ((s.dcomes || {})[n] || 0) : 0;
  document.querySelectorAll('#cbets [data-cb]').forEach(b => { const k = b.dataset.cb, n = b.dataset.n; let my = amt(mine, k, n), ot = 0;
    for (const s of t.seats) if (s && s !== mine) ot += amt(s, k, n);
    if (k === 'place') { my += comeOn(mine, n); for (const s of t.seats) if (s && s !== mine) ot += comeOn(s, n); }
    b.querySelector('.stk').innerHTML = chipStack(my, ot, t.tier); b.classList.toggle('pt', k === 'place' && +n === t.point);
    b.classList.toggle('off', (k === 'pass' || k === 'dontPass') ? t.point !== null : (k === 'come' || k === 'dontCome' || k === 'odds') ? t.point === null : false); });
  const pk = $('tpuck'), box = t.point && document.querySelector(`#cbets .cbox[data-n="${t.point}"]`);
  pk.textContent = t.point ? 'ON' : 'OFF'; pk.classList.toggle('off', !t.point);
  if (box) { const r = box.getBoundingClientRect(), p = $('cbets').getBoundingClientRect(); pk.style.left = (r.left - p.left + r.width / 2 - 15) + 'px'; pk.style.top = (r.top - p.top - 8) + 'px'; } else { pk.style.left = ''; pk.style.top = ''; }
  if (t.last && !$('dice').dataset.rolling) { const d = $('dice').children; setDie(d[0], t.last.dice[0]); setDie(d[1], t.last.dice[1]); $('cWhat').textContent = `${t.last.sum} · ${t.last.what}`; }
  else if (!t.last && !$('dice').children[0].innerHTML) { const d = $('dice').children; setDie(d[0], 5); setDie(d[1], 2); }
  $('chist').innerHTML = t.history.map(n => `<span class="${n === 7 ? 'r' : ''}">${n}</span>`).join('');
  $('cseats').innerHTML = t.seats.map((s, i) => !s ? Seats.emptyC(t, i) : `<div class="cseat ${s.name === me.name ? 'me' : ''} ${t.shooter === i ? 'shooter' : ''}" data-cname="${s.name}">
    <div class="av" style="background-image:url(${avUrl(s.avatar)})"><span class="vipb v-${s.vip}">${VIPI[s.vip]}</span><span class="lvb">${s.level}</span></div><div class="nm">${t.shooter === i ? '🎲' : ''}${esc(s.display)}</div><div class="small">${s.total ? '⛁' + fmt(s.total) : ''}${s.net ? ` <i class="${s.net > 0 ? 'win' : 'lose'}">${s.net > 0 ? '+' + fmt(s.net) : '-' + fmt(-s.net)}</i>` : ''}</div></div>`).join('');
  const shooter = t.seats[t.shooter], myShot = shooter && shooter.name === me.name;
  $('cRoll').disabled = !myShot; $('cRoll').textContent = myShot ? '🎲 Roll' : shooter ? `${shooter.display} shoots` : 'Roll';
  $('cbanner').innerHTML = (t.deadline > Date.now() ? `<span class="tcount" data-at="${t.deadline}"></span> to auto-roll · ` : '') + (t.point ? `Point ${t.point}: odds, come & don't come open` : 'Come-out roll: Pass / Don\'t Pass');
  document.querySelectorAll('#cChipRow button').forEach((b, i) => b.classList.toggle('sel', i === cChip)); }
function animDice(m) { const box = $('dice'), d = box.children; box.dataset.rolling = 1; SFX.deal(0); SFX.deal(.15);
  const done = () => { delete box.dataset.rolling; setDie(d[0], m.dice[0]); setDie(d[1], m.dice[1]); $('cWhat').textContent = `${m.sum} · ${m.what}`; /Seven out|Craps/.test(m.what) ? SFX.lose() : SFX.win(); if (craps) renderCraps(); };
  if (reduced) return done();
  let k = 0; const iv = setInterval(() => { setDie(d[0], 1 + (k * 7 + 3) % 6); setDie(d[1], 1 + (k * 5 + 1) % 6); k++; }, 70);
  [...d].forEach((el, i) => el.animate([{ transform: `translate(${-140 + i * 20}px, 160px) rotate(0deg) scale(.7)` }, { transform: `translate(${-40 + i * 30}px, 40px) rotate(${400 + i * 90}deg) scale(1.1)`, offset: .55 },
    { transform: `translate(${10 + i * 6}px, -6px) rotate(${700 + i * 120}deg) scale(.95)`, offset: .85 }, { transform: 'translate(0,0) rotate(720deg) scale(1)' }], { duration: 900, easing: 'cubic-bezier(.2,.7,.3,1)' }));
  setTimeout(() => { clearInterval(iv); done(); }, 900); }
$('cChipRow').onclick = e => { const b = e.target.closest('button'); if (!b) return; cChip = [...$('cChipRow').children].indexOf(b); renderCraps(); };
$('cbets').onclick = e => { const b = e.target.closest('[data-cb]'); if (!b || !craps) return; const v = craps.tier.chips[cChip] || craps.tier.min; flyChip($('cChipRow').children[cChip], b.querySelector('.stk')); SFX.chip(); send({ type: 'crapsBet', bet: b.dataset.cb, num: b.dataset.n ? +b.dataset.n : undefined, amount: v }); };
$('cRoll').onclick = () => { if ($('cRoll').dataset.wait) return toast('Dice are still rolling'); send({ type: 'crapsRoll' }); }; // v0.15.1: locked while the dice are in the air $('cClear').onclick = () => send({ type: 'crapsClear' });
$('cLeave').onclick = () => send({ type: 'crapsLeave' });
$('cseats').onclick = e => { const el = e.target.closest('[data-cname]'); if (el) openCard(el.dataset.cname); };
// ---------- slots ----------
let sBet = 0, sInfo = null, spinning = false;
function slotInfo(m) { const first = !sInfo; sInfo = m; if (first) idleReels(); $('sBets').innerHTML = m.bets.map((v, i) => `<button class="c${i % 4} ${i === sBet ? 'sel' : ''}" data-i="${i}">${fmt(v)}</button>`).join('');
  $('payTab').innerHTML = Object.entries(m.pay3).reverse().map(([k, v]) => `<span>${k}${k}${k} ×${v}</span>`).join('') + `<span>🍀🍀 ×${m.clover2}</span>`; }
$('openSlots').onclick = () => { send({ type: 'leave', quiet: true, resync: true }); setRoom('slots'); table = craps = coin = rou = null; sessionStorage.removeItem('lastTable'); send({ type: 'slotInfo' }); show('slots'); };
$('sLeave').onclick = () => { setRoom('none'); show('lobby'); send({ type: 'leave' }); };
$('sBets').onclick = e => { const b = e.target.closest('button'); if (!b) return; sBet = +b.dataset.i; slotInfo(sInfo); };
// reels: each window shows 3 symbols on a vertical strip; spinning = a long strip of random symbols scrolling fast (with motion blur),
// then each reel decelerates onto the server's result with a small overshoot, left to right
const CELL = () => ($('reels').querySelector('.reel').clientHeight || 186) / 3;
const symR = () => { const sy = (sInfo && sInfo.symbols) || ['🍀', '🔔', '⭐', '💎', '👑', '🎰']; return sy[Math.floor(Math.random() * sy.length)]; };
const cellsHTML = a => a.map(x => `<i>${x}</i>`).join('');
function idleReels(res) { [...$('reels').querySelectorAll('.strip')].forEach((st, i) => { st.getAnimations().forEach(x => x.cancel()); st.innerHTML = cellsHTML([symR(), res ? res[i] : symR(), symR()]); st.style.transform = ''; st.parentElement.classList.remove('spin', 'stop'); }); }
let spinLoops = [];
function startSpin() { const c = CELL(); spinLoops = [...$('reels').querySelectorAll('.strip')].map((st, i) => { const seq = Array.from({ length: 12 }, symR); st.dataset.seq = JSON.stringify([...seq, ...seq.slice(0, 3)]); st.innerHTML = cellsHTML([...seq, ...seq.slice(0, 3)]); st.parentElement.classList.add('spin'); st.parentElement.classList.remove('stop');
  if (reduced) return null; return st.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-12 * c}px)` }], { duration: 420 + i * 40, iterations: Infinity, easing: 'linear' }); }); }
// stop: continue from the spin loop's current phase (no snap back to 0), decelerate with one small overshoot, then swap to the static 3 cells at the exact same position
function stopReel(i, sym, last) { const st = $('reels').querySelectorAll('.strip')[i], c = CELL(); let y0 = 0;
  // v0.15.1: the stop strip starts with exactly the symbols on screen right now (same phase), so nothing swaps when deceleration begins
  let head = []; if (spinLoops[i]) { const L = spinLoops[i], d = L.effect.getTiming().duration, p = ((L.currentTime || 0) % d) / d, pos = p * 12; y0 = -((pos % 1) * c); L.cancel(); spinLoops[i] = null;
    try { const seq = JSON.parse(st.dataset.seq || '[]'), k = Math.floor(pos) % 12; head = seq.slice(k, k + 4); } catch {} }
  const run = [...head, ...Array.from({ length: Math.max(5, 9 - head.length) }, symR)], cells = [...run, symR(), sym, symR()], end = -(cells.length - 3) * c; st.innerHTML = cellsHTML(cells);
  const done = () => { st.innerHTML = cellsHTML(cells.slice(-3)); st.style.transform = ''; st.parentElement.classList.remove('spin'); st.parentElement.classList.add('stop'); SFX.deal(0); last && last(); };
  if (reduced) return done();
  st.animate([{ transform: `translateY(${y0}px)`, filter: 'blur(2px)' }, { transform: `translateY(${end - 14}px)`, filter: 'blur(.5px)', offset: .82 }, { transform: `translateY(${end + 4}px)`, filter: 'none', offset: .93 }, { transform: `translateY(${end}px)`, filter: 'none' }],
    { duration: 560, easing: 'cubic-bezier(.25,.55,.35,1)', fill: 'forwards' }).onfinish = e => { e.target.cancel(); done(); }; }
// v0.15.1: one spin = one id. The reels spin at least SPIN_MIN ms and then decelerate onto the server's reels; replies for another id are
// ignored; a slow reply is waited for (no 5s guess), the same id is re-sent after a reconnect (server answers it once, never charges twice).
const SPIN_MIN = 900, SPIN_RETRY = 8000, SPIN_GIVEUP = 30000; let spinReq = null;
function pull() { if (spinning || !sInfo) return; spinning = true; const l = $('lever'); l.classList.add('pulled'); setTimeout(() => l.classList.remove('pulled'), 400);
  SFX.chip(); $('machine').classList.remove('won'); startSpin(); $('sWin').textContent = 'Spinning…'; $('sWin').classList.remove('won');
  const q = spinReq = { sid: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), bet: sInfo.bets[sBet], t0: performance.now(), tries: 0 }; spinSend(q); }
function spinSend(q) { if (spinReq !== q) return; q.tries++; send({ type: 'slotSpin', bet: q.bet, sid: q.sid }); clearTimeout(q.timer);
  q.timer = setTimeout(() => { if (spinReq !== q) return; if (performance.now() - q.t0 > SPIN_GIVEUP) { spinEnd(q); idleReels(); $('sWin').textContent = 'No response — check your connection and pull again'; } else { $('sWin').textContent = 'Spinning… (slow connection)'; spinSend(q); } }, SPIN_RETRY); }
function spinEnd(q) { clearTimeout(q && q.timer); if (spinReq === q) spinReq = null; spinning = false; }
function spinResume() { const q = spinReq; if (q && view === 'slots') setTimeout(() => spinSend(q), 300); } // called after (re)login
$('lever').onclick = pull; $('spin').onclick = pull;
function slotFail(m) { const q = spinReq; if (!q || (m.sid && m.sid !== q.sid)) return; spinEnd(q); idleReels(); $('sWin').textContent = m.error || 'Spin refused'; }
function slotResult(m) { const q = spinReq; if (!q || q.landing || (m.sid && m.sid !== q.sid) || (!m.sid && q.tries > 1)) return; q.landing = true; clearTimeout(q.timer);
  const t0 = reduced ? 0 : Math.max(0, SPIN_MIN - (performance.now() - q.t0)); window.lastSlot = m;
  m.reels.forEach((sym, i) => setTimeout(() => stopReel(i, sym, i === 2 && (() => { spinEnd(q);
    $('sWin').textContent = m.win ? `WIN ${fmt(m.win)} (×${m.mult})` : 'No win — pull again'; $('sWin').classList.toggle('won', !!m.win); if (m.win > m.bet) { SFX.win(); $('machine').classList.add('won'); } })), t0 + i * 330)); }
// ---------- coin toss ----------
let coin = null, kChip = 0;
const kAmts = [1e3, 10e3, 100e3, 1e6];
// v0.14 premium coin toss: server sends the outcome + seeded 3D trajectory (public/coinsim.js); we replay it on a 3D coin (side view) and a top-view inset.
const COIN_LBL = { heads: 'HEADS 👑', tails: 'TAILS 🦅', hh: '👑👑 Both heads', tt: '🦅🦅 Both tails', mix: '👑🦅 One each' };
function coinEl(i) { return `<div class="c3d" data-i="${i}"><div class="c3shadow"></div><div class="c3coin"><div class="c3face h"><b>👑</b><i>HEADS</i></div><div class="c3edge"></div><div class="c3face t"><b>🦅</b><i>TAILS</i></div></div></div>`; }
function coinSetup(r) { const st = $('cStage'); if (st.dataset.n == r.coins) return; st.dataset.n = r.coins; st.querySelectorAll('.c3d').forEach(e => e.remove()); $('cTop').querySelectorAll('.ctop').forEach(e => e.remove());
  for (let i = 0; i < r.coins; i++) { st.insertAdjacentHTML('beforeend', coinEl(i)); $('cTop').insertAdjacentHTML('beforeend', `<i class="ctop" data-i="${i}"></i>`); } coinPose(r.last && r.last.faces || []); }
// place coin i: x/y in stage px, flip angle a (rad, 0 = heads up), tilt
function coinDraw(i, s, n) { const st = $('cStage'), el = st.querySelector(`.c3d[data-i="${i}"]`), tp = $('cTop').querySelector(`.ctop[data-i="${i}"]`); if (!el) return;
  const W = st.clientWidth, H = st.clientHeight, ppm = H * .62, base = W / 2 + (n > 1 ? (i ? 1 : -1) * Math.min(70, W * .18) : 0), floor = H - 26;
  const x = base + s.x * ppm * .6, y = floor - s.y * ppm; el.style.transform = `translate(${x}px, ${y}px)`;
  el.firstChild.style.transform = `translate(-50%, ${(s.y * ppm - 7).toFixed(1)}px) scale(${Math.max(.35, 1 - s.y * .45)})`; el.firstChild.style.opacity = Math.max(.15, .6 - s.y * .5);
  el.children[1].style.transform = `translate(-50%, -100%) rotateX(${(s.a * 180 / Math.PI).toFixed(2)}deg) rotateY(${(s.tilt * 57.3).toFixed(2)}deg)`;
  if (tp) { const c = Math.cos(s.a), up = c >= 0; tp.style.transform = `translate(${(s.x * 40 + (n > 1 ? (i ? 22 : -22) : 0)).toFixed(1)}px, ${(s.z * 40).toFixed(1)}px) scale(${(.55 + s.y * .25).toFixed(3)}, ${(Math.max(.06, Math.abs(c)) * (.55 + s.y * .25)).toFixed(3)})`; tp.className = 'ctop ' + (up ? 'h' : 't'); } }
function coinPose(faces) { const n = +$('cStage').dataset.n || 1; for (let i = 0; i < n; i++) coinDraw(i, { x: 0, y: 0, z: 0, a: faces[i] === 'tails' ? Math.PI : 0, tilt: 0 }, n); }
function renderCoin() { const r = coin; sessionStorage.coinMode = r.mode;
  if (renderCoin.id !== r.id) { renderCoin.id = r.id; cancelAnimationFrame(coinAnim); const st = $('cStage'); st.classList.remove('flying', 'landed'); delete st.dataset.n; $('coinWhat').firstChild.textContent = 'Place a bet — flip in '; } // switched rooms: drop the other room's toss + result text
  coinSetup(r); $('kTitle').textContent = `🪙 Coin Toss · ${r.modeName || 'Single Flip'}`; $('kSwitch').textContent = r.mode === 'double' ? '⇄ Single Flip' : '⇄ Double Flip';
  $('kChips').innerHTML = kAmts.map((v, i) => `<button class="c${i} ${i === kChip ? 'sel' : ''}" data-i="${i}">${fmt(v)}</button>`).join('');
  const sides = r.sides || { heads: 1.95, tails: 1.95 }, mineP = r.players.find(p => p.name === me.name), mb = mineP && mineP.bet;
  const sk = Object.keys(sides).join(','); if ($('kSides').dataset.k !== sk) { $('kSides').dataset.k = sk; $('kSides').innerHTML = Object.entries(sides).map(([k, x]) => `<button class="primary kside" data-side="${k}">${COIN_LBL[k]}<small>${x}x</small></button>`).join(''); }
  $('kSides').querySelectorAll('[data-side]').forEach(b => { b.classList.toggle('sel', !!mb && mb.side === b.dataset.side); b.disabled = !!mb && mb.side !== b.dataset.side; });
  $('kHist').innerHTML = r.history.map(h => `<span class="${h[0] === 'H' && !h.includes('T') ? '' : h.includes('H') ? 'm' : 'r'}">${h}</span>`).join('');
  $('coinT').dataset.at = r.deadline; $('coinT').className = r.deadline ? 'tcount' : ''; if (!r.deadline) $('coinT').textContent = 'first bet starts the timer';
  $('kPlayers').innerHTML = (r.seats || r.players).map((p, i) => !p ? Seats.emptyC(r, i) : `<div class="cseat ${p.name === me.name ? 'me' : ''}" data-cname="${p.name}"><div class="av" style="background-image:url(${avUrl(p.avatar)})"><span class="vipb">${VIPI[p.vip] || ''}</span><span class="lvb">${p.level}</span></div>
    <div class="nm">${esc(p.display)}</div><div class="small">${p.bet ? (COIN_LBL[p.bet.side] || p.bet.side).split(' ')[0] + ' ' + fmt(p.bet.amt) : ''}${r.last && r.last.res[p.name] !== undefined ? ` <i class="${r.last.res[p.name] > 0 ? 'win' : 'lose'}">${r.last.res[p.name] > 0 ? '+' + fmt(r.last.res[p.name]) : '-' + fmt(-r.last.res[p.name])}</i>` : ''}</div></div>`).join('');
  $('kbanner').textContent = mb ? `Your bet: ${COIN_LBL[mb.side] || mb.side} · ${fmt(mb.amt)}` : r.mode === 'double' ? 'Two coins · matching pair 3.9x · one of each 1.95x' : `One coin · heads or tails 1.95x · bets ${fmt(r.min)}–${fmt(r.max)}`; }
let coinAnim = 0;
function coinFlip(m) { const traj = m.traj || [], faces = m.faces || [m.side], n = traj.length || 1, st = $('cStage'); cancelAnimationFrame(coinAnim);
  const end = () => { coinPose(faces); st.classList.remove('flying'); st.classList.add('landed'); setTimeout(() => st.classList.remove('landed'), 1200);
    $('coinWhat').firstChild.textContent = `${(COIN_LBL[m.side] || m.side).toUpperCase()}! Next flip in `; const mine = m.res[me.name]; if (mine !== undefined) mine > 0 ? SFX.win() : SFX.lose(); };
  if (reduced || !traj.length || !window.CoinSim) return end();
  st.classList.add('flying'); SFX.chip && SFX.chip(); const t0 = performance.now(), dur = Math.max(...traj.map(p => p.T)) + 1;
  const step = now => { const t = (now - t0) / 1000; traj.forEach((p, i) => coinDraw(i, CoinSim.at(p, t), n)); if (t < dur) coinAnim = requestAnimationFrame(step); else end(); };
  coinAnim = requestAnimationFrame(step); }
$('kChips').onclick = e => { const b = e.target.closest('button'); if (b) { kChip = +b.dataset.i; renderCoin(); } };
$('kSides').onclick = e => { const b = e.target.closest('[data-side]'); if (b) send({ type: 'coinBet', side: b.dataset.side, amount: kAmts[kChip] }); };
$('kSwitch').onclick = () => { const md = coin && coin.mode === 'double' ? 'single' : 'double'; send(coin && Seats.watching(coin) ? { type: 'view', game: 'coin', mode: md } : { type: 'coinJoin', mode: md }); }; // viewers keep viewing
addEventListener('resize', () => { if (coin && !$('cStage').classList.contains('flying')) coinPose(coin.last && coin.last.faces || []); });
$('kLeave').onclick = () => send({ type: 'coinLeave' });
$('kPlayers').onclick = e => { const el = e.target.closest('[data-cname]'); if (el) openCard(el.dataset.cname); };
// ---------- player protection ----------
const chatMuted = () => JSON.parse(localStorage.chatMute || '[]');
$('pmMute').onclick = () => { const l = chatMuted(), i = l.indexOf(pmTarget); i >= 0 ? l.splice(i, 1) : l.push(pmTarget); localStorage.chatMute = JSON.stringify(l); toast(i >= 0 ? 'Unmuted' : 'Muted in chat (this device)'); $('pmenu').classList.add('hidden'); };
$('pmReport').onclick = () => { const r = prompt('Report ' + pmTarget + ' — reason (abuse, cheating, chip trading, other):'); if (r !== null) send({ type: 'report', name: pmTarget, reason: r }); $('pmenu').classList.add('hidden'); };
const _showCard = showCard; showCard = function (c) { _showCard(c); $('pmMute').textContent = chatMuted().includes(c.name) ? '🔈 Unmute in chat' : '🔇 Mute in chat'; ['pmMute', 'pmReport'].forEach(id => $(id).classList.toggle('hidden', !!c.self || !cfg.compliance)); };
$('dobGo').onclick = () => { send({ type: 'confirmAge', dob: $('dobGate').value }); $('ageGate').classList.add('hidden'); setTimeout(() => send({ type: 'lobby' }), 300); };
$('limSave').onclick = () => send({ type: 'setLimits', daily: +$('limDay').value || 0, monthly: +$('limMonth').value || 0 });
document.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { const p = b.dataset.ex, lbl = { '24h': '24 hours', '7d': '7 days', '30d': '30 days', perm: 'PERMANENTLY' }[p];
  if (confirm(`Self-exclude for ${lbl}? You will be logged out and cannot log in${p === 'perm' ? ' again' : ' until it ends'}. This cannot be undone early.`)) send({ type: 'selfExclude', period: p }); });
function renderSafe() { if (!me || !me.limits) return; const L = me.limits, a = c => c == null ? 'none' : 'A$' + (c / 100).toFixed(2);
  $('limStatus').textContent = `Daily: ${a(L.daily)} (spent A$${(me.spentDay / 100).toFixed(2)}) · Monthly: ${a(L.monthly)} (spent A$${(me.spentMonth / 100).toFixed(2)})` + (L.pending ? ` · pending change from ${new Date(L.pending.at).toLocaleString()}` : '');
  $('purHist').innerHTML = me.purchases.length ? me.purchases.map(p => `<div>${new Date(p.ts).toLocaleDateString()} · ${esc(p.name || p.pack)} · ${fmt(p.chips)}${p.bonus ? ' + ' + fmt(p.bonus) : ''} chips · A$${(p.aud / 100).toFixed(2)}</div>`).join('') : 'No purchases.'; }
const _rp3 = renderProfile; renderProfile = function () { _rp3(); renderSafe(); };
// reality check every 60 minutes of session time
const sessStart = Date.now(); let sessChips = null;
setInterval(() => { if (!me || view === 'login' || !cfg.compliance) return; if (sessChips === null) sessChips = me.chips; const mins = Math.round((Date.now() - sessStart) / 6e4), d = me.chips - sessChips;
  $('rcText').textContent = `You've been playing for ${mins} minutes. Chip balance change this session: ${d >= 0 ? '+' : '-'}${fmt(Math.abs(d))}.`; $('rcheck').classList.remove('hidden'); }, +(localStorage.rcMs || 60 * 6e4));
$('rcGo').onclick = () => $('rcheck').classList.add('hidden'); $('rcStop').onclick = () => { $('rcheck').classList.add('hidden'); $('logout').click(); };
setTimeout(() => { if (me && sessChips === null) sessChips = me.chips; }, 3000);
setFade(opt.fade);
connect();

// ---------- v0.14 Events: announcement-bar ticker, claim popups, calendar, promo codes, invite rooms + quicklinks, spectators ----------
let srvNotice = null; const EV = { feed: null, seen: new Set(JSON.parse(sessionStorage.evSeen || '[]')), tick: 0, ti: null };
const evWhen = t => { const d = new Date(t), now = Date.now(), diff = t - now; if (diff > 0 && diff < 36e5) return `in ${Math.ceil(diff / 6e4)} min`; if (diff > 0 && diff < 864e5) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
const evLink = code => location.origin + '/?e=' + code;
function evLinkify(el, text) { const re = /[?&]e=([A-Z0-9]{6})\b/g; let mm; const seen = new Set(); while ((mm = re.exec(text || ''))) { if (seen.has(mm[1])) continue; seen.add(mm[1]);
  const b = document.createElement('button'); b.className = 'tiny primary evjoin'; b.dataset.ev = mm[1]; b.textContent = '📅 Join'; el.appendChild(document.createTextNode(' ')); el.appendChild(b); } }
document.addEventListener('click', e => { const b = e.target.closest('[data-ev]'); if (!b) return; e.preventDefault(); e.stopPropagation(); send({ type: 'eventJoin', code: b.dataset.ev, watch: !!b.dataset.watch }); $('evModal').classList.add('hidden'); if (b.closest('#msgPanel')) { if (document.activeElement) document.activeElement.blur(); $('msgPanel').classList.add('hidden'); } }, true); // v0.15: joining from a DM minimizes the messenger so the room info isn't hidden under it
function evMsg(m) {
  if (m.type === 'events') { EV.feed = m; EV.skew = m.now - Date.now(); evTicker(); evPopups(); if (!$('evModal').classList.contains('hidden')) evRender(); $('evBtn').classList.toggle('hot', m.active.some(e => e.reward && !e.claimed)); return; }
  if (m.type === 'eventGo') { if (m.go) send(m.go); if (m.watch) toast('👀 Spectating — view only' + (m.inv && m.inv.spectators.chat ? ', chat on' : '')); document.body.classList.toggle('spectating', !!m.watch); return; }
  if (m.type === 'inviteCreated') { EV.last = m.invite; evRender(); $('evMade').innerHTML = `✅ Created <b></b> · ${evWhen(m.invite.start)}<div class="rowl"><input readonly value="${evLink(m.invite.code)}"><button class="tiny" id="evCopy">Copy</button><button class="tiny primary" id="evShare">💬 Invite in chat</button></div>`; $('evMade').querySelector('b').textContent = m.invite.title;
    $('evCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(evLink(m.invite.code)); toast('Link copied'); }; $('evShare').onclick = () => evShare(m.invite); return; }
}
// one line in the top bar, rotating through live events / promos / special rooms (server notices take priority); fixed height => no layout shift
function evTicker(force) { const el = $('notice'), a = EV.feed ? EV.feed.announce : []; clearInterval(EV.ti); if (srvNotice) return; if (!a.length) { if (el.classList.contains('ev')) { el.classList.remove('ev'); el.innerHTML = NOTICE0; } return; }
  const draw = () => { const x = a[EV.tick++ % a.length]; el.classList.add('ev'); el.innerHTML = `<span class="nmsg">${esc(x.icon)} ${esc(x.text)}</span>${x.link ? `<button class="tiny primary nlink" data-ev="${esc(x.link.slice(4))}">Join</button>` : x.code ? `<button class="tiny nlink" data-promo="${esc(x.code)}">Redeem</button>` : `<button class="tiny nlink" data-evopen="1">Claim</button>`}`; };
  draw(); if (a.length > 1) EV.ti = setInterval(draw, 6000); }
$('notice').addEventListener('click', e => { const p = e.target.closest('[data-promo]'); if (p) { e.stopPropagation(); send({ type: 'promoRedeem', code: p.dataset.promo }); return; } if (e.target.closest('[data-evopen]') || $('notice').classList.contains('ev') && !e.target.closest('[data-ev]')) { e.stopPropagation(); evOpen(); } }, true);
// claim popup once per session per event (anticipation: upcoming ones are listed in the Events panel with countdowns)
function evPopups() { if (!me || view === 'login') return; const e = EV.feed.active.find(x => x.reward && !x.claimed && !EV.seen.has(x.id)); if (!e) return; EV.seen.add(e.id); sessionStorage.evSeen = JSON.stringify([...EV.seen]);
  const m = $('evPop'); m.querySelector('.evpi').textContent = e.icon; m.querySelector('h3').textContent = e.title; m.querySelector('p').textContent = (e.desc ? e.desc + ' · ' : '') + `Claim ${fmt(e.reward)} chips`; m.dataset.id = e.id; m.classList.remove('hidden'); }
$('evPopClaim').onclick = () => { send({ type: 'eventClaim', id: $('evPop').dataset.id }); $('evPop').classList.add('hidden'); if (!reduced) SFX.win(); };
$('evPopLater').onclick = () => $('evPop').classList.add('hidden');
function evOpen() { evRender(); $('evModal').classList.remove('hidden'); send({ type: 'events' }); }
$('evBtn').onclick = evOpen; $('evClose').onclick = () => $('evModal').classList.add('hidden');
function evRender() { const f = EV.feed; if (!f) return; const L = f.limits;
  const row = e => `<div class="evrow ${e.claimed ? 'done' : ''}"><span class="evi">${esc(e.icon)}</span><span class="evt"><b>${esc(e.title)}</b><small>${e.start > Date.now() ? 'Starts ' + evWhen(e.start) : 'Ends ' + evWhen(e.end)}${e.desc ? ' · ' + esc(e.desc) : ''}</small></span>${e.room ? `<button class="tiny primary" data-ev="${e.room.code}">Join</button>` : ''}${e.reward && e.start <= Date.now() ? `<button class="tiny ${e.claimed ? '' : 'primary'}" data-claim="${e.id}" ${e.claimed ? 'disabled' : ''}>${e.claimed ? '✔' : 'Claim ' + fmt(e.reward)}</button>` : e.reward ? `<small class="evr">🎁 ${fmt(e.reward)}</small>` : ''}</div>`;
  $('evActive').innerHTML = f.active.length ? f.active.map(row).join('') : '<div class="small">No live events right now.</div>';
  $('evUpcoming').innerHTML = f.upcoming.length ? f.upcoming.map(row).join('') : '<div class="small">Nothing scheduled yet — check back soon.</div>';
  $('evRooms').innerHTML = f.invites.length ? f.invites.map(v => `<div class="evrow"><span class="evi">${v.special ? '⭐' : '📅'}</span><span class="evt"><b>${esc(v.title)}</b><small>${esc(v.gameName)} · ${Date.now() >= v.start ? 'live · ends ' + evWhen(v.end) : 'starts ' + evWhen(v.start)} · ${v.players} playing${v.match ? ' · match' : ''}</small></span>
    <button class="tiny primary" data-ev="${v.code}">Join</button>${v.mine ? `<button class="tiny" data-share="${v.code}">💬</button><button class="tiny danger" data-cancel="${v.code}">✕</button>` : ''}</div>`).join('') : '<div class="small">No rooms yet. Create one below and share the quicklink.</div>';
  const g = $('evGame'); if (!g.options.length) g.innerHTML = Object.entries(L.games).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  const t = $('evTier'); if (!t.options.length && window.TIERS_CACHE) t.innerHTML = TIERS_CACHE.map(x => `<option value="${x.id}">${esc(x.name)} (${fmt(x.min)}+)</option>`).join('');
  const st = $('evStart'), pad = n => String(n).padStart(2, '0'), loc = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  st.min = loc(new Date()); st.max = loc(new Date(Date.now() + L.maxAheadMs)); if (!st.value) st.value = loc(new Date(Date.now() + 15 * 6e4));
  $('evDur').min = L.minDur; $('evDur').max = L.maxDur; $('evRange').textContent = `Start within 7 days · length ${L.minDur}–${L.maxDur} min · room closes when time is up`; }
$('evModal').addEventListener('click', e => { const c = e.target.closest('[data-claim]'); if (c) send({ type: 'eventClaim', id: c.dataset.claim });
  const x = e.target.closest('[data-cancel]'); if (x) send({ type: 'inviteCancel', code: x.dataset.cancel }); const sh = e.target.closest('[data-share]'); if (sh) evShare(EV.feed.invites.find(v => v.code === sh.dataset.share)); });
$('evCreate').onclick = () => { const st = new Date($('evStart').value).getTime(); send({ type: 'inviteCreate', game: $('evGame').value, tier: $('evTier').value || undefined, start: st, duration: +$('evDur').value, title: $('evTitle').value,
  match: $('evMatch').checked, spectators: { allow: $('evSpec').checked, chat: $('evSpecChat').checked, emoji: $('evSpecEmo').checked } }); };
$('evRedeem').onclick = () => { const v = $('evCode').value.trim(); if (v) send({ type: 'promoRedeem', code: v }); $('evCode').value = ''; };
// share: into the open DM if the messenger is open, else into the room chat composer (user still taps Send)
function evShare(v) { if (!v) return; const text = `📅 ${v.title} · ${v.gameName} ${Date.now() >= v.start ? 'now' : evWhen(v.start)} → ${evLink(v.code)}`; $('evModal').classList.add('hidden');
  if (!$('msgPanel').classList.contains('hidden')) { $('mIn').value = text; $('mIn').focus(); return; }
  if (SOCIAL[view]) { openChatBar(); if ($('chatBar').classList.contains('hidden')) openChatBar(); $('chatIn').value = text; $('chatIn').focus(); return; }
  navigator.clipboard && navigator.clipboard.writeText(evLink(v.code)); toast('Quicklink copied — paste it in a chat'); }
// chat composer + DM: "invite with quicklink" (uses your latest room, or opens the creator)
function evInvite() { const mine = EV.feed && EV.feed.invites.filter(v => v.mine); if (mine && mine.length) evShare(mine[mine.length - 1]); else { evOpen(); $('evTitle').focus(); } }
$('chatInvite').onclick = () => { $('chatMenu').classList.add('hidden'); evInvite(); }; $('mInvite').onclick = evInvite;

// ---------- v0.14 session handshake (guard.js): prove this socket runs this build; repeats on every key rotation ----------
const BUILD_ID = '__CR_BUILD__', BUILD = /^__/.test(BUILD_ID) ? 'dev' : BUILD_ID;
async function hsAnswer(m) { try { const data = new TextEncoder().encode(`${m.n}.${m.k}.${BUILD}`), h = await crypto.subtle.digest('SHA-256', data);
  send({ type: 'hs', p: [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('') }); } catch (e) { send({ type: 'hs', p: '' }); } }

// Local stand-in for the Chip Royale server: a fake WebSocket that speaks the same messages the real client uses,
// running the blackjack rules ported from server.js (6-deck shoe, reshuffle under 60 cards, dealer hits to 16 and stands on all 17,
// peek/insurance on an Ace, BJ 3:2, double on any two, split up to 4 hands, split aces get one card, surrender, pair bet 12:1).
// Play chips only, kept in localStorage. No network.
(() => {
  'use strict';
  const C = window.BJ_CONFIG, G = C.game;
  const K = 1e3, M = 1e6, B = 1e9;
  const TIERS = [
    { id: 'rookie', name: 'Rookie Room', min: 1 * K, max: 100 * K, chips: [1 * K, 5 * K, 10 * K, 25 * K] },
    { id: 'bronze', name: 'Bronze Room', min: 10 * K, max: 1 * M, chips: [10 * K, 50 * K, 100 * K, 250 * K] },
    { id: 'silver', name: 'Silver Room', min: 100 * K, max: 10 * M, chips: [100 * K, 500 * K, 1 * M, 2.5 * M] },
    { id: 'gold', name: 'Gold Room', min: 1 * M, max: 100 * M, chips: [1 * M, 5 * M, 10 * M, 25 * M] },
    { id: 'platinum', name: 'Platinum Room', min: 10 * M, max: 1 * B, chips: [10 * M, 50 * M, 100 * M, 250 * M] },
    { id: 'diamond', name: 'Diamond Room', min: 100 * M, max: 10 * B, chips: [100 * M, 500 * M, 1 * B, 2.5 * B] }
  ].map(t => ({ ...t, unit: t.min >= M ? M : K, unitLabel: t.min >= M ? 'M' : 'K', recommended: t.min * 20 }));
  const tier = TIERS.find(t => t.id === G.tier) || TIERS[0];
  const BET_MS = G.betMs, TURN_MS = G.turnMs;

  // pre-seed client state so app.js boots straight into the table with the chosen skin
  localStorage.token = 'local'; sessionStorage.room = 'bj'; localStorage.tableSkin = G.skin || 'premium';

  // ---------- users (play chips) ----------
  const ME = G.playerName || 'You';
  const users = {};
  users[ME] = { name: ME, display: ME, avatar: G.avatar || 0, chips: +localStorage.bjLocalChips || G.startingChips, bot: false, tableSkin: G.skin || 'premium' };
  (G.bots || []).slice(0, 4).forEach(b => users[b.name] = { name: b.name, display: b.name, avatar: b.avatar || 0, chips: tier.min * 200, bot: true });
  const saveMe = () => { localStorage.bjLocalChips = users[ME].chips; };
  const bal = (t, n) => users[n].chips;
  const add = (t, n, a) => { users[n].chips += a; if (n === ME) saveMe(); };

  // ---------- rules (ported from server.js) ----------
  const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  function newShoe() { const s = []; for (let d = 0; d < 6; d++) for (const su of SUITS) for (const r of RANKS) s.push({ r, s: su });
    for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; }
  const val = c => c.r === 'A' ? 11 : 'JQK'.includes(c.r) || c.r === '10' ? 10 : +c.r;
  function soft(h) { let t = 0, a = 0; for (const c of h) { if (c.r === 'A') a++; t += val(c); } while (t > 21 && a) { t -= 10; a--; } return a > 0 && t <= 21; }
  function score(h) { let t = 0, a = 0; for (const c of h) { if (c.r === 'A') a++; t += val(c); } while (t > 21 && a) { t -= 10; a--; } return t; }
  const isBJ = h => h.length === 2 && score(h) === 21;
  const t = { id: 'local1', tier, private: false, code: null, seats: Array(5).fill(null), dealer: [], phase: 'betting', turn: -1, shoe: newShoe(), timer: null, deadline: 0, log: [] };
  const seat = n => ({ name: n, bet: 0, pair: 0, hands: [], result: '', insurance: 0, insDecided: false, ready: false, backs: {}, backResult: null });
  const mine = Math.max(0, Math.min(4, G.mySeat | 0));
  t.seats[mine] = seat(ME);
  (G.bots || []).slice(0, 4).forEach(b => { let i = Number.isInteger(b.seat) && b.seat !== mine && !t.seats[b.seat] ? b.seat : t.seats.indexOf(null); if (i >= 0) t.seats[i] = seat(b.name); });
  const draw = () => { if (t.shoe.length < 60) t.shoe = newShoe(); return t.shoe.pop(); };
  const seated = () => t.seats.filter(Boolean);
  const activeHand = s => s.hands.findIndex(h => !h.done);
  const fmt = n => n >= 1e9 ? n / 1e9 + 'B' : n >= 1e6 ? n / 1e6 + 'M' : n >= 1e3 ? n / 1e3 + 'K' : '' + n;
  function tableView() {
    const hide = t.phase === 'playing' || t.phase === 'insurance' || t.phase === 'dealing';
    return { id: t.id, tier: t.tier, private: false, code: null, phase: t.phase, turn: t.turn, deadline: t.deadline, log: t.log.slice(-6), tourney: null, vote: null,
      dealer: t.dealer.map((c, i) => hide && i === 1 ? { r: '?', s: '' } : c), dealerScore: hide ? (t.dealer[0] ? score([t.dealer[0]]) : 0) : score(t.dealer), dealerSoft: hide ? !!(t.dealer[0] && t.dealer[0].r === 'A') : soft(t.dealer),
      betMs: BET_MS, turnMs: TURN_MS, now: Date.now(), held: {}, viewers: 0,
      seats: t.seats.map(s => s && { name: s.name, display: users[s.name].display, avatar: users[s.name].avatar, away: false, bet: s.bet, pair: s.pair, insurance: s.insurance, insDecided: s.insDecided, active: activeHand(s), result: s.result,
        ready: !!s.ready, backs: [], backResult: null,
        hands: s.hands.map(h => ({ cards: h.cards, bet: h.bet, score: score(h.cards), soft: soft(h.cards), done: h.done, result: h.result })), chips: bal(t, s.name), vip: null, level: 1 }) };
  }
  function profile() { const u = users[ME];
    return { name: ME, display: u.display, avatar: u.avatar, chips: u.chips, age18: true, ageOk: true, token: 'local', tableSkin: u.tableSkin, dailyIn: 0, adIn: 1e12, dailyAmt: G.rebuyChips,
      missions: [], level: 1, rank: '', xp: 0, nextXp: 100, vip: 'none', vipName: '', vipIcon: '', medals: [], allMedals: [], wagered: 0, purchases: [], limits: {}, spentDay: 0, spentMonth: 0,
      vipPts: 0, storeBonus: 0, vipNext: null, vipTiers: [{ id: 'none', name: 'Guest', icon: '♠', daily: 1, storeBonus: 0, adCooldownMin: 0 }], friends: [], incoming: [], outgoing: [], blocked: [], notifications: [], unreadNotifs: 0, chipReqs: [], role: 'player',
      emailVerified: true, email: '', pendingEmail: '', incognito: false, transferCap: 0, sentToday: 0, giftMin: 0 }; }

  // ---------- fake socket ----------
  let sock = null;
  const emit = o => { if (!(sock && sock.onmessage)) return; try { sock.onmessage({ data: JSON.stringify(o) }); } catch (err) { window.__sockErr = String(err && err.stack || err).slice(0, 1500); } };
  const broadcastTable = () => emit({ type: 'table', table: tableView() });
  const sendProfile = () => emit({ type: 'profile', profile: profile() });
  const err = e => emit({ type: 'error', error: e });
  const notice = text => emit({ type: 'notice', text });
  function setTimer(ms, fn) { clearTimeout(t.timer); t.deadline = Date.now() + ms; t.timer = setTimeout(fn, ms); }

  let pace = null;
  const stopPace = () => { if (pace) { clearTimeout(pace); pace = null; } };
  function startRound() {
    const players = t.seats.filter(s => s && s.bet > 0);
    if (t.phase !== 'betting' || !players.length) return;
    clearTimeout(t.timer); stopPace(); t.dealer = [];
    t.seats.forEach(s => { if (s && !(s.bet > 0) && s.pair) { add(t, s.name, s.pair); s.pair = 0; } });
    t.seats.forEach(s => { if (s) { s.ready = false; s.result = ''; s.insurance = 0; s.insDecided = false; s.hands = s.bet > 0 ? [{ cards: [], bet: s.bet, done: false, result: '' }] : []; } });
    t.phase = 'dealing'; t.turn = -1;
    const steps = [];
    for (let k = 0; k < 2; k++) { players.forEach(s => steps.push(s)); steps.push('dealer'); }
    let i = 0;
    const tick = () => {
      if (t.phase !== 'dealing') return;
      const who = steps[i++];
      if (who === 'dealer') t.dealer.push(draw()); else who.hands[0].cards.push(draw());
      broadcastTable();
      pace = setTimeout(i < steps.length ? tick : finishDeal, 480);
    };
    tick();
  }
  function finishDeal() {
    const players = t.seats.filter(s => s && s.hands.length);
    players.forEach(s => { const c = s.hands[0].cards; if (s.pair && c[0] && c[1] && c[0].r === c[1].r) { add(t, s.name, s.pair * 12); t.log.push(`${s.name} wins PAIR bet!`); } if (isBJ(c)) s.hands[0].done = true; });
    t.turn = -1; sendProfile();
    if (t.dealer[0] && t.dealer[0].r === 'A') {
      t.phase = 'insurance'; players.forEach(s => s.insDecided = isBJ(s.hands[0].cards) || users[s.name].bot);
      setTimer(10000, resolvePeek); broadcastTable(); if (players.every(s => s.insDecided)) resolvePeek();
    } else resolvePeek();
  }
  function insurance(s, take) {
    if (t.phase !== 'insurance' || s.insDecided || !s.hands.length) return 'No insurance offered';
    const cost = Math.floor(s.hands[0].bet / 2);
    if (take) { if (bal(t, s.name) < cost) return 'Insufficient chips'; add(t, s.name, -cost); s.insurance = cost; }
    s.insDecided = true; sendProfile();
    if (seated().filter(x => x.hands.length).every(x => x.insDecided)) resolvePeek(); else broadcastTable();
  }
  function resolvePeek() {
    if (t.phase !== 'insurance' && t.phase !== 'dealing') return;
    const dbj = isBJ(t.dealer);
    seated().forEach(s => { if (s.insurance) { if (dbj) { add(t, s.name, s.insurance * 3); t.log.push(`${s.name} insurance pays`); } else t.log.push(`${s.name} insurance lost`); } });
    t.phase = 'playing';
    if (dbj) { seated().forEach(s => s.hands.forEach(h => h.done = true)); return dealerPlay(); }
    nextTurn();
  }
  function nextTurn() {
    const i = t.seats.findIndex((s, i) => i > t.turn && s && s.hands.some(h => !h.done));
    if (i === -1) return dealerPlay();
    t.turn = i; armTurn(i); broadcastTable();
  }
  function armTurn(i) {
    const s = t.seats[i];
    if (users[s.name].bot) { setTimer(G.botDelayMs, () => botAct(i)); return; }
    setTimer(TURN_MS, () => { s.hands.forEach(h => h.done = true); t.log.push(`${s.name} auto-stand (AFK)`); nextTurn(); });
  }
  function act(i, a) {
    const s = t.seats[i]; if (t.phase !== 'playing' || t.turn !== i || !s) return 'Not your turn';
    const hi = activeHand(s); if (hi < 0) return 'No active hand';
    const h = s.hands[hi], two = h.cards.length === 2;
    if (a === 'hit') { if (h.splitAces) return 'Split aces get one card'; h.cards.push(draw()); if (score(h.cards) >= 21) h.done = true; }
    else if (a === 'stand') h.done = true;
    else if (a === 'double') { if (!two || h.splitAces) return 'Can only double on two cards'; if (bal(t, s.name) < h.bet) return 'Insufficient chips'; add(t, s.name, -h.bet); h.bet *= 2; h.cards.push(draw()); h.done = true; }
    else if (a === 'surrender') { if (!two || s.hands.length > 1) return 'Surrender only on first two cards'; h.surrendered = true; h.done = true; }
    else if (a === 'split') {
      if (!two || val(h.cards[0]) !== val(h.cards[1])) return 'Need a pair to split';
      if (s.hands.length >= 4) return 'Max 4 hands'; if (h.splitAces) return 'Cannot re-split aces';
      if (bal(t, s.name) < h.bet) return 'Insufficient chips';
      add(t, s.name, -h.bet); const aces = h.cards[0].r === 'A';
      const h2 = { cards: [h.cards.pop()], bet: h.bet, done: false, result: '', split: true }; h.split = true;
      s.hands.splice(hi + 1, 0, h2);
      for (const x of [h, h2]) { x.cards.push(draw()); if (aces) { x.splitAces = true; x.done = true; } else if (score(x.cards) === 21) x.done = true; }
    } else return 'Unknown action';
    if (s.hands.every(x => x.done)) nextTurn(); else { armTurn(i); broadcastTable(); }
    sendProfile();
  }
  function dealerPlay() {
    t.turn = -1; t.phase = 'dealer';
    broadcastTable();
    const go = () => {
      const natural = s => s.hands.length === 1 && isBJ(s.hands[0].cards);
      const live = seated().some(s => s.hands.some(h => !h.surrendered && score(h.cards) <= 21) && !natural(s));
      if (live && !isBJ(t.dealer) && score(t.dealer) < 17) { t.dealer.push(draw()); broadcastTable(); pace = setTimeout(go, 720); return; }
      settleNow();
    };
    pace = setTimeout(go, 640);
  }
  function settleNow() {
    t.turn = -1;
    const natural = s => s.hands.length === 1 && isBJ(s.hands[0].cards);
    const d = score(t.dealer), dbj = isBJ(t.dealer);
    seated().forEach(s => {
      if (!s.hands.length) return; const res = [];
      s.hands.forEach(h => { const p = score(h.cards), pbj = natural(s); let win = 0, r;
        if (h.surrendered) { win = Math.floor(h.bet / 2); r = 'SURRENDER'; }
        else if (pbj && !dbj) { win = h.bet + Math.floor(h.bet * 1.5); r = 'BLACKJACK'; }
        else if (p > 21) r = 'BUST';
        else if (dbj && !pbj) r = 'LOSE';
        else if (pbj && dbj) { win = h.bet; r = 'PUSH'; }
        else if (d > 21 || p > d) { win = h.bet * 2; r = 'WIN'; }
        else if (p === d) { win = h.bet; r = 'PUSH'; }
        else r = 'LOSE';
        add(t, s.name, win); h.result = r; res.push(r); });
      s.result = res.join('/'); t.log.push(`${s.name}: ${s.result}`);
    });
    t.phase = 'settled'; sendProfile();
    setTimer(4000, () => {
      t.phase = 'betting'; t.dealer = []; t.deadline = 0;
      t.seats.forEach(s => { if (!s) return; Object.assign(s, { bet: 0, pair: 0, hands: [], result: '', insurance: 0, backs: {}, backResult: null, ready: false }); });
      rebuys(); botsBet(); broadcastTable();
    });
    broadcastTable();
  }
  function rebuys() {
    for (const u of Object.values(users)) if (u.chips < tier.min) {
      u.chips += u.bot ? tier.min * 200 : G.rebuyChips;
      if (!u.bot) { saveMe(); notice(`Free rebuy: +${fmt(G.rebuyChips)} play chips`); sendProfile(); }
    }
  }
  // ---------- simple bots: flat bet, basic-strategy-lite ----------
  function botsBet() {
    seated().forEach(s => { const u = users[s.name]; if (!u.bot) return;
      const a = Math.min(tier.max, u.chips, tier.min * (1 + Math.floor(Math.random() * 5))); u.chips -= a; s.bet = a; s.ready = true; });
  }
  function botAct(i) {
    const s = t.seats[i]; if (!s || t.turn !== i) return; const h = s.hands[activeHand(s)]; if (!h) return nextTurn();
    const p = score(h.cards), sf = soft(h.cards), up = val(t.dealer[0]), two = h.cards.length === 2, u = users[s.name];
    let a = 'stand';
    if (two && val(h.cards[0]) === val(h.cards[1]) && (h.cards[0].r === 'A' || val(h.cards[0]) === 8) && s.hands.length < 4 && !h.splitAces && u.chips >= h.bet) a = 'split';
    else if (two && !sf && (p === 11 || (p === 10 && up < 10)) && u.chips >= h.bet && !h.splitAces) a = 'double';
    else if (sf ? p < 18 : (p < 12 || (p < 17 && up >= 7))) a = 'hit';
    if (act(i, a)) act(i, 'stand');
  }

  // ---------- message handler (subset of server.js handle()) ----------
  function handle(m) {
    const i = t.seats.findIndex(x => x && x.name === ME), s = t.seats[i];
    switch (m.type) {
      case 'resume': case 'login': case 'register': sendProfile(); emit({ type: 'chatHistory', chat: [] }); return broadcastTable();
      case 'ping': return emit({ type: 'pong' });
      case 'join': case 'view': case 'rejoin': case 'lobby': case 'leave': return broadcastTable(); // standalone: there is only this table
      case 'sit': { const k = m.seat; if (t.phase !== 'betting' || s.bet || !(k >= 0 && k < 5) || t.seats[k]) return err('Seat taken'); t.seats[i] = null; t.seats[k] = s; emit({ type: 'seatMoved' }); return broadcastTable(); }
      case 'setProfile': { const u = users[ME]; if (m.tableSkin) u.tableSkin = m.tableSkin; if (m.display) u.display = String(m.display).slice(0, 20); if (Number.isInteger(m.avatar)) u.avatar = m.avatar; sendProfile(); return broadcastTable(); }
      case 'daily': if (users[ME].chips >= tier.min) return err('Free rebuy is available when you drop below the table minimum'); users[ME].chips += G.rebuyChips; saveMe(); notice(`Free rebuy: +${fmt(G.rebuyChips)} play chips`); return sendProfile();
      case 'bet': case 'pair': {
        if (t.phase !== 'betting') return err('Betting closed');
        const a = Math.floor(+m.amount); if (!(a > 0) || a > bal(t, ME)) return err('Insufficient chips');
        if (m.type === 'bet' && s.bet + a > tier.max) return err('Above table max');
        if (m.type === 'pair' && !s.bet) return err('Place a main bet before the pair side bet');
        if (m.type === 'pair' && s.pair + a > tier.max / 10) return err('Pair bet max is ' + fmt(tier.max / 10));
        add(t, ME, -a); m.type === 'bet' ? s.bet += a : s.pair += a; sendProfile();
        if (m.type === 'bet' && t.deadline < Date.now()) setTimer(BET_MS, startRound);
        return broadcastTable(); }
      case 'clear': if (t.phase !== 'betting') return; add(t, ME, s.bet + s.pair); s.bet = s.pair = 0; s.ready = false; sendProfile(); return broadcastTable();
      case 'deal': if (!s.bet) return err('Place a bet first'); if (t.phase !== 'betting') return err('Betting closed');
        if (s.bet < tier.min) return err('Min bet ' + fmt(tier.min)); s.ready = true;
        if (seated().every(x => x.bet > 0 && x.ready)) return startRound(); return broadcastTable();
      case 'action': { const e = act(i, m.action); return e && err(e); }
      case 'insurance': { const e = insurance(s, !!m.take); return e && err(e); }
      case 'chat': return emit({ type: 'chat', name: ME, display: users[ME].display, avatar: users[ME].avatar, text: String(m.text || '').slice(0, 200), at: Date.now() });
      default: return; // social, store, events, slots, etc. are not part of the standalone build
    }
  }
  class LocalSocket {
    constructor() { this.readyState = 0; sock = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
    send(d) { let m; try { m = JSON.parse(d); } catch { return; } setTimeout(() => handle(m), 0); }
    close() {}
  }
  LocalSocket.CONNECTING = 0; LocalSocket.OPEN = 1; LocalSocket.CLOSING = 2; LocalSocket.CLOSED = 3;
  window.WebSocket = LocalSocket;
  // the client asks /api/config at boot; answer locally (no ads, no store)
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = (u, o) => String(u).startsWith('/api/')
    ? Promise.resolve(new Response(JSON.stringify(String(u).startsWith('/api/config') ? { compliance: false, ads: { provider: 'stub' }, reactions: ['😀', '😂', '😎', '🤩', '😱', '😭', '🥳', '🤑'], packs: [] } : {}), { headers: { 'content-type': 'application/json' } }))
    : realFetch(u, o);
  botsBet();
})();

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
  const CAST = [
    { id: 'mira', name: 'Mira Vale', style: 'conservative', avatar: '/avatars/mira.jpg', leave: 0.05, patience: 16 },
    { id: 'dex', name: 'Dex Harper', style: 'aggressive', avatar: '/avatars/dex.jpg', leave: 0.16, patience: 7 },
    { id: 'june', name: 'June Okada', style: 'counter', avatar: '/avatars/june.jpg', leave: 0.06, patience: 18 },
    { id: 'colt', name: 'Colt Brennan', style: 'wild', avatar: '/avatars/colt.jpg', leave: 0.24, patience: 5 },
    { id: 'nia', name: 'Nia Solano', style: 'basic', avatar: '/avatars/nia.jpg', leave: 0.04, patience: 20 },
    { id: 'rook', name: 'Rook Ellis', style: 'martingale', avatar: '/avatars/rook.jpg', leave: 0.12, patience: 9 },
  ];
  const TALK = {
    'mira-in': "I'll take a seat.", 'mira-out': 'Cashing out.', 'mira-win': 'Lovely.', 'mira-lose': 'Unfortunate.',
    'dex-in': 'Deal me in.', 'dex-out': "I'm out.", 'dex-win': "That's what I'm talking about.", 'dex-lose': 'Agh, bust.',
    'june-in': 'The count looks fine.', 'june-out': 'This shoe is cold.', 'june-win': 'As expected.', 'june-lose': 'Cold card.',
    'colt-in': 'One more round.', 'colt-out': "That's enough for me.", 'colt-win': 'Ha! Pay me.', 'colt-lose': 'Ridiculous.',
    'nia-in': 'Good evening.', 'nia-out': 'Good night.', 'nia-win': 'Thank you.', 'nia-lose': 'Oh well.',
    'rook-in': "I'm in.", 'rook-out': 'Leaving.', 'rook-win': "I'll press it.", 'rook-lose': "I'll get it back.",
  };
  const users = {};
  users[ME] = { name: ME, display: ME, avatar: G.avatar || 0, chips: +localStorage.bjLocalChips || G.startingChips, bot: false, tableSkin: G.skin || 'premium' };
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
  const seat = n => ({ name: n, bet: 0, pair: 0, hands: [], result: '', insurance: 0, insDecided: false, ready: false, backs: {}, backResult: null, rounds: 0 });
  const mine = Math.max(0, Math.min(4, G.mySeat | 0));
  t.seats[mine] = seat(ME);
  function sitBot(persona, index) {
    users[persona.name] = { name: persona.name, display: persona.name, avatar: persona.avatar, chips: tier.min * (60 + Math.floor(Math.random() * 140)), bot: true, persona: persona.id, style: persona.style, leave: persona.leave, patience: persona.patience, streak: 0, lastBet: tier.min };
    const s = seat(persona.name); s.rounds = 0; t.seats[index] = s;
  }
  const openSeats = () => t.seats.map((s, i) => (!s && i !== mine ? i : -1)).filter(i => i >= 0);
  const usedPersonas = () => new Set(t.seats.filter(s => s && users[s.name] && users[s.name].persona).map(s => users[s.name].persona));
  [0, 4].forEach(i => { if (i === mine || t.seats[i]) return; const pool = CAST.filter(p => !usedPersonas().has(p.id)); if (pool.length) sitBot(pool[Math.floor(Math.random() * pool.length)], i); });
  const draw = () => { if (t.shoe.length < 60) t.shoe = newShoe(); return t.shoe.pop(); };
  const seated = () => t.seats.filter(Boolean);
  const activeHand = s => s.hands.findIndex(h => !h.done);
  const fmt = n => n >= 1e9 ? n / 1e9 + 'B' : n >= 1e6 ? n / 1e6 + 'M' : n >= 1e3 ? n / 1e3 + 'K' : '' + n;
  function tableView() {
    const hide = t.phase === 'playing' || t.phase === 'insurance' || t.phase === 'dealing';
    return { id: t.id, tier: t.tier, private: false, code: null, phase: t.phase, turn: t.turn, deadline: t.deadline, log: t.log.slice(-6), tourney: null, vote: null,
      dealer: t.dealer.map((c, i) => hide && i === 1 ? { r: '?', s: '' } : c), dealerScore: hide ? (t.dealer[0] ? score([t.dealer[0]]) : 0) : score(t.dealer), dealerSoft: hide ? !!(t.dealer[0] && t.dealer[0].r === 'A') : soft(t.dealer),
      betMs: BET_MS, turnMs: TURN_MS, insMs: TURN_MS, now: Date.now(), held: {}, viewers: 0,
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
  function setTimer(ms, fn) { clearTimeout(t.timer); t.timer = null; t.deadline = Date.now() + ms; t.timer = setTimeout(fn, ms); }
  function clearTurnTimer() { clearTimeout(t.timer); t.timer = null; t.deadline = 0; }

  let dealGen = 0, playGen = 0;
  const stopPace = () => { dealGen++; };
  function whenQuiet() {
    return new Promise(resolve => {
      if (typeof window.__whenVoiceIdle === 'function') window.__whenVoiceIdle(resolve);
      else resolve();
    });
  }
  function startRound() {
    const players = t.seats.filter(s => s && s.bet > 0);
    if (t.phase !== 'betting' || !players.length) return;
    clearTimeout(t.timer); stopPace(); playGen++; t.dealer = [];
    t.seats.forEach(s => { if (s && !(s.bet > 0) && s.pair) { add(t, s.name, s.pair); s.pair = 0; } });
    t.seats.forEach(s => { if (s) { s.ready = false; s.result = ''; s.insurance = 0; s.insDecided = false; s.hands = s.bet > 0 ? [{ cards: [], bet: s.bet, done: false, result: '' }] : []; } });
    t.phase = 'dealing'; t.turn = -1;
    const steps = [];
    for (let k = 0; k < 2; k++) { players.forEach(s => steps.push(s)); steps.push('dealer'); }
    const gen = dealGen;
    let i = 0;
    const tick = () => {
      if (gen !== dealGen || t.phase !== 'dealing') return;
      const who = steps[i++];
      if (who === 'dealer') t.dealer.push(draw()); else who.hands[0].cards.push(draw());
      broadcastTable();
      whenQuiet().then(() => {
        if (gen !== dealGen || t.phase !== 'dealing') return;
        if (i < steps.length) tick(); else finishDeal();
      });
    };
    tick();
  }
  function finishDeal() {
    const players = t.seats.filter(s => s && s.hands.length);
    players.forEach(s => { const c = s.hands[0].cards; if (s.pair && c[0] && c[1] && c[0].r === c[1].r) { add(t, s.name, s.pair * 12); t.log.push(`${s.name} wins PAIR bet!`); } if (isBJ(c)) s.hands[0].done = true; });
    t.turn = -1; sendProfile();
    if (t.dealer[0] && t.dealer[0].r === 'A') {
      t.phase = 'insurance';
      // Bots decline on their own. A human always gets the choice, including even money on a natural.
      players.forEach(s => { s.insDecided = !!(users[s.name] && users[s.name].bot); });
      broadcastTable();
      if (players.every(s => s.insDecided)) resolvePeek();
      else setTimer(TURN_MS, () => { if (t.phase === 'insurance') resolvePeek(); });
    } else resolvePeek();
  }
  function insurance(s, take) {
    if (!s || t.phase !== 'insurance' || s.insDecided || !s.hands.length) return 'No insurance offered';
    const cost = Math.floor(s.hands[0].bet / 2);
    if (take) { if (bal(t, s.name) < cost) return 'Insufficient chips'; add(t, s.name, -cost); s.insurance = cost; }
    s.insDecided = true; sendProfile();
    if (seated().filter(x => x.hands.length).every(x => x.insDecided)) resolvePeek(); else broadcastTable();
  }
  function resolvePeek() {
    if (t.phase !== 'insurance' && t.phase !== 'dealing') return;
    clearTurnTimer();
    const dbj = isBJ(t.dealer);
    seated().forEach(s => { if (s.insurance) { if (dbj) { add(t, s.name, s.insurance * 3); t.log.push(`${s.name} insurance pays`); } else t.log.push(`${s.name} insurance lost`); } });
    t.phase = 'playing';
    if (dbj) { seated().forEach(s => s.hands.forEach(h => { h.done = true; })); return dealerPlay(); }
    nextTurn();
  }
  // Stay on this seat while any of its hands is still open. Never walk past one.
  function nextTurn() {
    if (t.phase !== 'playing') return;
    const cur = t.turn >= 0 ? t.seats[t.turn] : null;
    if (cur && cur.hands.some(h => !h.done)) { armTurn(t.turn); broadcastTable(); return; }
    clearTurnTimer();
    const i = t.seats.findIndex((s, idx) => idx > t.turn && s && s.hands.some(h => !h.done));
    if (i === -1) return dealerPlay();
    t.turn = i; armTurn(i); broadcastTable();
  }
  function armTurn(i) {
    const s = t.seats[i];
    if (!s || t.phase !== 'playing' || t.turn !== i) return;
    if (activeHand(s) < 0) return nextTurn();
    if (users[s.name].bot) {
      whenQuiet().then(() => { if (t.phase === 'playing' && t.turn === i && activeHand(t.seats[i]) >= 0) setTimer(500 + Math.floor(Math.random() * 1000), () => botAct(i)); });
      return;
    }
    setTimer(TURN_MS, () => {
      if (t.phase !== 'playing' || t.turn !== i || t.seats[i] !== s) return;
      const h = s.hands[activeHand(s)];
      if (!h) return nextTurn();
      h.done = true; t.log.push(`${s.name} auto-stand`);
      afterAct(i);
    });
  }
  // Close only the hand this decision belongs to, then keep going if this seat still has one open.
  function afterAct(i) {
    if (t.phase !== 'playing' || t.turn !== i) return;
    const s = t.seats[i];
    if (s && s.hands.some(h => !h.done)) { armTurn(i); broadcastTable(); return; }
    nextTurn();
  }
  function act(i, a) {
    const s = t.seats[i]; if (t.phase !== 'playing' || t.turn !== i || !s) return 'Not your turn';
    const hi = activeHand(s); if (hi < 0) return 'No active hand';
    const h = s.hands[hi], two = h.cards.length === 2;
    if (a === 'hit') {
      if (h.splitAces) return 'Split aces get one card';
      h.cards.push(draw()); if (score(h.cards) >= 21) h.done = true;
    } else if (a === 'stand') h.done = true;
    else if (a === 'double') {
      if (!two || h.splitAces) return 'Can only double on two cards';
      if (bal(t, s.name) < h.bet) return "You don't have the chips to double";
      add(t, s.name, -h.bet); h.bet *= 2; h.cards.push(draw()); h.done = true;
    } else if (a === 'surrender') {
      if (!two || s.hands.length > 1 || h.split) return 'Surrender only on first two cards';
      h.surrendered = true; h.done = true;
    } else if (a === 'split') {
      if (!two || val(h.cards[0]) !== val(h.cards[1])) return 'Need a pair to split';
      if (s.hands.length >= 4) return 'Max 4 hands'; if (h.splitAces) return 'Cannot re-split aces';
      if (bal(t, s.name) < h.bet) return "You don't have the chips to split";
      add(t, s.name, -h.bet); const aces = h.cards[0].r === 'A';
      const h2 = { cards: [h.cards.pop()], bet: h.bet, done: false, result: '', split: true }; h.split = true;
      s.hands.splice(hi + 1, 0, h2);
      for (const x of [h, h2]) { x.cards.push(draw()); if (aces) { x.splitAces = true; x.done = true; } else if (score(x.cards) >= 21) x.done = true; }
    } else return 'Unknown action';
    sendProfile(); afterAct(i);
  }
  function dealerPlay() {
    if (t.phase !== 'playing') return;
    clearTurnTimer();
    const gen = ++playGen;
    t.turn = -1; t.phase = 'dealer';
    broadcastTable();
    const go = () => {
      if (gen !== playGen || t.phase !== 'dealer') return;
      const natural = s => s.hands.length === 1 && isBJ(s.hands[0].cards);
      const live = seated().some(s => s.hands.some(h => !h.surrendered && score(h.cards) <= 21) && !natural(s));
      if (live && !isBJ(t.dealer) && score(t.dealer) < 17) { t.dealer.push(draw()); broadcastTable(); whenQuiet().then(go); return; }
      settleNow();
    };
    whenQuiet().then(go);
  }
  function settleNow() {
    t.turn = -1;
    const natural = s => s.hands.length === 1 && isBJ(s.hands[0].cards);
    const d = score(t.dealer), dbj = isBJ(t.dealer);
    seated().forEach(s => {
      if (!s.hands.length) return; const res = [];
      s.hands.forEach(h => { const p = score(h.cards), pbj = natural(s); let win = 0, r;
        if (h.surrendered) { win = Math.floor(h.bet / 2); r = 'SURRENDER'; }
        else if (p > 21) { r = 'BUST'; }
        else if (pbj && !dbj) { win = h.bet + Math.floor(h.bet * 1.5); r = 'BLACKJACK'; }
        else if (d > 21) { win = h.bet * 2; r = 'WIN'; }
        else if (dbj) r = 'LOSE';
        else if (p > d) { win = h.bet * 2; r = 'WIN'; }
        else if (p === d) { win = h.bet; r = 'PUSH'; }
        else r = 'LOSE';
        add(t, s.name, win); h.result = r; res.push(r); });
      s.result = res.join('/'); t.log.push(`${s.name}: ${s.result}`);
      const u = users[s.name];
      if (u && u.bot) {
        const won = res.some(r => r === 'WIN' || r === 'BLACKJACK'), lost = res.some(r => r === 'LOSE' || r === 'BUST');
        if (won && !lost) u.streak = u.streak > 0 ? u.streak + 1 : 1;
        else if (lost && !won) u.streak = u.streak < 0 ? u.streak - 1 : -1;
      }
    });
    t.phase = 'settled'; sendProfile();
    const remarks = seated().filter(s => users[s.name] && users[s.name].bot && s.hands.some(h => h.result === 'WIN' || h.result === 'BLACKJACK' || h.result === 'LOSE' || h.result === 'BUST'));
    if (remarks.length) {
      const s = remarks[Math.floor(Math.random() * remarks.length)], u = users[s.name];
      const won = s.hands.some(h => h.result === 'WIN' || h.result === 'BLACKJACK') && !s.hands.some(h => h.result === 'LOSE' || h.result === 'BUST');
      const key = u.persona + (won ? '-win' : '-lose');
      setTimeout(() => { const i = t.seats.indexOf(s); if (i >= 0) emit({ type: 'talk', seat: i, name: u.display.split(' ')[0], key, text: TALK[key] }); }, 1600 + Math.floor(Math.random() * 700));
    }
    setTimer(6800, openBetting);
    broadcastTable();
  }
  function openBetting() {
    playGen++; clearTurnTimer();
    const leavers = [];
    t.seats.forEach((s, i) => {
      if (!s || !users[s.name] || !users[s.name].bot) return;
      const u = users[s.name]; s.rounds = (s.rounds || 0) + 1;
      let p = u.leave;
      if (s.rounds >= u.patience) p += 0.22;
      if (u.streak <= -3) p += 0.18;
      if (u.chips < tier.min * 4) p += 0.25;
      p += 0.22;
      if (Math.random() < Math.min(0.75, p)) leavers.push(i);
    });
    const botCount = t.seats.filter(s => s && users[s.name] && users[s.name].bot).length;
    leavers.slice(0, botCount > 3 ? 2 : 1).forEach(i => {
      const s = t.seats[i], u = users[s.name], key = u.persona + '-out';
      emit({ type: 'talk', seat: i, name: u.display.split(' ')[0], key, text: TALK[key] });
      t.seats[i] = null;
    });
    const holes = openSeats(), sitting = t.seats.filter(s => s && users[s.name] && users[s.name].bot).length;
    let joined = null;
    if (holes.length && sitting < 3 && Math.random() < (sitting < 2 ? 0.9 : 0.62)) {
      const pool = CAST.filter(p => !usedPersonas().has(p.id));
      if (pool.length) { const persona = pool[Math.floor(Math.random() * pool.length)], i = holes[Math.floor(Math.random() * holes.length)]; sitBot(persona, i); joined = { i, persona }; }
    }
    t.phase = 'betting'; t.dealer = []; t.deadline = 0;
    t.seats.forEach(s => { if (!s) return; Object.assign(s, { bet: 0, pair: 0, hands: [], result: '', insurance: 0, backs: {}, backResult: null, ready: false }); });
    rebuys(); botsBet(); broadcastTable();
    if (joined) setTimeout(() => { const u = users[joined.persona.name]; if (!u) return; const key = u.persona + '-in'; emit({ type: 'talk', seat: joined.i, name: u.display.split(' ')[0], key, text: TALK[key] }); }, 700);
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
      const unit = tier.min; let mult = 2;
      if (u.style === 'conservative') mult = u.streak > 0 ? 2 : 1;
      else if (u.style === 'aggressive') mult = 4 + Math.floor(Math.random() * 4);
      else if (u.style === 'wild') mult = 1 + Math.floor(Math.random() * 8);
      else if (u.style === 'counter') mult = 2 + Math.floor(Math.random() * 3);
      else if (u.style === 'martingale') mult = u.streak < 0 ? Math.min(8, 2 * (1 + Math.min(3, -u.streak))) : 2;
      else mult = 2 + Math.floor(Math.random() * 2);
      const a = Math.min(tier.max, u.chips, unit * mult);
      if (a >= unit) { u.chips -= a; u.lastBet = a; s.bet = a; s.ready = true; } });
  }
  function botAct(i) {
    if (t.phase !== 'playing' || t.turn !== i) return;
    const s = t.seats[i]; if (!s) return; const h = s.hands[activeHand(s)]; if (!h) return nextTurn();
    const p = score(h.cards), sf = soft(h.cards), up = val(t.dealer[0]), two = h.cards.length === 2, u = users[s.name], style = u.style || 'basic';
    let a = 'stand';
    const canSplit = two && val(h.cards[0]) === val(h.cards[1]) && s.hands.length < 4 && !h.splitAces && u.chips >= h.bet;
    if (canSplit && (h.cards[0].r === 'A' || val(h.cards[0]) === 8 || (style === 'aggressive' && val(h.cards[0]) >= 6 && up <= 7))) a = 'split';
    else if (two && !sf && !h.splitAces && u.chips >= h.bet && (p === 11 || (p === 10 && up < 10) || (style === 'aggressive' && p === 9 && up >= 3 && up <= 6))) a = 'double';
    else if (style === 'counter' && !sf && p >= 12 && p <= 16 && up <= 6) a = 'stand';
    else if (style === 'conservative' ? (sf ? p < 17 : p < 12 || (p < 16 && up >= 7)) : (sf ? p < 18 : (p < 12 || (p < 17 && up >= 7)))) a = 'hit';
    if (style === 'wild' && a === 'stand' && p < 17 && Math.random() < 0.18) a = 'hit';
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
      case 'react': {
        const emoji = String(m.emoji || '').slice(0, 32);
        if (!emoji || i < 0) return;
        return emit({ type: 'reaction', seat: i, emoji, name: users[ME].display || ME });
      }
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
  setTimeout(() => {
    if (t.phase !== 'betting') return;
    const holes = openSeats(), sitting = t.seats.filter(s => s && users[s.name] && users[s.name].bot).length;
    if (!holes.length || sitting >= 3) return;
    const pool = CAST.filter(p => !usedPersonas().has(p.id));
    if (!pool.length) return;
    const persona = pool[Math.floor(Math.random() * pool.length)], i = holes[Math.floor(Math.random() * holes.length)];
    sitBot(persona, i);
    const u = users[persona.name], a = Math.min(tier.max, u.chips, tier.min * 2);
    if (a >= tier.min) { u.chips -= a; t.seats[i].bet = a; t.seats[i].ready = true; }
    broadcastTable();
    setTimeout(() => emit({ type: 'talk', seat: i, name: persona.name.split(' ')[0], key: persona.id + '-in', text: TALK[persona.id + '-in'] }), 600);
  }, 4500);
})();

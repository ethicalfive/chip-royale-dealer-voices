// v0.16 shared client seating helper (one place for every multiplayer room: blackjack Legacy + Premium, craps, roulette, coin toss).
// Server side lives in seating.js. Rooms carry seats[] (null = open) plus held{seat:name} (moves waiting for the round to end) and viewers.
// - open seats render with data-sit="i"; one capture-phase listener turns a tap into {type:'sit', seat:i} (sit when viewing, move when seated)
// - a shared "Viewing" pill (fixed overlay, never moves the layout) with Quick join
// - the last game/table/seat (or "viewing") is remembered per tab, so a reconnect after a server wake goes back to the same seat
(function () {
  const ANCHOR = { bj: 'banner', craps: 'cbanner', coin: 'kbanner', roulette: 'rSeats' };
  const VIEWS = { bj: 'table', craps: 'craps', roulette: 'roulette', coin: 'coin' };
  const QUICK = { bj: t => ({ type: 'join', tableId: t.id, tier: t.tier.id }), craps: t => ({ type: 'crapsJoin', tier: t.tier.id, tableId: t.id }), roulette: t => ({ type: 'rouJoin', tier: t.tier.id, tableId: t.id }), coin: t => ({ type: 'coinJoin', mode: t.mode }) };
  const who = () => (typeof me !== 'undefined' ? me : null); // app.js top-level `me` (shared global lexical scope)
  const S = window.Seats = {
    game: null, room: null, lastTapAt: 0,
    mine(t) { const m = S.meName(); return t && m ? t.seats.findIndex(s => s && s.name === m) : -1; },
    meName() { const m = who(); return m ? m.name : null; },
    watching(t) { return !!t && S.mine(t) < 0; },
    // who an open seat is reserved for (a pending move), or null
    heldBy(t, i) { return t && t.held ? t.held[i] || null : null; },
    // class + attributes + label for an OPEN seat i. Tappable unless someone's move reserved it.
    open(t, i) { const h = S.heldBy(t, i), mineH = h && h === S.meName();
      if (h) return { cls: mineH ? 'held mine' : 'held', attr: '', label: mineH ? 'Moving…' : 'Reserved' };
      return { cls: 'sitok', attr: `data-sit="${i}" role="button" aria-label="Sit in seat ${i + 1}"`, label: 'Open' }; },
    // compact open seat for craps / roulette / coin strips (same box as an empty .cseat, plus a tappable ghost)
    emptyC(t, i) { const o = S.open(t, i); return `<div class="cseat empty ${o.cls}" ${o.attr}><div class="av ghost"></div><div class="nm">${o.label}</div></div>`; },
    // the room this tab is in (called by every renderer)
    seen(game, t) { S.game = game; S.room = t; S.remember(game, t); S.pill(); },
    left() { S.game = null; S.room = null; S.pill(); },
    tap(i) { const t = S.room; if (!t || !S.game) return; const now = Date.now(); if (now - S.lastTapAt < 350) return; S.lastTapAt = now;
      if (t.seats[i]) return toast('Seat taken'); const h = S.heldBy(t, i); if (h && h !== S.meName()) return toast('Seat taken');
      try { navigator.vibrate && navigator.vibrate(12); } catch {} send({ type: 'sit', seat: i }); },
    quick() { const t = S.room; if (!t || !S.game) return; send(QUICK[S.game](t)); },
    remember(game, t) { if (!t || t.private || t.event) return; const i = S.mine(t);
      const rec = { game, tier: t.tier && t.tier.id, mode: t.mode, tableId: t.id, at: Date.now(), ...(i >= 0 ? { seat: i } : { view: 1 }) };
      sessionStorage.lastSeat = JSON.stringify(rec); },
    // after a reconnect/server wake told us we're in no room: back to the same seat (or the same table as a viewer) if that was <3 min ago
    rejoin(roomIntent) { let o; try { o = JSON.parse(sessionStorage.lastSeat || 'null'); } catch {} if (!o || o.game !== roomIntent || !(Date.now() - (o.at || 0) < 180e3)) return false;
      if (sessionStorage.seatRejoined === String(o.at)) return false; sessionStorage.seatRejoined = String(o.at); setTimeout(() => delete sessionStorage.seatRejoined, 5000);
      send({ type: 'rejoin', game: o.game, tier: o.tier, mode: o.mode, tableId: o.tableId, seat: o.seat, view: o.view }); return true; },
    forget() { sessionStorage.removeItem('lastSeat'); },
    // shared viewing pill: absolute overlay at the top of the game area (no layout shift)
    pill() { let p = document.getElementById('viewPill'); const t = S.room, g = S.game, onView = g && typeof view !== 'undefined' && view === VIEWS[g];
      const watching = onView && S.watching(t), moving = onView && t && t.held && Object.values(t.held).includes(S.meName());
      if (!watching && !moving) { if (p) p.classList.add('hidden'); document.body.classList.remove('viewing'); return; }
      if (!p) { p = document.createElement('div'); p.id = 'viewPill'; p.className = 'viewpill hidden'; document.body.appendChild(p);
        p.addEventListener('click', e => { if (e.target.closest('[data-qj]')) S.quick(); }); }
      const free = t.seats.filter((s, i) => !s && !S.heldBy(t, i)).length;
      p.innerHTML = moving ? '<span>↪ Moving after this round</span>' : `<span>👀 Viewing${t.viewers > 1 ? ` · ${t.viewers} watching` : ''} · ${free ? 'tap an open seat' : 'table full'}</span>${free ? '<button class="tiny" data-qj>Quick join</button>' : ''}`;
      p.classList.remove('hidden'); document.body.classList.toggle('viewing', watching); S.place(p, g); },
    // sits over the game's own status banner (which only has prompts for seated players) -> nothing in the layout moves
    place(p, g) { const a = document.getElementById(ANCHOR[g]); if (!a || !a.offsetParent) { p.style.top = ''; return; } const r = a.getBoundingClientRect(), ph = p.offsetHeight || 26;
      p.style.top = Math.round(g === 'roulette' ? r.top - ph - 2 : r.top + r.height / 2 - ph / 2) + 'px'; }
  };
  addEventListener('resize', () => setTimeout(() => S.pill(), 120));
  document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('[data-sit]'); if (!el) return; e.preventDefault(); e.stopPropagation(); S.tap(+el.dataset.sit); }, true);
})();

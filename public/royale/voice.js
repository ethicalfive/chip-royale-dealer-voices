// Dealer voice for the premium table. Lines live with the rest of the app's audio.
(() => {
  const CAPTIONS = {
    welcome: "Welcome to the Gilt Shoe.",
    goodluck: "Good luck.",
    placebets: "Place your bets, please.",
    nomorebets: "No more bets.",
    insurance: "Insurance?",
    blackjack: "Blackjack.",
    twentyone: "Twenty-one.",
    dealerblackjack: "Dealer has blackjack.",
    bust: "Bust.",
    dealerbusts: "Dealer busts.",
    youwin: "You win.",
    housewins: "House wins.",
    push: "Push.",
    doubledown: "Double down.",
    split: "Split.",
    surrender: "Surrender.",
    evenmoney: "Even money?",
    insurancepays: "Insurance pays.",
    insuranceloses: "Insurance loses.",
    newshoe: "New shoe.",
    nicehand: "Nice hand.",
    n2: "Two.", n3: "Three.", n4: "Four.", n5: "Five.", n6: "Six.", n7: "Seven.", n8: "Eight.", n9: "Nine.", n10: "Ten.",
    n11: "Eleven.", n12: "Twelve.", n13: "Thirteen.", n14: "Fourteen.", n15: "Fifteen.", n16: "Sixteen.", n17: "Seventeen.", n18: "Eighteen.", n19: "Nineteen.", n20: "Twenty.",
    welldone: "Oh, well done.",
    beautiful: "Beautiful hand.",
    thatsaway: "That's the way.",
    lovely: "Lovely.",
    congrats: "Congratulations!",
    toobad: "Ah, too bad.",
    unlucky: "Unlucky.",
    notthistime: "Not this time.",
    shame: "Oh, what a shame.",
    housetakes: "The house takes it.",
    bustsoft: "Ah, bust.",
    youwinex: "Yes! You win.",
    nicehandex: "Nice hand!",
    blackjackex: "Blackjack!",
    twentyoneex: "Twenty-one!",
    dealerbustsex: "Dealer busts!",
    throat: "",
  };
  const ARNOLD = {
    bust: "It's not a tumor!",
    toobad: "Too bad, I'll be back!",
    thatsaway: "Head to the chopper!",
  };
  const AEON = {
    thatsaway: "The nature of Monkey was irrepressible!",
    lovely: "With our thoughts, we make the world.",
    notthistime: "And yet again.",
    shame: "Primal chaos reigned.",
    housetakes: "Heaven sought order.",
  };
  const OWN = { arnold: ARNOLD, aeon: AEON };
  const caption = key => (OWN[dealerId()] || {})[key] || CAPTIONS[key] || "";
  const CHEERS = ["youwin", "youwinex", "nicehand", "nicehandex", "welldone", "beautiful", "thatsaway", "lovely", "congrats"];
  const TOOBAD = ["housewins", "toobad", "unlucky", "notthistime", "shame", "housetakes"];
  const DEALERS = [
    { id: "sam", name: "Sam" },
    { id: "hal", name: "Hal" },
    { id: "lane", name: "Lane" },
    { id: "arnold", name: "Arnold" },
    { id: "aeon", name: "Aeon" },
    { id: "", name: "Margot" },
  ];
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const you = () => (window.BJ_CONFIG && BJ_CONFIG.game.playerName) || "You";
  const dealerId = () => (localStorage.bjDealer === undefined ? "sam" : localStorage.bjDealer);
  const muted = () => localStorage.muted === "1";

  const style = document.createElement("style");
    style.textContent = `#dealerLine{position:fixed;z-index:80;left:50%;top:4.6rem;transform:translateX(-50%);max-width:min(92vw,24rem);padding:.4rem .9rem;border-radius:999px;background:rgba(10,8,6,.88);color:#f3e6c8;border:1px solid #d4b06a;font:600 .92rem/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.35)}#dealerLine[hidden]{display:none}#dealerPick{flex:none;margin:0;background:#3a2a12;color:#f6e7c1;font-weight:700}
.talkbubble{position:fixed;z-index:85;transform:translate(-50%,-115%);max-width:min(70vw,14rem);padding:.35rem .6rem .4rem;border-radius:14px;background:rgba(8,6,4,.92);color:#f6edd8;border:1px solid #d4b06a;font:600 .78rem/1.3 system-ui,sans-serif;text-align:center;pointer-events:none;box-shadow:0 8px 20px rgba(0,0,0,.35)}
.talkbubble b{display:block;color:#e6c36a;font-size:.68rem;letter-spacing:.04em;text-transform:uppercase}
#ptable .pseat.turn .pframe,#ptable .pseat.talking .pframe{box-shadow:0 0 0 3px #e6c36a,0 0 16px rgba(230,195,106,.45)}`;
  document.head.appendChild(style);
  const line = document.createElement("div");
  line.id = "dealerLine";
  line.hidden = true;
  document.body.appendChild(line);
  const pickBtn = document.createElement("button");
  pickBtn.id = "dealerPick";
  pickBtn.className = "tiny";
  pickBtn.type = "button";
  const paintPick = () => { const d = DEALERS.find(x => x.id === dealerId()) || DEALERS[0]; pickBtn.textContent = d.name; pickBtn.title = "Dealer: " + d.name; };
  paintPick();
  pickBtn.onclick = () => {
    const i = Math.max(0, DEALERS.findIndex(x => x.id === dealerId()));
    localStorage.bjDealer = DEALERS[(i + 1) % DEALERS.length].id;
    paintPick();
  };
  const chipsEl = document.getElementById("chips");
  if (chipsEl && chipsEl.parentElement) chipsEl.parentElement.insertBefore(pickBtn, chipsEl);

  let ctx, musicGain, musicOn = false, musicBuf = null;
  const buffers = new Map();
  const queue = [];
  let pumping = false;
  let bubbleTimer = 0;

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.5;
      musicGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function showLine(text) {
    if (!text) { line.hidden = true; return; }
    line.hidden = false;
    line.textContent = text;
    clearTimeout(bubbleTimer);
  }
  function hideLineSoon() {
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { line.hidden = true; }, 700);
  }

  async function load(key, explicit) {
    const id = explicit ? "" : dealerId();
    const hit = (explicit || id) + ":" + key;
    if (buffers.has(hit)) return buffers.get(hit);
    const urls = explicit ? [explicit] : (id ? [`/voices/${id}/${key}.mp3?v=20`, `/voices/${key}.mp3?v=20`] : [`/voices/${key}.mp3?v=20`]);
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await audio().decodeAudioData((await res.arrayBuffer()).slice(0));
        buffers.set(hit, buf);
        return buf;
      } catch { /* try the next voice folder */ }
    }
    buffers.set(hit, null);
    return null;
  }

  function playBuf(buf) {
    return new Promise(resolve => {
      const c = audio();
      let started = false;
      const go = () => {
        if (started || c.state !== "running") return;
        started = true;
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(c.destination);
        src.onended = () => resolve();
        try { src.start(); } catch { resolve(); }
      };
      if (c.state === "running") go();
      else {
        const on = () => { if (c.state === "running") { c.removeEventListener("statechange", on); go(); } };
        c.addEventListener("statechange", on);
        c.resume().then(on).catch(() => {});
      }
    });
  }

  const idleWaiters = [];
  function voiceBusy() { return pumping || queue.length > 0; }
  window.__voiceBusy = voiceBusy;
  window.__whenVoiceIdle = fn => { if (!voiceBusy()) fn(); else idleWaiters.push(fn); };

  async function pump() {
    if (pumping) return;
    pumping = true;
    while (queue.length) {
      const item = queue.shift();
      if (muted()) { item.done(); continue; }
      if (item.bubble) showBubble(item.bubble.seat, item.bubble.name, item.bubble.text, item.bubble.point);
      else if (item.key !== "throat") showLine(caption(item.key));
      try {
        const buf = await load(item.key, item.url);
        if (buf) await playBuf(buf);
        else await new Promise(r => setTimeout(r, 500));
      } finally {
        if (!item.bubble && item.key !== "throat") hideLineSoon();
        item.done();
      }
    }
    pumping = false;
    if (!queue.length) idleWaiters.splice(0).forEach(fn => fn());
  }

  function showBubble(seat, name, text, point) {
    const el = document.createElement("div");
    el.className = "talkbubble";
    const who = document.createElement("b");
    who.textContent = name || "";
    const said = document.createElement("span");
    said.textContent = text || "";
    el.append(who, said);
    document.body.appendChild(el);
    const anchor = document.querySelector(`#ptable .pseat[data-i="${seat}"] .pav`) || document.querySelector(`#ptable .pseat[data-i="${seat}"]`);
    let x = point ? point.x : innerWidth / 2;
    let y = point ? point.y : innerHeight * 0.32;
    let below = false;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      x = r.left + r.width / 2;
      if (r.top < 78) { y = r.bottom + 4; below = true; }
      else y = r.top;
      const seatEl = anchor.closest(".pseat");
      if (seatEl) { seatEl.classList.add("talking"); setTimeout(() => seatEl.classList.remove("talking"), 3400); }
    }
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.transform = below ? "translate(-50%, 6px)" : "translate(-50%, -108%)";
    setTimeout(() => el.remove(), 3400);
  }
  function sayPlayer(key, bubble) {
    let point = null;
    if (bubble) {
      const anchor = document.querySelector(`#ptable .pseat[data-i="${bubble.seat}"] .pav`);
      if (anchor) { const r = anchor.getBoundingClientRect(); point = { x: r.left + r.width / 2, y: r.top }; }
    }
    queue.push({ key, url: `/voices/${key}.mp3?v=20`, bubble: bubble ? { seat: bubble.seat, name: bubble.name, text: bubble.text, point } : null, done() {} });
    if (queue.length > 14) queue.splice(0, queue.length - 14);
    void pump();
  }
  function say(key) {
    if (!CAPTIONS[key] && key !== "throat") return;
    if (!muted() && (dealerId() === "sam" || dealerId() === "arnold" || dealerId() === "aeon") && key !== "throat" && Math.random() < 0.06) {
      queue.push({ key: "throat", done() {} });
    }
    queue.push({ key, done() {} });
    if (queue.length > 14) queue.splice(0, queue.length - 14);
    void pump();
  }

  function handTotal(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
      if (!c || c.r === "?" || !c.r) continue;
      if (c.r === "A") { aces++; total += 11; }
      else if (c.r === "10" || "JQK".includes(c.r)) total += 10;
      else total += +c.r;
    }
    while (total > 21 && aces) { total -= 10; aces--; }
    return total;
  }
  function visible(cards) { return (cards || []).filter(c => c && c.r && c.r !== "?"); }
  function sig(cards) { return (cards || []).map(c => (c && c.r) || "?").join(","); }

  function callTotal(cards, who) {
    const shown = visible(cards);
    const total = handTotal(shown);
    if (shown.length === 2 && total === 21 && shown.length === cards.length) { say(Math.random() < 0.5 ? "blackjackex" : "blackjack"); return; }
    if (total > 21) { if (who === "me") say(Math.random() < 0.5 ? "bustsoft" : "bust"); return; }
    if (total === 21) { say(Math.random() < 0.5 ? "twentyoneex" : "twentyone"); return; }
    if (total >= 2 && total <= 20) say("n" + total);
  }

  let prev = null;
  let welcomed = false;

  function onTable(t) {
    if (!t) return;
    const name = you();
    const mine = (t.seats || []).find(s => s && s.name === name);
    const mineHands = mine && mine.hands ? mine.hands : [];
    if (!prev) {
      prev = snap(t, mineHands);
      if (!welcomed) { welcomed = true; say("placebets"); }
      return;
    }
    const was = prev;
    if (was.phase !== "betting" && t.phase === "betting") say("placebets");
    if (was.phase === "betting" && t.phase !== "betting") say("nomorebets");
    if (t.phase === "insurance" && was.phase !== "insurance") say(mine && isBj(mineHands[0]) ? "evenmoney" : "insurance");

    const dealerVis = visible(t.dealer).map(c => c.r + (c.s || "")).join(",");
    if (dealerVis && dealerVis !== was.dealer) callTotal(t.dealer, "dealer");

    mineHands.forEach((h, i) => {
      const before = was.hands[i];
      const now = sig(h.cards);
      if (!before) { if (i > 0) say("split"); return; }
      if (now !== before.sig && h.cards.length > before.n) {
        if (h.bet > before.bet) say("doubledown");
        callTotal(h.cards, "me");
      }
    });
    if (t.phase === "settled" && was.phase !== "settled" && mine) {
      const results = mineHands.map(h => h.result);
      const profit = results.reduce((sum, r, i) => {
        const bet = mineHands[i].bet || 0;
        if (r === "BLACKJACK") return sum + Math.floor(bet * 1.5);
        if (r === "WIN") return sum + bet;
        if (r === "PUSH") return sum;
        if (r === "SURRENDER") return sum - Math.ceil(bet / 2);
        return sum - bet;
      }, 0);
      if (results.includes("SURRENDER")) say("surrender");
      if (t.dealerScore > 21) {
        say(Math.random() < 0.5 ? "dealerbustsex" : "dealerbusts");
        if (profit > 0) say(pick(CHEERS));
        else if (profit < 0) say(pick(["bustsoft", "toobad", "unlucky", "notthistime"]));
      } else {
        if (isBj(t.dealer)) say("dealerblackjack");
        if (profit > 0 && results.includes("BLACKJACK")) say(pick(["congrats", "beautiful", "blackjackex", "nicehandex", "welldone"]));
        else if (profit > 0) say(pick(CHEERS));
        else if (profit < 0) say(pick(TOOBAD));
        else say("push");
      }
      const insured = was.insurance;
      if (insured && isBj(t.dealer)) say("insurancepays");
      else if (insured) say("insuranceloses");
    }
    prev = snap(t, mineHands);
  }

  function isBj(h) {
    if (!h) return false;
    const cards = h.cards || h;
    return Array.isArray(cards) && cards.length === 2 && handTotal(cards) === 21 && cards.every(c => c.r !== "?");
  }
  function snap(t, hands) {
    return {
      phase: t.phase,
      dealer: visible(t.dealer).map(c => c.r + (c.s || "")).join(","),
      insurance: !!(hands[0] && t.seats && t.seats.find(s => s && s.name === you())?.insurance),
      hands: hands.map(h => ({ sig: sig(h.cards), n: h.cards.length, bet: h.bet || 0 })),
    };
  }

  async function startMusic() {
    if (musicOn || muted()) return;
    musicOn = true;
    try {
      const res = await fetch("/music/cas1.mp3");
      if (!res.ok) return;
      musicBuf = await audio().decodeAudioData(await res.arrayBuffer());
    } catch { musicOn = false; return; }
    const fade = Math.min(3.2, musicBuf.duration / 4);
    const arm = when => {
      if (!musicOn || !musicBuf) return;
      const src = audio().createBufferSource();
      src.buffer = musicBuf;
      const g = audio().createGain();
      src.connect(g); g.connect(musicGain);
      const end = when + musicBuf.duration;
      const out = end - fade;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(1, when + fade);
      g.gain.setValueAtTime(1, out);
      g.gain.linearRampToValueAtTime(0.0001, end);
      src.start(when);
      src.stop(end + 0.05);
      setTimeout(() => arm(out), Math.max(100, (out - audio().currentTime - 0.15) * 1000));
    };
    arm(audio().currentTime + 0.08);
  }

  document.addEventListener("pointerdown", () => { audio(); startMusic(); }, { once: false });
  const mute = document.getElementById("mute");
  if (mute) mute.addEventListener("click", () => setTimeout(() => {
    if (!muted() && !musicOn) startMusic();
    if (!ctx || !musicGain) return;
    musicGain.gain.setTargetAtTime(muted() ? 0.0001 : 0.5, ctx.currentTime, 0.05);
  }, 0));

  function hookSocket() {
    if (!ws || ws.__voice) return;
    const inner = ws.onmessage;
    ws.__voice = true;
    ws.onmessage = e => {
      try { if (inner) inner(e); }
      catch (err) { window.__voiceErr = String(err && err.stack || err).slice(0, 1500); }
      try {
        const m = JSON.parse(e.data);
        if (m.type === "talk") sayPlayer(m.key, { seat: m.seat, name: m.name, text: m.text });
        if (m.type === "table") onTable(m.table);
      } catch (err) { window.__voiceErr = String(err && err.stack || err).slice(0, 1500); }
    };
  }
  hookSocket();
  const wrap = connect;
  connect = function () { wrap(); hookSocket(); };
})();

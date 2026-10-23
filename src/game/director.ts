import { chooseAction, shouldLeave, wantsInsurance, type Advice } from "./ai";
import { captionFor, onVoice, preloadVoices, resumeIfNeeded, setDealerVoice, sfxCard, sfxChip, sfxLose, sfxWin, speak, startTableMusic, unlockAudio } from "./audio";
import { DEALERS, asDealer } from "./dealers";
import { PERSONAS } from "./personas";
import {
  breakIntoChips,
  dealerShouldHit,
  drawFrom,
  handTotal,
  hiLo,
  HUMAN_SEAT,
  isNatural,
  isPair,
  MAX_BET,
  MIN_BET,
  settleHand,
  sumChips,
  trueCount,
  type Card,
} from "./rules";
import {
  availablePersonas,
  buyIn,
  freshHand,
  loadSave,
  makeHuman,
  makeSeat,
  newShoeState,
  saveSettled,
  useGame,
} from "./store";
import type { Bubble, Hand, Seat } from "./types";

type Decision = Advice | "INS" | "NO" | "EVEN";

let token = 0;
let pending: ((d: Decision) => void) | null = null;
let bubbleSeq = 1;

const DEAL_PLAYER_MS = 230;
const DEAL_DEALER_MS = 980;
const DEALER_HIT_MS = 1320;

const CHEERS = ["youwin", "youwinex", "nicehand", "nicehandex", "welldone", "beautiful", "thatsaway", "lovely", "congrats"];
const TOOBAD = ["housewins", "toobad", "unlucky", "notthistime", "shame", "housetakes", "sorry"];

function pickLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? lines[0]!;
}

function activeDealer() {
  const id = asDealer(useGame.getState().dealerId ?? useGame.getState().settings.dealer);
  if (useGame.getState().dealerId !== id) useGame.setState({ dealerId: id });
  const dealer = DEALERS[id];
  setDealerVoice(dealer.voice);
  return dealer;
}

function sleep(ms: number, my: number): Promise<void> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (token !== my) reject(new Error("stale"));
      else resolve();
    }, ms);
  });
}

function waitDecision(my: number): Promise<Decision> {
  return new Promise((resolve, reject) => {
    if (token !== my) {
      reject(new Error("stale"));
      return;
    }
    pending = (d) => {
      if (token !== my) reject(new Error("stale"));
      else resolve(d);
    };
  });
}

export function playerDecide(d: Decision): void {
  if (!pending) return;
  const resolve = pending;
  pending = null;
  resolve(d);
}

onVoice(() => {
  /* Captions are shown when the line is requested, so a backed-up queue still names the speaker. */
});

function say(key: string, speaker?: { anchor: number | "dealer"; name: string }): void {
  const dealer = activeDealer();
  if (key === "throat") {
    if (dealer.id !== "sam" || !useGame.getState().settings.sound) return;
    void speak("throat");
    return;
  }
  const who = speaker ?? { anchor: "dealer" as const, name: dealer.short };
  const line = captionFor(key);
  if (!line) return;
  const id = bubbleSeq++;
  const show = () => {
    const bubble: Bubble = { id, anchor: who.anchor, name: who.name, text: line };
    useGame.setState((s) => ({
      spoken: line,
      bubbles: [...s.bubbles.filter((item) => item.anchor !== who.anchor), bubble].slice(-6),
    }));
  };
  const hide = () => {
    useGame.setState((s) => ({ bubbles: s.bubbles.filter((item) => item.id !== id) }));
  };
  if (!useGame.getState().settings.sound) {
    show();
    window.setTimeout(hide, Math.min(5600, Math.max(2200, line.length * 70)));
    return;
  }
  if (!speaker && dealer.id === "sam" && Math.random() < 0.06) void speak("throat");
  let shownAt = 0;
  void speak(key, () => {
    shownAt = performance.now();
    show();
  }).then(() => {
    const elapsed = shownAt ? performance.now() - shownAt : 0;
    const linger = Math.max(1200, 2600 - elapsed);
    window.setTimeout(hide, linger);
  });
}

function handClosed(h: Hand): boolean {
  if (h.surrendered || h.stood) return true;
  if (h.cards.length < 2) return false;
  if (h.aceSplit) return true;
  return handTotal(h.cards).total >= 21;
}

function announce(cards: Card[]): void {
  const { total, soft } = handTotal(cards);
  if (cards.length === 2 && isNatural(cards)) {
    say(Math.random() < 0.6 ? "blackjackex" : "blackjack");
    return;
  }
  if (total > 21) {
    say(Math.random() < 0.65 ? "bustsoft" : "bust");
    return;
  }
  if (total === 21) {
    say(Math.random() < 0.55 ? "twentyoneex" : "twentyone");
    return;
  }
  if (soft && cards.length > 1) say("soft");
  if (total >= 2 && total <= 20) say(`n${total}`);
}

async function layDealerCard(hidden: boolean, my: number, pace: number): Promise<void> {
  giveDealer(hidden);
  sfxCard();
  await sleep(460, my);
  const state = useGame.getState();
  if (!hidden && !state.holeHidden) announce(state.dealerCards);
  const rest = Math.max(0, pace - 460);
  if (rest > 0) await sleep(rest, my);
}

function giveSeat(si: number, hi: number): void {
  useGame.setState((s) => {
    const drawn = drawFrom(s.shoe, s.running, true);
    const seats = s.seats.map((seat, i) => {
      if (i !== si || !seat) return seat;
      const hands = seat.hands.map((h, j) => {
        if (j !== hi) return h;
        const cards = [...h.cards, drawn.card];
        const next = { ...h, cards };
        return { ...next, stood: handClosed(next) };
      });
      return { ...seat, hands };
    });
    return { seats, shoe: drawn.shoe, running: drawn.running };
  });
}

function giveDealer(hidden: boolean): void {
  useGame.setState((s) => {
    const drawn = drawFrom(s.shoe, s.running, !hidden);
    return {
      shoe: drawn.shoe,
      running: drawn.running,
      dealerCards: [...s.dealerCards, drawn.card],
      holeHidden: hidden ? true : s.holeHidden,
    };
  });
}

function revealHole(): void {
  useGame.setState((s) => {
    const hole = s.dealerCards[1];
    if (!s.holeHidden || !hole) return { holeHidden: false };
    return { holeHidden: false, running: s.running + hiLo(hole) };
  });
}

function canDouble(seat: Seat, hand: Hand): boolean {
  return hand.cards.length === 2 && !hand.aceSplit && !hand.stood && !hand.surrendered && seat.bankroll >= hand.bet && handTotal(hand.cards).total < 21;
}

function canSplit(seat: Seat, hand: Hand): boolean {
  if (hand.cards.length !== 2 || seat.hands.length >= 4) return false;
  if (seat.bankroll < hand.bet || !isPair(hand.cards)) return false;
  if (hand.cards[0]?.rank === 1 && hand.fromSplit) return false;
  return true;
}

function canSurrender(hand: Hand): boolean {
  return hand.cards.length === 2 && !hand.fromSplit && !hand.doubled && !hand.stood && !hand.surrendered;
}

function optionsFor(seat: Seat, hand: Hand) {
  const up = useGame.getState().dealerCards[0];
  return {
    canDouble: canDouble(seat, hand),
    canSplit: canSplit(seat, hand),
    canSurrender: canSurrender(hand),
    hitSoft17: useGame.getState().settings.hitSoft17,
    up,
  };
}

function applyInsurance(si: number): void {
  useGame.setState((s) => {
    const seat = s.seats[si];
    const hand = seat?.hands[0];
    if (!seat || !hand || hand.insurance > 0) return {};
    const premium = Math.floor(hand.bet / 2);
    if (premium <= 0 || seat.bankroll < premium) return {};
    const seats = s.seats.slice();
    const hands = seat.hands.slice();
    hands[0] = { ...hand, insurance: premium };
    seats[si] = { ...seat, bankroll: seat.bankroll - premium, hands };
    return { seats };
  });
}

function splitHand(si: number, hi: number): void {
  useGame.setState((s) => {
    const seat = s.seats[si];
    const hand = seat?.hands[hi];
    if (!seat || !hand || seat.bankroll < hand.bet || hand.cards.length !== 2) return {};
    const [c1, c2] = hand.cards;
    if (!c1 || !c2) return {};
    const ace = c1.rank === 1;
    const left: Hand = { ...freshHand(hand.bet, hand.chips.slice()), cards: [c1], fromSplit: true, aceSplit: ace };
    const right: Hand = { ...freshHand(hand.bet, breakIntoChips(hand.bet, 6)), cards: [c2], fromSplit: true, aceSplit: ace };
    const hands = seat.hands.slice();
    hands.splice(hi, 1, left, right);
    const seats = s.seats.slice();
    seats[si] = { ...seat, bankroll: seat.bankroll - hand.bet, hands };
    return { seats };
  });
}

function doubleHand(si: number, hi: number): void {
  useGame.setState((s) => {
    const seat = s.seats[si];
    const hand = seat?.hands[hi];
    if (!seat || !hand || seat.bankroll < hand.bet) return {};
    const hands = seat.hands.slice();
    hands[hi] = {
      ...hand,
      bet: hand.bet * 2,
      doubled: true,
      chips: [...hand.chips, ...breakIntoChips(hand.bet, 4)].slice(0, 12),
    };
    const seats = s.seats.slice();
    seats[si] = { ...seat, bankroll: seat.bankroll - hand.bet, hands };
    return { seats };
  });
}

function standHand(si: number, hi: number): void {
  useGame.setState((s) => {
    const seat = s.seats[si];
    const hand = seat?.hands[hi];
    if (!seat || !hand) return {};
    const hands = seat.hands.map((h, j) => (j === hi ? { ...h, stood: true } : h));
    const seats = s.seats.slice();
    seats[si] = { ...seat, hands };
    return { seats };
  });
}

function surrenderHand(si: number, hi: number): void {
  useGame.setState((s) => {
    const seat = s.seats[si];
    if (!seat) return {};
    const hands = seat.hands.map((h, j) => (j === hi ? { ...h, surrendered: true, stood: true } : h));
    const seats = s.seats.slice();
    seats[si] = { ...seat, hands };
    return { seats };
  });
}

async function applyDecision(si: number, hi: number, decision: Decision, my: number, human: boolean): Promise<void> {
  const seat = useGame.getState().seats[si];
  const hand = seat?.hands[hi];
  if (!seat || !hand) return;
  if (decision === "H") {
    giveSeat(si, hi);
    sfxCard();
    await sleep(220, my);
    if (human) announce(useGame.getState().seats[si]?.hands[hi]?.cards ?? []);
    const total = handTotal(useGame.getState().seats[si]?.hands[hi]?.cards ?? []).total;
    if (human && total > 21) useGame.setState({ shake: true });
    return;
  }
  if (decision === "S") {
    standHand(si, hi);
    return;
  }
  if (decision === "D" && canDouble(seat, hand)) {
    if (human) say("doubledown");
    doubleHand(si, hi);
    sfxChip();
    giveSeat(si, hi);
    standHand(si, hi);
    sfxCard();
    await sleep(240, my);
    if (human) announce(useGame.getState().seats[si]?.hands[hi]?.cards ?? []);
    return;
  }
  if (decision === "P" && canSplit(seat, hand)) {
    if (human) say("split");
    splitHand(si, hi);
    sfxChip();
    await sleep(160, my);
    giveSeat(si, hi);
    sfxCard();
    await sleep(180, my);
    giveSeat(si, hi + 1);
    sfxCard();
    await sleep(180, my);
    return;
  }
  if (decision === "R" && canSurrender(hand)) {
    if (human) say("surrender");
    surrenderHand(si, hi);
  }
}

async function playHand(si: number, hi: number, my: number): Promise<void> {
  let guard = 0;
  while (!handClosed(useGame.getState().seats[si]?.hands[hi] ?? freshHand(0, [])) && guard < 12) {
    guard += 1;
    const seat = useGame.getState().seats[si];
    const hand = seat?.hands[hi];
    const up = useGame.getState().dealerCards[0];
    if (!seat || !hand || !up) return;
    if (hand.cards.length < 2) {
      giveSeat(si, hi);
      sfxCard();
      await sleep(180, my);
      continue;
    }
    const human = seat.personaId === null;
    if (human) {
      useGame.setState({ phase: "acting", acting: { seat: si, hand: hi }, banner: "Your hand." });
      const decision = await waitDecision(my);
      await applyDecision(si, hi, decision, my, true);
    } else {
      const first = seat.name.split(" ")[0] ?? seat.name;
      useGame.setState({ phase: "acting", acting: { seat: si, hand: hi }, banner: `${first} is thinking.` });
      const total = handTotal(hand.cards).total;
      const tough = total >= 12 && total <= 16;
      const think = (tough ? 850 : 420) + Math.floor(Math.random() * (tough ? 1600 : 1100));
      await sleep(think, my);
      const opts = optionsFor(seat, hand);
      if (!opts.up || seat.style === "you") {
        standHand(si, hi);
        return;
      }
      const decision = chooseAction(hand.cards, opts.up, seat.style, opts);
      await applyDecision(si, hi, decision, my, false);
    }
  }
}

function reshuffleIfNeeded(): boolean {
  const s = useGame.getState();
  if (s.shoe.length >= s.cutAt && s.shoe.length > 0) return false;
  const fresh = newShoeState();
  useGame.setState(fresh);
  return true;
}

function lockBets(): void {
  useGame.setState((s) => {
    const seats = s.seats.map((seat) => {
      if (!seat) return seat;
      const bet = sumChips(seat.pendingChips);
      if (bet < MIN_BET) return { ...seat, hands: [], pendingChips: [] };
      return {
        ...seat,
        hands: [freshHand(bet, seat.pendingChips.slice())],
        pendingChips: [],
        lastBet: bet,
      };
    });
    const humanChips = s.seats[HUMAN_SEAT]?.pendingChips ?? [];
    return {
      seats,
      lastHumanChips: humanChips.length ? humanChips.slice() : s.lastHumanChips,
      handNumber: s.handNumber + 1,
    };
  });
}

async function payout(my: number): Promise<void> {
  const dealerCards = useGame.getState().dealerCards;
  const dealerBj = isNatural(dealerCards);
  let humanProfit = 0;
  let humanInsured = false;
  let humanBusted = false;
  let humanBj = false;
  let humanPlayed = false;

  const seats = useGame.getState().seats.map((seat) => {
    if (!seat) return seat;
    let profitSum = 0;
    let returnedSum = 0;
    let any = false;
    const hands = seat.hands.map((hand) => {
      if (hand.bet <= 0 || hand.cards.length === 0) return hand;
      any = true;
      const settled = settleHand({
        cards: hand.cards,
        bet: hand.bet,
        dealerCards,
        surrendered: hand.surrendered,
        fromSplit: hand.fromSplit,
      });
      const insReturn = hand.insurance > 0 && dealerBj ? hand.insurance * 3 : 0;
      const profit = settled.returned + insReturn - hand.bet - hand.insurance;
      profitSum += profit;
      returnedSum += settled.returned + insReturn;
      const chips =
        settled.outcome === "lose" || settled.outcome === "bust"
          ? []
          : breakIntoChips(settled.returned + insReturn, 8);
      return { ...hand, outcome: settled.outcome, profit, chips, stood: true };
    });
    if (!any) return { ...seat, hands };
    let streak = seat.streak;
    let lastResult = seat.lastResult;
    if (profitSum > 0) {
      streak = streak >= 0 ? streak + 1 : 1;
      lastResult = "win" as const;
    } else if (profitSum < 0) {
      streak = streak <= 0 ? streak - 1 : -1;
      lastResult = "lose" as const;
    } else lastResult = "push" as const;
    if (seat.personaId === null) {
      humanPlayed = true;
      humanProfit = profitSum;
      humanInsured = seat.hands.some((h) => h.insurance > 0);
      const played = seat.hands.filter((h) => h.bet > 0 && h.cards.length > 0);
      humanBusted = played.every((h) => h.surrendered || handTotal(h.cards).total > 21);
      humanBj = played.some((h) => isNatural(h.cards) && !h.fromSplit);
    }
    return { ...seat, hands, bankroll: seat.bankroll + returnedSum, streak, lastResult };
  });

  useGame.setState({ seats, phase: "payout", acting: null, banner: "Settling the felt." });

  if (humanPlayed) {
    const human = useGame.getState().seats[HUMAN_SEAT];
    const stats = { ...useGame.getState().stats };
    stats.played += 1;
    stats.net += humanProfit;
    if (humanProfit > 0) stats.won += 1;
    else if (humanProfit < 0) stats.lost += 1;
    else stats.pushed += 1;
    useGame.setState({ stats });
    if (human) saveSettled(human.bankroll);
    if (useGame.getState().settings.sound) {
      if (humanProfit > 0) sfxWin();
      else if (humanProfit < 0) sfxLose();
    }
    if (dealerBj && humanInsured && humanProfit === 0) say("insurancepays");
    else if (!dealerBj && humanInsured) say("insuranceloses");
    if (humanProfit > 0 && humanBj) say(pickLine(["congrats", "beautiful", "blackjackex", "nicehandex", "welldone"]));
    else if (humanProfit > 0) say(pickLine(CHEERS));
    else if (humanProfit < 0) say(pickLine(TOOBAD));
    else if (humanProfit === 0 && !dealerBj) say("push");
    if (humanProfit > 0) {
      const splash = { id: bubbleSeq++, title: humanBj ? "Blackjack" : "You win" };
      useGame.setState({ splash });
      window.setTimeout(() => {
        if (useGame.getState().splash?.id === splash.id) useGame.setState({ splash: null });
      }, 2400);
    }
  }

  const talkers: { index: number; seat: Seat }[] = [];
  useGame.getState().seats.forEach((seat, index) => {
    if (!seat?.personaId || !seat.lastResult || seat.lastResult === "push") return;
    talkers.push({ index, seat });
  });
  if (talkers.length) {
    const talker = talkers[Math.floor(Math.random() * talkers.length)]!;
    const key = `${talker.seat.personaId}-${talker.seat.lastResult === "win" ? "win" : "lose"}`;
    say(key, { anchor: talker.index, name: talker.seat.name.split(" ")[0] ?? talker.seat.name });
  }

  await sleep(2300, my);
  useGame.setState({ shake: false });
  await turnover(my);
}

async function turnover(my: number): Promise<void> {
  const s = useGame.getState();
  const tc = trueCount(s.running, s.shoe.length);
  const leaving: { index: number; seat: Seat }[] = [];
  s.seats.forEach((seat, index) => {
    if (!seat || seat.personaId === null) return;
    if (shouldLeave(seat, tc)) leaving.push({ index, seat });
  });
  if (leaving.length) {
    const names = new Set(leaving.map((item) => item.seat.id));
    const first = leaving[0]!;
    useGame.setState({
      note: `${first.seat.name} leaves the table.`,
      seats: useGame.getState().seats.map((seat) => (seat && names.has(seat.id) ? { ...seat, motion: "out" } : seat)),
    });
    say(first.seat.voiceOut, { anchor: first.index, name: first.seat.name.split(" ")[0] ?? first.seat.name });
    await sleep(700, my);
    useGame.setState({
      seats: useGame.getState().seats.map((seat) => (seat && names.has(seat.id) ? null : seat)),
    });
  }

  const seated = useGame.getState().seats.filter((seat) => seat && seat.personaId !== null).length;
  const empties: number[] = [];
  useGame.getState().seats.forEach((seat, i) => {
    if (i !== HUMAN_SEAT && !seat) empties.push(i);
  });
  let joined = 0;
  for (const index of empties) {
    if (joined >= 2) break;
    const pool = availablePersonas(useGame.getState().seats);
    if (pool.length === 0) break;
    const chance = seated + joined < 2 ? 0.9 : 0.42;
    if (Math.random() > chance) continue;
    const persona = pool[Math.floor(Math.random() * pool.length)]!;
    const seat = makeSeat(persona, buyIn());
    const seats = useGame.getState().seats.slice();
    seats[index] = seat;
    useGame.setState({ seats, note: `${persona.name} takes an open seat.` });
    say(persona.voiceIn, { anchor: index, name: persona.name.split(" ")[0] ?? persona.name });
    joined += 1;
    await sleep(420, my);
  }

  if (reshuffleIfNeeded()) say("newshoe");
  useGame.getState().placeAiBets();
  useGame.setState({
    phase: "betting",
    acting: null,
    dealerCards: [],
    holeHidden: false,
    banner: "Bets are open.",
    shake: false,
  });
  if (Math.random() < 0.28) say("goodluck");
  say("placebets");
}

async function play(my: number): Promise<void> {
  if (reshuffleIfNeeded()) say("newshoe");
  say("nomorebets");
  useGame.setState({ phase: "dealing", banner: "No more bets.", dealerCards: [], holeHidden: false, shake: false });
  lockBets();
  await sleep(280, my);

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 5; i++) {
      const seat = useGame.getState().seats[i];
      if (!seat || !seat.hands[0] || seat.hands[0].bet <= 0) continue;
      giveSeat(i, 0);
      sfxCard();
      await sleep(DEAL_PLAYER_MS, my);
    }
    await layDealerCard(pass === 1, my, DEAL_DEALER_MS);
  }

  const humanCards = useGame.getState().seats[HUMAN_SEAT]?.hands[0]?.cards ?? [];
  if (humanCards.length === 2) announce(humanCards);

  const up = useGame.getState().dealerCards[0];
  const dealerBj = isNatural(useGame.getState().dealerCards);
  if (up?.rank === 1) {
    for (let i = 0; i < 5; i++) {
      const seat = useGame.getState().seats[i];
      if (!seat || seat.personaId === null || !seat.hands[0]) continue;
      if (wantsInsurance(seat.style, useGame.getState().running, useGame.getState().shoe.length)) applyInsurance(i);
    }
    const humanBj = isNatural(humanCards);
    say(humanBj ? "evenmoney" : "insurance");
    useGame.setState({
      phase: "insurance",
      acting: { seat: HUMAN_SEAT, hand: 0 },
      banner: humanBj ? "Even money, or play the blackjack." : "Dealer shows an ace.",
    });
    const decision = await waitDecision(my);
    if (decision === "INS" || decision === "EVEN") applyInsurance(HUMAN_SEAT);
    await sleep(200, my);
  }

  if (up && (up.rank === 1 || up.rank >= 10) && dealerBj) {
    revealHole();
    sfxCard();
    await sleep(520, my);
    say("dealerblackjack");
    await sleep(900, my);
    await payout(my);
    return;
  }

  for (let si = 0; si < 5; si++) {
    let hi = 0;
    while (hi < (useGame.getState().seats[si]?.hands.length ?? 0)) {
      const hand = useGame.getState().seats[si]?.hands[hi];
      if (hand && hand.bet > 0 && hand.cards.length > 0) await playHand(si, hi, my);
      hi += 1;
    }
  }

  const needsDraw = useGame.getState().seats.some((seat) =>
    seat?.hands.some((hand) => {
      if (hand.bet <= 0 || hand.surrendered) return false;
      if (handTotal(hand.cards).total > 21) return false;
      if (isNatural(hand.cards) && !hand.fromSplit) return false;
      return true;
    }),
  );

  const dealer = activeDealer();
  useGame.setState({ phase: "dealer", acting: null, banner: `${dealer.short} plays.` });
  revealHole();
  sfxCard();
  await sleep(620, my);
  announce(useGame.getState().dealerCards);

  if (needsDraw) {
    let guard = 0;
    while (dealerShouldHit(useGame.getState().dealerCards, useGame.getState().settings.hitSoft17) && guard < 10) {
      guard += 1;
      await layDealerCard(false, my, DEALER_HIT_MS);
    }
    const total = handTotal(useGame.getState().dealerCards).total;
    if (total > 21) say(Math.random() < 0.5 ? "dealerbustsex" : "dealerbusts");
  }

  await sleep(420, my);
  await payout(my);
}

export function sitDown(): void {
  unlockAudio();
  const dealer = activeDealer();
  preloadVoices();
  startTableMusic();
  const s = useGame.getState();
  if (s.phase !== "intro") return;
  const saved = s.hydrated ? null : loadSave();
  const bankroll = saved?.bankroll ?? s.bankroll;
  const shoe = newShoeState();
  const seats = Array.from({ length: 5 }, () => null) as (Seat | null)[];
  seats[HUMAN_SEAT] = makeHuman(bankroll);
  const pool = [...PERSONAS];
  const openings = [0, 1, 3, 4].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const index of openings) {
    const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (!pick) continue;
    seats[index] = { ...makeSeat(pick, buyIn()), motion: null };
  }
  const names = seats.filter((seat) => seat && seat.personaId).map((seat) => seat!.name.split(" ")[0]);
  useGame.setState({
    ...shoe,
    seats,
    phase: "betting",
    spoken: "",
    note: `${dealer.short} has the shoe. ${names.join(", ")} already at the table.`,
    banner: "Bets are open.",
    dealerCards: [],
    holeHidden: false,
    acting: null,
    hydrated: true,
    bankroll,
    stats: saved?.stats ?? s.stats,
    settings: saved?.settings ?? s.settings,
    lastHumanChips: saved?.lastHumanChips ?? s.lastHumanChips,
  });
  useGame.getState().placeAiBets();
  say("welcome");
  say("goodluck");
  say("placebets");
}

export function deal(): void {
  unlockAudio();
  resumeIfNeeded();
  const s = useGame.getState();
  if (s.phase !== "betting") return;
  const bet = sumChips(s.seats[HUMAN_SEAT]?.pendingChips ?? []);
  if (bet < MIN_BET || bet > MAX_BET) return;
  const anyAi = s.seats.some((seat) => seat && seat.personaId && sumChips(seat.pendingChips) >= MIN_BET);
  if (!anyAi && bet < MIN_BET) return;
  token += 1;
  const my = token;
  void play(my).catch((err: unknown) => {
    if (err instanceof Error && err.message === "stale") return;
    console.error(err);
    pending = null;
    useGame.setState({ phase: "betting", banner: "The hand was reset." });
  });
}

export function humanCan(kind: "hit" | "stand" | "double" | "split" | "surrender"): boolean {
  const s = useGame.getState();
  if (s.phase === "insurance") return kind === "stand";
  if (s.phase !== "acting" || !s.acting || s.acting.seat !== HUMAN_SEAT) return false;
  const seat = s.seats[s.acting.seat];
  const hand = seat?.hands[s.acting.hand];
  if (!seat || !hand || handClosed(hand)) return false;
  if (kind === "hit" || kind === "stand") return true;
  if (kind === "double") return canDouble(seat, hand);
  if (kind === "split") return canSplit(seat, hand);
  return canSurrender(hand);
}

export { canDouble, canSplit, canSurrender, handClosed };

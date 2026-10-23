import {
  handTotal,
  isPair,
  MAX_BET,
  MIN_BET,
  trueCount,
  upValue,
  type Card,
} from "./rules";

export type Style = "basic" | "wild" | "aggressive" | "conservative" | "counter" | "martingale";
export type Advice = "H" | "S" | "D" | "P" | "R";

export type BetSeat = {
  style: Style | "you";
  bankroll: number;
  lastBet: number;
  lastResult?: "win" | "lose" | "push";
};

export function basicStrategy(
  cards: Card[],
  dealerUp: Card,
  opts: { canDouble: boolean; canSplit: boolean; canSurrender: boolean; hitSoft17: boolean },
): Advice {
  const up = upValue(dealerUp);
  const { total, soft } = handTotal(cards);
  const two = cards.length === 2;

  if (opts.canSplit && isPair(cards) && two) {
    const pr = cards[0]!.rank === 1 ? 11 : cards[0]!.rank >= 10 ? 10 : cards[0]!.rank;
    if (pr === 11 || pr === 8) return "P";
    if (pr === 10) return "S";
    if (pr === 9) return up === 7 || up >= 10 ? "S" : "P";
    if (pr === 7 && up >= 2 && up <= 7) return "P";
    if (pr === 6 && up >= 2 && up <= 6) return "P";
    if (pr === 4 && (up === 5 || up === 6)) return "P";
    if ((pr === 2 || pr === 3) && up >= 2 && up <= 7) return "P";
  }

  if (opts.canSurrender && !soft && two) {
    if (total === 16 && up >= 9) return "R";
    if (total === 15 && up === 10) return "R";
    if (opts.hitSoft17 && total === 15 && up === 11) return "R";
  }

  if (soft) {
    if (total >= 20) return "S";
    if (total === 19) {
      if (opts.canDouble && two && up === 6) return "D";
      return "S";
    }
    if (total === 18) {
      const double =
        opts.canDouble && two && ((up >= 3 && up <= 6) || (opts.hitSoft17 && up === 2));
      if (double) return "D";
      if (up >= 9) return "H";
      return "S";
    }
    const windows: Record<number, number[]> = {
      13: [5, 6],
      14: [5, 6],
      15: [4, 5, 6],
      16: [4, 5, 6],
      17: [3, 4, 5, 6],
    };
    if (opts.canDouble && two && (windows[total] ?? []).includes(up)) return "D";
    return "H";
  }

  if (total >= 17) return "S";
  if (total <= 8) return "H";
  if (total === 9) return opts.canDouble && two && up >= 3 && up <= 6 ? "D" : "H";
  if (total === 10) return opts.canDouble && two && up >= 2 && up <= 9 ? "D" : "H";
  if (total === 11) {
    const aceOk = opts.hitSoft17 && up === 11;
    return opts.canDouble && two && (up !== 11 || aceOk) ? "D" : "H";
  }
  if (total === 12) return up >= 4 && up <= 6 ? "S" : "H";
  return up >= 2 && up <= 6 ? "S" : "H";
}

export function chooseAction(
  cards: Card[],
  dealerUp: Card,
  style: Style,
  opts: { canDouble: boolean; canSplit: boolean; canSurrender: boolean; hitSoft17: boolean },
): Advice {
  let advice = basicStrategy(cards, dealerUp, opts);
  const total = handTotal(cards).total;

  if (style === "conservative") {
    if (advice === "R") advice = basicStrategy(cards, dealerUp, { ...opts, canSurrender: false });
    if (advice === "D" && total !== 11) advice = "H";
    if (advice === "P") {
      const pr = cards[0]?.rank === 1 ? 11 : cards[0] && cards[0].rank >= 10 ? 10 : cards[0]?.rank;
      if (pr !== 11 && pr !== 8) {
        advice = basicStrategy(cards, dealerUp, { ...opts, canSplit: false, canSurrender: false });
        if (advice === "D") advice = "H";
      }
    }
    if (advice === "H" && !handTotal(cards).soft && total >= 12) advice = "S";
  }

  if (style === "aggressive") {
    if (advice === "R") advice = basicStrategy(cards, dealerUp, { ...opts, canSurrender: false });
    if (opts.canDouble && cards.length === 2 && total >= 9 && total <= 11 && advice === "H") advice = "D";
  }

  if (style === "wild" && Math.random() < 0.34) {
    const legal: Advice[] = [];
    if (total < 17) legal.push("H");
    if (total >= 12) legal.push("S");
    if (opts.canDouble) legal.push("D");
    if (opts.canSplit) legal.push("P");
    if (legal.length) advice = legal[Math.floor(Math.random() * legal.length)]!;
  }

  if (advice === "D" && !opts.canDouble) advice = "H";
  if (advice === "P" && !opts.canSplit) advice = basicStrategy(cards, dealerUp, { ...opts, canSplit: false });
  if (advice === "R" && !opts.canSurrender) advice = basicStrategy(cards, dealerUp, { ...opts, canSurrender: false });
  if (advice === "H" && total >= 21) advice = "S";
  if (advice === "D" && !opts.canDouble) advice = total >= 17 ? "S" : "H";
  return advice;
}

export function chooseBet(seat: BetSeat, tc: number): number {
  if (seat.style === "you") return 0;
  const unit = MIN_BET;
  let bet = unit * 2;
  switch (seat.style) {
    case "conservative":
      bet = unit;
      break;
    case "basic":
      bet = unit * 2;
      break;
    case "aggressive":
      bet = unit * (8 + Math.floor(Math.random() * 25));
      break;
    case "wild":
      bet = unit * (1 + Math.floor(Math.random() * 40));
      break;
    case "counter": {
      const t = Math.floor(tc);
      if (t <= 1) bet = unit;
      else if (t === 2) bet = unit * 5;
      else if (t === 3) bet = unit * 10;
      else if (t === 4) bet = unit * 20;
      else bet = unit * 40;
      break;
    }
    case "martingale":
      bet = seat.lastResult === "lose" ? Math.max(unit, seat.lastBet * 2) : unit * 2;
      break;
  }
  bet = Math.min(bet, MAX_BET, seat.bankroll);
  bet = Math.floor(bet / unit) * unit;
  return bet >= unit ? bet : 0;
}

export function wantsInsurance(style: Style | "you", running: number, shoeLeft: number): boolean {
  if (style === "you") return false;
  const tc = trueCount(running, shoeLeft);
  if (style === "counter") return tc >= 3;
  if (style === "wild") return Math.random() < 0.22;
  return false;
}

export function shouldLeave(
  seat: { style: Style | "you"; bankroll: number; streak: number; roundsSat: number; patience: number; leaveBias: number },
  tc: number,
): boolean {
  if (seat.style === "you") return false;
  if (seat.bankroll < MIN_BET) return true;
  let p = seat.leaveBias;
  if (seat.bankroll < MIN_BET * 8) p += 0.25;
  if (seat.streak <= -3) p += 0.2;
  if (seat.roundsSat >= seat.patience) p += 0.18;
  if (seat.streak >= 3) p -= 0.08;
  if (seat.style === "counter") {
    if (tc >= 2) p -= 0.25;
    if (tc <= -1) p += 0.28;
  }
  if (seat.style === "wild" && Math.random() < 0.08) return true;
  p = Math.min(0.88, Math.max(0.02, p));
  return Math.random() < p;
}

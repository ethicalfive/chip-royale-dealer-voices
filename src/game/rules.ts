export type Suit = "s" | "h" | "d" | "c";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type Card = {
  id: string;
  rank: Rank;
  suit: Suit;
};

export const MIN_BET = 500;
export const MAX_BET = 100_000;
export const START_BANK = 200_000;
export const REBUY = 200_000;
export const DECKS = 6;
export const HUMAN_SEAT = 2;
export const SEAT_COUNT = 5;

export const CHIP_VALUES = [500, 2_500, 10_000, 50_000, 100_000] as const;
export type ChipValue = (typeof CHIP_VALUES)[number];

const SUITS: Suit[] = ["s", "h", "d", "c"];
const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

let seq = 1;

export function makeShoe(decks = DECKS): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `c${seq++}`, rank, suit });
      }
    }
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = cards[i]!;
    const b = cards[j]!;
    cards[i] = b;
    cards[j] = a;
  }
  return cards;
}

export function cutCard(): number {
  return 60 + Math.floor(Math.random() * 30);
}

export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === 1) {
      aces += 1;
      total += 11;
    } else if (card.rank >= 10) total += 10;
    else total += card.rank;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 && total <= 21 };
}

export function isNatural(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

export function hiLo(card: Card): number {
  if (card.rank >= 2 && card.rank <= 6) return 1;
  if (card.rank === 1 || card.rank >= 10) return -1;
  return 0;
}

export function trueCount(running: number, shoeLeft: number): number {
  const decks = Math.max(0.5, shoeLeft / 52);
  return running / decks;
}

export function upValue(card: Card): number {
  if (card.rank === 1) return 11;
  if (card.rank >= 10) return 10;
  return card.rank;
}

export function isPair(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  const [a, b] = cards;
  if (!a || !b) return false;
  if (a.rank === b.rank) return true;
  return a.rank >= 10 && b.rank >= 10;
}

export type Outcome = "win" | "lose" | "push" | "blackjack" | "surrender" | "bust";

export function settleHand(opts: {
  cards: Card[];
  bet: number;
  dealerCards: Card[];
  surrendered: boolean;
  fromSplit: boolean;
}): { outcome: Outcome; returned: number } {
  const { cards, bet, dealerCards, surrendered, fromSplit } = opts;
  if (surrendered) return { outcome: "surrender", returned: Math.floor(bet / 2) };
  const player = handTotal(cards).total;
  const dealer = handTotal(dealerCards).total;
  if (player > 21) return { outcome: "bust", returned: 0 };
  const playerBj = isNatural(cards) && !fromSplit;
  const dealerBj = isNatural(dealerCards);
  if (playerBj && dealerBj) return { outcome: "push", returned: bet };
  if (playerBj) return { outcome: "blackjack", returned: bet + Math.floor((bet * 3) / 2) };
  if (dealer > 21) return { outcome: "win", returned: bet * 2 };
  if (dealerBj || dealer > player) return { outcome: "lose", returned: 0 };
  if (player > dealer) return { outcome: "win", returned: bet * 2 };
  return { outcome: "push", returned: bet };
}

export function dealerShouldHit(cards: Card[], hitSoft17: boolean): boolean {
  const { total, soft } = handTotal(cards);
  if (total < 17) return true;
  return total === 17 && soft && hitSoft17;
}

export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = dollars.toLocaleString("en-US");
  if (rem === 0) return `${sign}$${body}`;
  return `${sign}$${body}.${rem.toString().padStart(2, "0")}`;
}

export function sumChips(chips: number[]): number {
  return chips.reduce((n, v) => n + v, 0);
}

export function breakIntoChips(cents: number, cap = 8): number[] {
  const out: number[] = [];
  let left = cents;
  const denoms = [...CHIP_VALUES].reverse();
  for (const denom of denoms) {
    while (left >= denom && out.length < cap) {
      out.push(denom);
      left -= denom;
    }
  }
  if (out.length === 0 && cents > 0) out.push(MIN_BET);
  return out;
}

export function chipLabel(value: number): string {
  if (value >= 100_000) return "1k";
  if (value >= 10_000) return String(value / 100);
  if (value % 100 === 0) return String(value / 100);
  return money(value);
}

export function rankLabel(rank: Rank): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

export function suitName(suit: Suit): string {
  if (suit === "s") return "spades";
  if (suit === "h") return "hearts";
  if (suit === "d") return "diamonds";
  return "clubs";
}

export function drawFrom(
  shoe: Card[],
  running: number,
  revealed: boolean,
): { card: Card; shoe: Card[]; running: number } {
  let next = shoe;
  let rc = running;
  if (next.length === 0) {
    next = makeShoe();
    rc = 0;
  }
  const card = next[next.length - 1]!;
  next = next.slice(0, -1);
  if (revealed) rc += hiLo(card);
  return { card, shoe: next, running: rc };
}

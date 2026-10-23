import { create } from "zustand";
import { chooseBet } from "./ai";
import { PERSONAS, type Persona } from "./personas";
import {
  breakIntoChips,
  cutCard,
  HUMAN_SEAT,
  makeShoe,
  MAX_BET,
  MIN_BET,
  REBUY,
  SEAT_COUNT,
  START_BANK,
  sumChips,
  trueCount,
} from "./rules";
import { sfxChip } from "./audio";
import type { Bubble, Hand, Phase, SaveData, Seat, Settings, Splash, Stats } from "./types";
import { asDealer, type DealerId } from "./dealers";

const SAVE_KEY = "gilt-shoe-v1";

export type GameState = {
  phase: Phase;
  seats: (Seat | null)[];
  dealerCards: import("./rules").Card[];
  holeHidden: boolean;
  shoe: import("./rules").Card[];
  cutAt: number;
  running: number;
  acting: { seat: number; hand: number } | null;
  spoken: string;
  note: string;
  banner: string;
  handNumber: number;
  stats: Stats;
  settings: Settings;
  bankroll: number;
  lastHumanChips: number[];
  shake: boolean;
  hydrated: boolean;
  dealerId: DealerId | null;
  bubbles: Bubble[];
  splash: Splash | null;
};

const emptyStats = (): Stats => ({ played: 0, won: 0, lost: 0, pushed: 0, net: 0 });

const defaultSettings = (): Settings => ({
  hitSoft17: false,
  coach: false,
  showCount: false,
  sound: true,
  dealer: "sam",
});

function emptySeats(): (Seat | null)[] {
  return Array.from({ length: SEAT_COUNT }, () => null);
}

let seatSeq = 1;

export function freshHand(bet: number, chips: number[]): Hand {
  return {
    cards: [],
    bet,
    chips,
    insurance: 0,
    doubled: false,
    surrendered: false,
    stood: false,
    fromSplit: false,
    aceSplit: false,
  };
}

export function makeSeat(persona: Persona, bankroll: number): Seat {
  return {
    id: `seat-${persona.id}-${seatSeq++}`,
    personaId: persona.id,
    name: persona.name,
    style: persona.style,
    label: persona.label,
    avatar: persona.avatar,
    voiceIn: persona.voiceIn,
    voiceOut: persona.voiceOut,
    bankroll,
    hands: [],
    pendingChips: [],
    roundsSat: 0,
    streak: 0,
    lastBet: 0,
    patience: persona.patience,
    leaveBias: persona.leaveBias,
    motion: "in",
  };
}

export function makeHuman(bankroll: number): Seat {
  return {
    id: "you",
    personaId: null,
    name: "You",
    style: "you",
    label: "You",
    avatar: "",
    voiceIn: "",
    voiceOut: "",
    bankroll,
    hands: [],
    pendingChips: [],
    roundsSat: 0,
    streak: 0,
    lastBet: 0,
    patience: 99,
    leaveBias: 0,
    motion: null,
  };
}

function persist(s: GameState): void {
  if (typeof window === "undefined") return;
  const data: SaveData = {
    version: 1,
    bankroll: s.bankroll,
    stats: s.stats,
    settings: s.settings,
    lastHumanChips: s.lastHumanChips,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function loadSave(): SaveData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data || data.version !== 1 || typeof data.bankroll !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

type Store = GameState & {
  hydrate: () => void;
  patch: (partial: Partial<GameState>) => void;
  setSpoken: (spoken: string) => void;
  addChip: (value: number) => void;
  removeChip: () => void;
  clearBet: () => void;
  repeatBet: () => void;
  doubleBet: () => void;
  rebuy: () => void;
  toggle: (key: keyof Settings) => void;
  chooseDealer: (id: DealerId) => void;
  placeAiBets: () => void;
};

export const useGame = create<Store>((set, get) => ({
  phase: "intro",
  seats: emptySeats(),
  dealerCards: [],
  holeHidden: false,
  shoe: [],
  cutAt: 70,
  running: 0,
  acting: null,
  spoken: "",
  note: "The felt is open.",
  banner: "",
  handNumber: 0,
  stats: emptyStats(),
  settings: defaultSettings(),
  bankroll: START_BANK,
  lastHumanChips: [],
  shake: false,
  hydrated: false,
  dealerId: null,
  bubbles: [],
  splash: null,

  hydrate: () => {
    const saved = loadSave();
    if (!saved) {
      set({ hydrated: true });
      return;
    }
    set({
      hydrated: true,
      bankroll: saved.bankroll,
      stats: saved.stats,
      settings: {
        ...defaultSettings(),
        ...saved.settings,
        dealer: asDealer(saved.settings?.dealer),
      },
      lastHumanChips: saved.lastHumanChips ?? [],
    });
  },

  patch: (partial) => set(partial),

  setSpoken: (spoken) => set({ spoken }),

  addChip: (value) => {
    const s = get();
    if (s.phase !== "betting") return;
    const seat = s.seats[HUMAN_SEAT];
    if (!seat) return;
    const bet = sumChips(seat.pendingChips);
    if (seat.bankroll < value || bet + value > MAX_BET) return;
    const seats = s.seats.slice();
    seats[HUMAN_SEAT] = {
      ...seat,
      bankroll: seat.bankroll - value,
      pendingChips: [...seat.pendingChips, value],
    };
    set({ seats });
    sfxChip();
  },

  removeChip: () => {
    const s = get();
    if (s.phase !== "betting") return;
    const seat = s.seats[HUMAN_SEAT];
    if (!seat || seat.pendingChips.length === 0) return;
    const chips = seat.pendingChips.slice();
    const value = chips.pop()!;
    const seats = s.seats.slice();
    seats[HUMAN_SEAT] = { ...seat, pendingChips: chips, bankroll: seat.bankroll + value };
    set({ seats });
    sfxChip();
  },

  clearBet: () => {
    const s = get();
    if (s.phase !== "betting") return;
    const seat = s.seats[HUMAN_SEAT];
    if (!seat) return;
    const seats = s.seats.slice();
    seats[HUMAN_SEAT] = {
      ...seat,
      bankroll: seat.bankroll + sumChips(seat.pendingChips),
      pendingChips: [],
    };
    set({ seats });
  },

  repeatBet: () => {
    const s = get();
    if (s.phase !== "betting" || s.lastHumanChips.length === 0) return;
    get().clearBet();
    const seat = get().seats[HUMAN_SEAT];
    if (!seat) return;
    const chips = s.lastHumanChips;
    const total = sumChips(chips);
    if (total < MIN_BET || total > MAX_BET || seat.bankroll < total) return;
    const seats = get().seats.slice();
    seats[HUMAN_SEAT] = {
      ...seat,
      bankroll: seat.bankroll - total,
      pendingChips: chips.slice(),
    };
    set({ seats });
    sfxChip();
  },

  doubleBet: () => {
    const s = get();
    if (s.phase !== "betting") return;
    const seat = s.seats[HUMAN_SEAT];
    if (!seat || seat.pendingChips.length === 0) return;
    const total = sumChips(seat.pendingChips);
    if (seat.bankroll < total || total * 2 > MAX_BET) return;
    const seats = s.seats.slice();
    seats[HUMAN_SEAT] = {
      ...seat,
      bankroll: seat.bankroll - total,
      pendingChips: [...seat.pendingChips, ...seat.pendingChips],
    };
    set({ seats });
    sfxChip();
  },

  rebuy: () => {
    const s = get();
    if (s.phase !== "betting") return;
    const seat = s.seats[HUMAN_SEAT];
    if (!seat) return;
    const live = seat.bankroll + sumChips(seat.pendingChips);
    if (live >= MIN_BET) return;
    const seats = s.seats.slice();
    const bankroll = seat.bankroll + REBUY;
    seats[HUMAN_SEAT] = { ...seat, bankroll };
    const stats = { ...s.stats, net: s.stats.net - REBUY };
    const next = { seats, stats, bankroll: bankroll + sumChips(seat.pendingChips) };
    set(next);
    persist({ ...s, ...next });
  },

  toggle: (key) => {
    const s = get();
    const settings = { ...s.settings, [key]: !s.settings[key] };
    set({ settings });
    persist({ ...s, settings });
  },

  chooseDealer: (id) => {
    const s = get();
    const dealer = asDealer(id);
    const settings = { ...s.settings, dealer };
    set({ settings, dealerId: dealer });
    persist({ ...s, settings });
  },

  placeAiBets: () => {
    const s = get();
    const tc = trueCount(s.running, s.shoe.length || 52);
    const seats = s.seats.map((seat) => {
      if (!seat || seat.personaId === null) {
        if (!seat) return seat;
        return { ...seat, hands: [], roundsSat: seat.roundsSat + 1 };
      }
      const bet = chooseBet(seat, tc);
      return {
        ...seat,
        hands: [],
        roundsSat: seat.roundsSat + 1,
        pendingChips: bet > 0 ? breakIntoChips(bet, 6) : [],
        bankroll: seat.bankroll - bet,
        lastBet: bet > 0 ? bet : seat.lastBet,
      };
    });
    set({ seats });
  },
}));

export function saveSettled(bankroll: number): void {
  useGame.setState({ bankroll });
  persist({ ...useGame.getState(), bankroll });
}

export function availablePersonas(seats: (Seat | null)[]): Persona[] {
  const taken = new Set(seats.map((seat) => seat?.personaId).filter(Boolean));
  return PERSONAS.filter((p) => !taken.has(p.id));
}

export function buyIn(): number {
  const units = 40 + Math.floor(Math.random() * 360);
  return units * MIN_BET;
}

export function newShoeState(): { shoe: ReturnType<typeof makeShoe>; cutAt: number; running: number } {
  return { shoe: makeShoe(), cutAt: cutCard(), running: 0 };
}

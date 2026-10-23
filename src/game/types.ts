import type { Style } from "./ai";
import type { Card, Outcome } from "./rules";

export type Hand = {
  cards: Card[];
  bet: number;
  chips: number[];
  insurance: number;
  doubled: boolean;
  surrendered: boolean;
  stood: boolean;
  fromSplit: boolean;
  aceSplit: boolean;
  outcome?: Outcome;
  profit?: number;
};

export type Seat = {
  id: string;
  personaId: string | null;
  name: string;
  style: Style | "you";
  label: string;
  avatar: string;
  voiceIn: string;
  voiceOut: string;
  bankroll: number;
  hands: Hand[];
  pendingChips: number[];
  roundsSat: number;
  streak: number;
  lastBet: number;
  lastResult?: "win" | "lose" | "push";
  patience: number;
  leaveBias: number;
  motion: "in" | "out" | null;
};

export type Phase = "intro" | "betting" | "dealing" | "insurance" | "acting" | "dealer" | "payout";

export type Settings = {
  hitSoft17: boolean;
  coach: boolean;
  showCount: boolean;
  sound: boolean;
  dealer?: "sam" | "margot" | "hal";
};

export type Stats = {
  played: number;
  won: number;
  lost: number;
  pushed: number;
  net: number;
};

export type SaveData = {
  version: 1;
  bankroll: number;
  stats: Stats;
  settings: Settings;
  lastHumanChips: number[];
};

export type Bubble = {
  id: number;
  anchor: number | "dealer";
  name: string;
  text: string;
};

export type Splash = {
  id: number;
  title: string;
};

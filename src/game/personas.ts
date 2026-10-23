import type { Style } from "./ai";

export type Persona = {
  id: string;
  name: string;
  style: Style;
  label: string;
  avatar: string;
  voiceIn: string;
  voiceOut: string;
  leaveBias: number;
  patience: number;
};

export const PERSONAS: Persona[] = [
  {
    id: "mira",
    name: "Mira Vale",
    style: "conservative",
    label: "Rock",
    avatar: "/avatars/mira.jpg",
    voiceIn: "mira-in",
    voiceOut: "mira-out",
    leaveBias: 0.05,
    patience: 16,
  },
  {
    id: "dex",
    name: "Dex Harper",
    style: "aggressive",
    label: "Press",
    avatar: "/avatars/dex.jpg",
    voiceIn: "dex-in",
    voiceOut: "dex-out",
    leaveBias: 0.15,
    patience: 7,
  },
  {
    id: "june",
    name: "June Okada",
    style: "counter",
    label: "Count",
    avatar: "/avatars/june.jpg",
    voiceIn: "june-in",
    voiceOut: "june-out",
    leaveBias: 0.06,
    patience: 18,
  },
  {
    id: "colt",
    name: "Colt Brennan",
    style: "wild",
    label: "Wild",
    avatar: "/avatars/colt.jpg",
    voiceIn: "colt-in",
    voiceOut: "colt-out",
    leaveBias: 0.22,
    patience: 5,
  },
  {
    id: "nia",
    name: "Nia Solano",
    style: "basic",
    label: "Basic",
    avatar: "/avatars/nia.jpg",
    voiceIn: "nia-in",
    voiceOut: "nia-out",
    leaveBias: 0.04,
    patience: 20,
  },
  {
    id: "rook",
    name: "Rook Ellis",
    style: "martingale",
    label: "Chase",
    avatar: "/avatars/rook.jpg",
    voiceIn: "rook-in",
    voiceOut: "rook-out",
    leaveBias: 0.12,
    patience: 9,
  },
];

export function personaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

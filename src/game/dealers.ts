export type DealerId = "sam" | "margot" | "hal";

export type Dealer = {
  id: DealerId;
  name: string;
  short: string;
  avatar: string;
  /** Folder under /voices. Empty uses the original Ara takes at the voices root. */
  voice: "" | "hal" | "sam";
  credit: string;
};

export const DEALER_ORDER: DealerId[] = ["sam", "margot", "hal"];

export const DEALERS: Record<DealerId, Dealer> = {
  sam: {
    id: "sam",
    name: "Sam",
    short: "Sam",
    avatar: "/avatars/sam.jpg",
    voice: "sam",
    credit: "Your voice",
  },
  margot: {
    id: "margot",
    name: "Margot Voss",
    short: "Margot",
    avatar: "/avatars/margot.jpg",
    voice: "",
    credit: "Ara",
  },
  hal: {
    id: "hal",
    name: "Hal Crowe",
    short: "Hal",
    avatar: "/avatars/hal.jpg",
    voice: "hal",
    credit: "Sal",
  },
};

export function asDealer(id: string | null | undefined): DealerId {
  if (id === "sam" || id === "margot" || id === "hal") return id;
  return "sam";
}
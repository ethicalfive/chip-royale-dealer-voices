import type { CSSProperties } from "react";
import { rankLabel, suitName, type Card, type Suit } from "@/game/rules";

export function SuitMark({ suit }: { suit: Suit }) {
  if (suit === "h") {
    return (
      <svg viewBox="0 0 20 20" className="suit" aria-hidden>
        <path d="M10 17.2S3.2 12.6 3.2 8.4C3.2 6 5 4.6 6.8 4.6c1.1 0 2.1.6 3.2 1.8 1.1-1.2 2.1-1.8 3.2-1.8 1.8 0 3.6 1.4 3.6 3.8 0 4.2-6.8 8.8-6.8 8.8z" />
      </svg>
    );
  }
  if (suit === "d") {
    return (
      <svg viewBox="0 0 20 20" className="suit" aria-hidden>
        <path d="M10 2.2 16.8 10 10 17.8 3.2 10 10 2.2z" />
      </svg>
    );
  }
  if (suit === "c") {
    return (
      <svg viewBox="0 0 20 20" className="suit" aria-hidden>
        <path d="M10 3.2a3 3 0 0 1 1.5 5.6A3.1 3.1 0 1 1 7.2 12a3.1 3.1 0 1 1 1.3-3.2A3 3 0 0 1 10 3.2zM8.6 16.6h2.8l-.6-3.1h-1.6l-.6 3.1z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="suit" aria-hidden>
      <path d="M10 2.4c2.2 2.6 4.6 4.4 4.6 7.2a4.6 4.6 0 0 1-7.2 3.8c.2.7.5 1.6.8 2.4H7.2c.5-1.3.7-2.4.6-3.6A4.6 4.6 0 0 1 5.4 9.6c0-2.8 2.4-4.6 4.6-7.2z" />
    </svg>
  );
}

export function PlayingCard({
  card,
  hidden = false,
  slow = false,
  order = 0,
}: {
  card?: Card;
  hidden?: boolean;
  slow?: boolean;
  order?: number;
}) {
  const stack = { zIndex: order + 1 };
  if (hidden || !card) {
    return <div className={slow ? "card is-back is-slow" : "card is-back"} style={stack} aria-label="Face down card" />;
  }
  const red = card.suit === "h" || card.suit === "d";
  const label = rankLabel(card.rank);
  return (
    <div
      className={`card ${red ? "is-red" : "is-black"}${slow ? " is-slow" : ""}`}
      style={stack}
      aria-label={`${label} of ${suitName(card.suit)}`}
    >
      <span className="corner">
        <b>{label}</b>
        <SuitMark suit={card.suit} />
      </span>
      <span className="pips">
        {card.rank >= 11 || card.rank === 1 ? <strong>{label}</strong> : null}
        <SuitMark suit={card.suit} />
      </span>
      <span className="corner is-br">
        <b>{label}</b>
        <SuitMark suit={card.suit} />
      </span>
    </div>
  );
}

export function chipSrc(value: number): string {
  if (value >= 100_000) return "/chips/chip-1000.png";
  if (value >= 50_000) return "/chips/chip-500.png";
  if (value >= 10_000) return "/chips/chip-100.png";
  if (value >= 2_500) return "/chips/chip-25.png";
  return "/chips/chip-5.png";
}

export function ChipPiles({ chips }: { chips: number[] }) {
  const columns: number[][] = [];
  const counts = new Map<number, number>();
  for (const value of chips) counts.set(value, (counts.get(value) ?? 0) + 1);
  const denominations = [...counts.keys()].sort((a, b) => a - b);
  for (const value of denominations) {
    let left = counts.get(value) ?? 0;
    while (left > 0) {
      const take = Math.min(8, left);
      columns.push(Array.from({ length: take }, () => value));
      left -= take;
    }
  }
  if (columns.length === 0) return null;
  return (
    <div className="piles">
      {columns.map((column, columnIndex) => (
        <span key={`${column[0]}-${columnIndex}`} className="pile">
          {column.map((value, index) => (
            <img
              key={`${value}-${index}`}
              src={chipSrc(value)}
              alt=""
              style={{ "--i": index, zIndex: index + 1 } as CSSProperties}
            />
          ))}
        </span>
      ))}
    </div>
  );
}

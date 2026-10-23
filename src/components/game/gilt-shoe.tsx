import { useEffect, useState } from "react";
import { BookOpen, Volume2, VolumeX } from "lucide-react";
import { basicStrategy, type Advice } from "@/game/ai";
import { setAudioMuted, setDealerVoice, unlockAudio } from "@/game/audio";
import { DEALERS, DEALER_ORDER, asDealer, type DealerId } from "@/game/dealers";
import { canDouble, canSplit, canSurrender, deal, humanCan, playerDecide, sitDown } from "@/game/director";
import { CHIP_VALUES, handTotal, HUMAN_SEAT, isNatural, MAX_BET, MIN_BET, money, sumChips, trueCount } from "@/game/rules";
import { useGame } from "@/game/store";
import type { Hand } from "@/game/types";
import { ChipPiles, chipSrc, PlayingCard } from "./bits";

const ADVICE_NAME: Record<Advice, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
};

function signed(cents: number): string {
  if (cents > 0) return `+${money(cents)}`;
  return money(cents);
}

export function GiltShoe() {
  const phase = useGame((s) => s.phase);
  const splash = useGame((s) => s.splash);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    useGame.getState().hydrate();
    const id = asDealer(useGame.getState().settings.dealer);
    useGame.setState({ dealerId: id });
    setDealerVoice(DEALERS[id].voice);
    setAudioMuted(!useGame.getState().settings.sound);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        unlockAudio();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const state = useGame.getState();
      const key = event.key.toLowerCase();
      if (state.phase === "intro" && (key === "enter" || key === " ")) {
        event.preventDefault();
        sitDown();
        return;
      }
      if (state.phase === "betting") {
        if (key === "enter") {
          event.preventDefault();
          deal();
        } else if (key === "backspace") {
          event.preventDefault();
          state.removeChip();
        } else if (key === "c") state.clearBet();
        else if (key === "r") state.repeatBet();
        else if ("12345".includes(event.key)) {
          const value = CHIP_VALUES[Number(event.key) - 1];
          if (value) {
            setChipChoice(value);
            state.addChip(value);
          }
        }
      } else if (state.phase === "insurance") {
        if (key === "y" || key === "enter") playerDecide("INS");
        if (key === "n") playerDecide("NO");
      } else if (state.phase === "acting" && state.acting?.seat === HUMAN_SEAT) {
        if (key === "h") playerDecide("H");
        if (key === "s") playerDecide("S");
        if (key === "d") playerDecide("D");
        if (key === "p") playerDecide("P");
        if (key === "u") playerDecide("R");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="salon">
      <TopBar onRules={() => setRulesOpen(true)} />
      <div className="stage">
        <div className="table-lock">
          <img className="board" src="/board/table.jpg" alt="" />
          <div className="rack rack-left" aria-hidden>
            <ChipPiles chips={[100000, 100000, 50000, 50000, 10000]} />
          </div>
          <div className="rack rack-right" aria-hidden>
            <ChipPiles chips={[10000, 10000, 10000, 2500, 2500, 500]} />
          </div>
          <div className="play">
            <Dealer />
            {Array.from({ length: 5 }, (_, index) => (
              <SeatView key={index} index={index} />
            ))}
          </div>
          {splash ? <WinSplash title={splash.title} /> : null}
          {phase === "intro" ? <Intro /> : null}
        </div>
      </div>
      {phase === "intro" ? (
        <footer className="dock">
          <p className="banner">The felt is dressed. Sit when you are ready.</p>
        </footer>
      ) : (
        <Dock />
      )}
      {rulesOpen ? <Rules onClose={() => setRulesOpen(false)} /> : null}
    </div>
  );
}

function TopBar({ onRules }: { onRules: () => void }) {
  const phase = useGame((s) => s.phase);
  const spoken = useGame((s) => s.spoken);
  const sound = useGame((s) => s.settings.sound);
  const showCount = useGame((s) => s.settings.showCount);
  const running = useGame((s) => s.running);
  const shoe = useGame((s) => s.shoe.length);
  const stats = useGame((s) => s.stats);
  const seats = useGame((s) => s.seats);
  const human = seats[HUMAN_SEAT];
  const dealerId = useGame((s) => s.dealerId);
  const dealer = dealerId ? DEALERS[dealerId] : null;
  const bank = human ? human.bankroll : useGame.getState().bankroll;
  const tc = trueCount(running, shoe || 52);

  return (
    <header className="topbar">
      <div className="brand">
        <strong>Gilt Shoe</strong>
        <span>Six-deck salon</span>
      </div>
      <p className="speech" aria-live="polite">
        {phase === "intro" ? "Take a seat." : spoken || (dealer ? `${dealer.short} has the shoe.` : "The shoe is closed.")}
      </p>
      <div className="meta">
        {showCount && phase !== "intro" ? (
          <span className="count">
            RC {running > 0 ? `+${running}` : running} · TC {tc >= 0 ? "+" : ""}
            {tc.toFixed(1)}
          </span>
        ) : null}
        {phase !== "intro" ? (
          <>
            <span className="bank">{money(bank)}</span>
            <span className="net">{signed(stats.net)}</span>
          </>
        ) : null}
        <button
          type="button"
          className="icon-btn"
          aria-label={sound ? "Mute table" : "Unmute table"}
          onClick={() => {
            useGame.getState().toggle("sound");
            setAudioMuted(!useGame.getState().settings.sound);
          }}
        >
          {sound ? <Volume2 /> : <VolumeX />}
        </button>
        <button type="button" className="icon-btn" aria-label="House rules" onClick={onRules}>
          <BookOpen />
        </button>
      </div>
    </header>
  );
}

function pickDealer(id: DealerId): void {
  useGame.getState().chooseDealer(id);
  setDealerVoice(DEALERS[id].voice);
}

function DealerPick() {
  const chosen = useGame((s) => asDealer(s.dealerId ?? s.settings.dealer));
  return (
    <div className="dealer-pick" role="radiogroup" aria-label="Dealer">
      {DEALER_ORDER.map((id) => {
        const dealer = DEALERS[id];
        const on = chosen === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            className={on ? "dealer-choice is-on" : "dealer-choice"}
            onClick={() => pickDealer(id)}
          >
            <img src={dealer.avatar} alt="" />
            <strong>{dealer.short}</strong>
          </button>
        );
      })}
    </div>
  );
}

function Intro() {
  const dealerId = useGame((s) => s.dealerId);
  const dealer = dealerId ? DEALERS[dealerId] : null;
  return (
    <div className="intro">
      <div className="intro-card">
        <p className="eyebrow">Private table</p>
        <h1>Gilt Shoe</h1>
        <p className="lede">
          {dealer
            ? `${dealer.name} has the shoe. Six decks, a slow count of every card, and regulars who talk when the hand lands.`
            : "Six decks on a gilt rail. Pick who has the shoe."}
        </p>
        <DealerPick />
        <button type="button" className="sit" onClick={() => sitDown()}>
          Sit down
        </button>
        <p className="fine">A tap starts the salon, the music, and the dealer’s voice.</p>
      </div>
    </div>
  );
}

function Bubble({ anchor }: { anchor: number | "dealer" }) {
  const bubbles = useGame((s) => s.bubbles);
  const bubble = bubbles.find((item) => item.anchor === anchor);
  if (!bubble) return null;
  return (
    <p className="bubble" key={bubble.id}>
      <span>{bubble.name}</span>
      {bubble.text}
    </p>
  );
}

function WinSplash({ title }: { title: string }) {
  return (
    <div className="win-splash" aria-hidden>
      <img src="/board/win-burst.png" alt="" />
      <strong>{title}</strong>
    </div>
  );
}

function Dealer() {
  const cards = useGame((s) => s.dealerCards);
  const holeHidden = useGame((s) => s.holeHidden);
  const note = useGame((s) => s.note);
  const shoe = useGame((s) => s.shoe.length);
  const showCount = useGame((s) => s.settings.showCount);
  const phase = useGame((s) => s.phase);
  const dealerId = useGame((s) => s.dealerId);
  const dealer = dealerId ? DEALERS[dealerId] : DEALERS.sam;
  const shown = holeHidden ? cards.slice(0, 1) : cards;
  const total = shown.length ? handTotal(shown) : null;
  const thick = 10 + Math.round((Math.max(shoe, 40) / 312) * 34);

  return (
    <div className="dealer">
      <Bubble anchor="dealer" />
      <img src={dealer.avatar} alt="" className="portrait" />
      <div className="dealer-copy">
        <strong>{dealer.name}</strong>
        <span>Dealer</span>
        <em>{note}</em>
      </div>
      <div className="dealer-cards">
        {cards.map((card, index) => (
          <PlayingCard key={holeHidden && index === 1 ? "hole" : card.id} card={card} hidden={holeHidden && index === 1} slow order={index} />
        ))}
        {total ? (
          <span className={total.total > 21 ? "tot is-bust" : total.total === 21 ? "tot is-gold" : "tot"}>
            {holeHidden ? "up " : ""}
            {total.total}
          </span>
        ) : phase !== "intro" ? (
          <span className="tot is-quiet">Shoe</span>
        ) : null}
      </div>
      <div className="shoe" aria-hidden>
        <i style={{ height: thick }} />
        {showCount ? <span>{shoe}</span> : <span>Shoe</span>}
      </div>
    </div>
  );
}

function SeatView({ index }: { index: number }) {
  const seat = useGame((s) => s.seats[index]);
  const phase = useGame((s) => s.phase);
  const acting = useGame((s) => s.acting);
  const shake = useGame((s) => s.shake);
  if (!seat) {
    return (
      <div className="seat is-empty" data-seat={index}>
        <span className="open">Open</span>
      </div>
    );
  }
  const you = seat.personaId === null;
  const inHand = phase !== "betting" && phase !== "intro";
  const chips = inHand && seat.hands.some((h) => h.chips.length || h.bet > 0)
    ? seat.hands.flatMap((h) => h.chips)
    : seat.pendingChips;
  const bet = inHand ? seat.hands.reduce((n, h) => n + h.bet, 0) : sumChips(seat.pendingChips);
  const turn = acting?.seat === index;
  return (
    <div
      className={`seat ${you ? "is-you" : ""} ${turn ? "is-turn" : ""} ${seat.motion === "in" ? "is-in" : ""} ${seat.motion === "out" ? "is-out" : ""} ${seat.hands.length > 1 ? "is-split" : ""}`}
      data-seat={index}
    >
      <Bubble anchor={index} />
      <div className="who">
        {seat.avatar ? <img src={seat.avatar} alt="" /> : <span className="you-mark" aria-hidden="true" />}
        <div>
          <strong>{seat.name}</strong>
          <span>{you ? money(seat.bankroll) : `${seat.label} · ${money(seat.bankroll)}`}</span>
        </div>
      </div>
      <div className="hands">
        {seat.hands.map((hand, hi) => (
          <HandView key={`${seat.id}-${hi}`} hand={hand} live={acting?.seat === index && acting.hand === hi} shaking={you && shake} />
        ))}
      </div>
      {you && phase === "betting" ? (
        <button type="button" className="spot" onClick={() => addSelected()} aria-label="Add selected chip to your bet">
          <ChipPiles chips={chips} />
          <em>{bet > 0 ? money(bet) : "Bet"}</em>
        </button>
      ) : (
        <div className="spot is-static">
          {seat.hands.length > 1 ? (
            seat.hands.map((hand, hi) => <ChipPiles key={hi} chips={hand.chips} />)
          ) : (
            <ChipPiles chips={chips} />
          )}
          <em>{bet > 0 ? money(bet) : ""}</em>
          {seat.hands.some((h) => h.insurance > 0) ? <b className="ins">Ins</b> : null}
        </div>
      )}
    </div>
  );
}

function addSelected(): void {
  const value = selectedChipValue();
  useGame.getState().addChip(value);
}

let chipChoice = 2_500;
const listeners = new Set<(value: number) => void>();

function selectedChipValue(): number {
  return chipChoice;
}

function setChipChoice(value: number): void {
  chipChoice = value;
  listeners.forEach((fn) => fn(value));
}

function HandView({ hand, live, shaking }: { hand: Hand; live: boolean; shaking?: boolean }) {
  if (hand.cards.length === 0) return null;
  const total = handTotal(hand.cards);
  const bust = total.total > 21;
  return (
    <div className={`${live ? "hand is-live" : "hand"}${shaking && bust ? " is-shake" : ""}`}>
      <div className="cards">
        {hand.cards.map((card, index) => (
          <PlayingCard key={card.id} card={card} order={index} />
        ))}
      </div>
      <span className={bust ? "tot is-bust" : total.total === 21 ? "tot is-gold" : "tot"}>
        {total.soft && total.total < 21 ? "soft " : ""}
        {total.total}
      </span>
      {hand.outcome ? (
        <span className={`result is-${hand.outcome}`}>
          {hand.outcome === "blackjack" ? "Blackjack" : hand.outcome}
          {hand.profit !== undefined ? ` ${signed(hand.profit)}` : ""}
        </span>
      ) : null}
    </div>
  );
}

function Dock() {
  const phase = useGame((s) => s.phase);
  const banner = useGame((s) => s.banner);
  const coach = useGame((s) => s.settings.coach);
  const seats = useGame((s) => s.seats);
  const acting = useGame((s) => s.acting);
  const dealerCards = useGame((s) => s.dealerCards);
  const hitSoft17 = useGame((s) => s.settings.hitSoft17);
  const [chip, setChip] = useState(chipChoice);
  const human = seats[HUMAN_SEAT];
  const bet = sumChips(human?.pendingChips ?? []);
  const broke = !!human && human.bankroll + bet < MIN_BET;

  useEffect(() => {
    const fn = (value: number) => setChip(value);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  let advice: Advice | null = null;
  if (coach && phase === "acting" && acting?.seat === HUMAN_SEAT && dealerCards[0] && human) {
    const hand = human.hands[acting.hand];
    if (hand && hand.cards.length >= 2) {
      advice = basicStrategy(hand.cards, dealerCards[0], {
        canDouble: canDouble(human, hand),
        canSplit: canSplit(human, hand),
        canSurrender: canSurrender(hand),
        hitSoft17,
      });
    }
  }

  if (phase === "insurance") {
    const hand = human?.hands[0];
    const natural = !!hand && isNatural(hand.cards);
    const premium = Math.floor((hand?.bet ?? 0) / 2);
    const canIns = !!human && premium > 0 && human.bankroll >= premium;
    return (
      <footer className="dock">
        <p className="banner">{natural ? "Even money guarantees 1 to 1." : `Insurance is ${money(premium)} and pays 2 to 1.`}</p>
        <div className="actions">
          <button type="button" className="act is-primary" disabled={!canIns} onClick={() => playerDecide(natural ? "EVEN" : "INS")}>
            {natural ? "Even money" : "Take insurance"}
          </button>
          <button type="button" className="act" onClick={() => playerDecide("NO")}>
            {natural ? "Play it out" : "No insurance"}
          </button>
        </div>
      </footer>
    );
  }

  if (phase === "acting" && acting?.seat === HUMAN_SEAT) {
    return (
      <footer className="dock">
        <p className="banner">{advice ? `Basic strategy says ${ADVICE_NAME[advice]}.` : banner}</p>
        <div className="actions">
          <Act label="Hit" advice={advice} code="H" />
          <Act label="Stand" advice={advice} code="S" />
          <Act label="Double" advice={advice} code="D" />
          <Act label="Split" advice={advice} code="P" />
          <Act label="Surrender" advice={advice} code="R" />
        </div>
      </footer>
    );
  }

  if (phase === "betting") {
    return (
      <footer className="dock">
        <div className="tray">
          {CHIP_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              className={chip === value ? "chip-btn is-on" : "chip-btn"}
              aria-label={`Add ${money(value)} chip`}
              onClick={() => {
                setChipChoice(value);
                setChip(value);
                useGame.getState().addChip(value);
              }}
              disabled={!human || human.bankroll < value || bet + value > MAX_BET}
            >
              <img src={chipSrc(value)} alt="" />
            </button>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="act" onClick={() => useGame.getState().removeChip()} disabled={bet <= 0}>
            Pull
          </button>
          <button type="button" className="act" onClick={() => useGame.getState().clearBet()} disabled={bet <= 0}>
            Clear
          </button>
          <button type="button" className="act" onClick={() => useGame.getState().repeatBet()}>
            Repeat
          </button>
          <button type="button" className="act" onClick={() => useGame.getState().doubleBet()} disabled={bet <= 0}>
            2×
          </button>
          {broke ? (
            <button type="button" className="act is-primary" onClick={() => useGame.getState().rebuy()}>
              Marker $2,000
            </button>
          ) : (
            <button type="button" className="act is-primary" onClick={() => deal()} disabled={bet < MIN_BET}>
              Deal
            </button>
          )}
        </div>
      </footer>
    );
  }

  return (
    <footer className="dock">
      <p className="banner">{banner}</p>
    </footer>
  );
}

function Act({ label, code, advice }: { label: string; code: Advice; advice: Advice | null }) {
  const kind = code === "H" ? "hit" : code === "S" ? "stand" : code === "D" ? "double" : code === "P" ? "split" : "surrender";
  const enabled = humanCan(kind);
  return (
    <button
      type="button"
      className={advice === code ? "act is-advised" : "act"}
      disabled={!enabled}
      onClick={() => playerDecide(code)}
    >
      {label}
    </button>
  );
}

function Rules({ onClose }: { onClose: () => void }) {
  const settings = useGame((s) => s.settings);
  return (
    <dialog className="rules" open onClose={onClose} aria-labelledby="rules-title">
      <form method="dialog">
        <header>
          <h2 id="rules-title">House rules</h2>
          <button type="submit" onClick={onClose}>
            Close
          </button>
        </header>
        <ul>
          <li>Six decks. The shoe is cut with about a deck and a quarter left, then shuffled fresh.</li>
          <li>Blackjack pays 3 to 2. A twenty-one after a split pays 1 to 1.</li>
          <li>Dealer stands on soft 17 unless you switch that below. Double any first two cards, including after a split.</li>
          <li>Split up to four hands. Aces split once and take a single card. Late surrender is open on your first decision.</li>
          <li>Insurance is half your bet and pays 2 to 1. Against an ace, a blackjack can take even money.</li>
          <li>Limits are $5 to $1,000. You buy in for $2,000. A marker appears if the rail goes broke.</li>
        </ul>
        <div className="toggles">
          <p className="pick-label">Dealer</p>
          <DealerPick />
          <label>
            <input type="checkbox" checked={settings.sound} onChange={() => {
              useGame.getState().toggle("sound");
              setAudioMuted(!useGame.getState().settings.sound);
            }} />
            Dealer and table sound
          </label>
          <label>
            <input type="checkbox" checked={settings.coach} onChange={() => useGame.getState().toggle("coach")} />
            Basic-strategy coach
          </label>
          <label>
            <input type="checkbox" checked={settings.showCount} onChange={() => useGame.getState().toggle("showCount")} />
            Hi-Lo count
          </label>
          <label>
            <input type="checkbox" checked={settings.hitSoft17} onChange={() => useGame.getState().toggle("hitSoft17")} />
            Dealer hits soft 17
          </label>
        </div>
        <p>
          Sam has the shoe unless you pick someone else. Margot Voss and Hal Crowe are still at the table.
          Whoever is dealing calls every new total, with a warmer line for a win and a colder one when the house takes it.
          The regulars — Mira, Dex, June, Colt, Nia, and Rook — talk for themselves. A speech bubble shows who is speaking.
        </p>
        <p className="fine">Keys: 1–5 place a chip, Enter deals, Backspace pulls a chip, C clears, R repeats. H S D P U play the hand.</p>
      </form>
    </dialog>
  );
}

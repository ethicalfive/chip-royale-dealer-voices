const CAPTIONS: Record<string, string> = {
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
  soft: "Soft.",
  n2: "Two.",
  n3: "Three.",
  n4: "Four.",
  n5: "Five.",
  n6: "Six.",
  n7: "Seven.",
  n8: "Eight.",
  n9: "Nine.",
  n10: "Ten.",
  n11: "Eleven.",
  n12: "Twelve.",
  n13: "Thirteen.",
  n14: "Fourteen.",
  n15: "Fifteen.",
  n16: "Sixteen.",
  n17: "Seventeen.",
  n18: "Eighteen.",
  n19: "Nineteen.",
  n20: "Twenty.",
  "mira-in": "I'll take a seat.",
  "mira-out": "Cashing out.",
  "dex-in": "Deal me in.",
  "dex-out": "I'm out.",
  "june-in": "The count looks fine.",
  "june-out": "This shoe is cold.",
  "colt-in": "One more round.",
  "colt-out": "That's enough for me.",
  "nia-in": "Good evening.",
  "nia-out": "Good night.",
  "rook-in": "I'm in.",
  "rook-out": "Leaving.",
  sorry: "Sorry.",
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
  throat: "Ahem.",
  "mira-win": "Lovely.",
  "mira-lose": "Unfortunate.",
  "dex-win": "That's what I'm talking about.",
  "dex-lose": "Agh, bust.",
  "june-win": "As expected.",
  "june-lose": "Cold card.",
  "colt-win": "Ha! Pay me.",
  "colt-lose": "Ridiculous.",
  "nia-win": "Thank you.",
  "nia-lose": "Oh well.",
  "rook-win": "I'll press it.",
  "rook-lose": "I'll get it back.",
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let voiceBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
type SpeechItem = {
  key: string;
  base: string;
  onstart?: () => void;
  resolve: () => void;
};
const queue: SpeechItem[] = [];
let onSpeak: ((key: string) => void) | null = null;
let pumping = false;

export function onVoice(fn: (key: string) => void): void {
  onSpeak = fn;
}
let wantMute = false;
let dealerPrefix = "";
let noise: AudioBuffer | null = null;

const SHARED_VOICE = new Set([
  "mira-in",
  "mira-out",
  "mira-win",
  "mira-lose",
  "dex-in",
  "dex-out",
  "dex-win",
  "dex-lose",
  "june-in",
  "june-out",
  "june-win",
  "june-lose",
  "colt-in",
  "colt-out",
  "colt-win",
  "colt-lose",
  "nia-in",
  "nia-out",
  "nia-win",
  "nia-lose",
  "rook-in",
  "rook-out",
  "rook-win",
  "rook-lose",
]);

const MUSIC_URL = "/music/cas1.mp3";
const MUSIC_LEVEL = 0.5;
const CROSSFADE = 3.4;

let musicGain: GainNode | null = null;
let musicBuf: AudioBuffer | null = null;
let musicLoading: Promise<AudioBuffer | null> | null = null;
let musicWanted = false;
let musicTimer: number | null = null;
const musicSources: AudioBufferSourceNode[] = [];

export function setDealerVoice(prefix: string): void {
  dealerPrefix = prefix;
}

function baseKey(key: string): string {
  const slash = key.lastIndexOf("/");
  return slash >= 0 ? key.slice(slash + 1) : key;
}

function resolveKey(key: string): string {
  if (SHARED_VOICE.has(key) || !dealerPrefix) return key;
  return `${dealerPrefix}/${key}`;
}

function context(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    voiceBus = ctx.createGain();
    sfxBus = ctx.createGain();
    voiceBus.gain.value = 0.92;
    sfxBus.gain.value = 0.38;
    master.gain.value = 0.95;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.02;
    limiter.release.value = 0.25;
    voiceBus.connect(master);
    sfxBus.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    if (wantMute) master.gain.value = 0;
  }
  return ctx;
}

export function captionFor(key: string): string | undefined {
  return CAPTIONS[key];
}

export function unlockAudio(): void {
  const audio = context();
  if (audio.state === "suspended") void audio.resume();
}

export function setAudioMuted(muted: boolean): void {
  wantMute = muted;
  if (!ctx || !master) {
    if (!muted && musicWanted) startTableMusic();
    return;
  }
  master.gain.setTargetAtTime(muted ? 0 : 0.95, ctx.currentTime, 0.03);
  if (!muted && musicWanted) startTableMusic();
}

export function resumeIfNeeded(): void {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function noiseBuffer(): AudioBuffer {
  const audio = context();
  if (noise) return noise;
  const length = Math.floor(audio.sampleRate * 0.08);
  const buf = audio.createBuffer(1, length, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  noise = buf;
  return buf;
}

function blip(freq: number, dur: number, gain: number, type: OscillatorType): void {
  if (!ctx || !sfxBus) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(g);
  g.connect(sfxBus);
  osc.start();
  osc.stop(ctx.currentTime + dur);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

export function sfxChip(): void {
  if (wantMute) return;
  unlockAudio();
  if (!ctx || !sfxBus) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfxBus);
  src.start();
  src.stop(ctx.currentTime + 0.07);
  blip(520 + Math.random() * 80, 0.05, 0.08, "triangle");
}

export function sfxCard(): void {
  if (wantMute) return;
  unlockAudio();
  if (!ctx || !sfxBus) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.playbackRate.value = 1.4;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfxBus);
  src.start();
}

export function sfxWin(): void {
  if (wantMute) return;
  unlockAudio();
  blip(523, 0.12, 0.1, "triangle");
  window.setTimeout(() => blip(784, 0.16, 0.1, "triangle"), 90);
}

export function sfxLose(): void {
  if (wantMute) return;
  unlockAudio();
  blip(196, 0.18, 0.08, "sine");
}

function musicTarget(): number {
  if (wantMute) return 0.0001;
  return MUSIC_LEVEL;
}

function applyMusicLevel(): void {
  if (!ctx || !musicGain) return;
  const target = musicTarget();
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
}

function padEnds(audio: AudioContext, buf: AudioBuffer): AudioBuffer {
  const head = Math.floor(audio.sampleRate * 0.18);
  const tail = Math.floor(audio.sampleRate * 0.16);
  const out = audio.createBuffer(buf.numberOfChannels, head + buf.length + tail, audio.sampleRate);
  for (let channel = 0; channel < buf.numberOfChannels; channel++) {
    out.getChannelData(channel).set(buf.getChannelData(channel), head);
  }
  return out;
}

async function fetchDecode(key: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(key);
  if (cached) return cached;
  const audio = context();
  try {
    const res = await fetch(`/voices/${key}.mp3?v=9`);
    if (!res.ok) return null;
    const copy = (await res.arrayBuffer()).slice(0);
    const decoded = await audio.decodeAudioData(copy);
    const buf = padEnds(audio, decoded);
    buffers.set(key, buf);
    return buf;
  } catch {
    return null;
  }
}

async function loadBuffer(key: string): Promise<AudioBuffer | null> {
  const hit = await fetchDecode(key);
  if (hit) return hit;
  const base = baseKey(key);
  if (base !== key) return fetchDecode(base);
  return null;
}

function playBuffer(buf: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    if (!ctx || !voiceBus) {
      resolve();
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(voiceBus);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        src.disconnect();
      } catch {
        /* already disconnected */
      }
      resolve();
    };
    const started = ctx.currentTime;
    const when = started + 0.04;
    src.start(when);
    src.onended = () => {
      const remain = buf.duration - (ctx!.currentTime - when);
      if (remain > 0.05) window.setTimeout(finish, remain * 1000);
      else finish();
    };
    window.setTimeout(finish, (buf.duration + 0.45) * 1000);
  });
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const item = queue.shift()!;
    onSpeak?.(item.base);
    item.onstart?.();
    try {
      const buf = await loadBuffer(item.key);
      if (buf) await playBuffer(buf);
      else await new Promise((resolve) => window.setTimeout(resolve, 900));
    } finally {
      item.resolve();
    }
  }
  pumping = false;
}

/** Resolves when this line has finished playing, not when it is queued. */
export function speak(key: string, onstart?: () => void): Promise<void> {
  const base = baseKey(key);
  if (!CAPTIONS[base]) return Promise.resolve();
  return new Promise((resolve) => {
    queue.push({ key: resolveKey(base), base, onstart, resolve });
    if (queue.length > 12) {
      const dropped = queue.splice(0, queue.length - 12);
      for (const item of dropped) item.resolve();
    }
    void pump();
  });
}

function stopMusicSources(): void {
  if (musicTimer !== null) {
    window.clearTimeout(musicTimer);
    musicTimer = null;
  }
  for (const src of musicSources) {
    try {
      src.onended = null;
      src.stop();
    } catch {
      /* already stopped */
    }
    try {
      src.disconnect();
    } catch {
      /* noop */
    }
  }
  musicSources.length = 0;
}

async function loadMusic(): Promise<AudioBuffer | null> {
  if (musicBuf) return musicBuf;
  if (!musicLoading) {
    musicLoading = (async () => {
      try {
        const audio = context();
        const res = await fetch(MUSIC_URL);
        if (!res.ok) return null;
        const buf = await audio.decodeAudioData((await res.arrayBuffer()).slice(0));
        musicBuf = buf;
        return buf;
      } catch {
        return null;
      }
    })();
  }
  return musicLoading;
}

function armLoop(when: number, fadeIn: boolean): void {
  if (!musicWanted || wantMute || !ctx || !musicBuf || !musicGain) return;
  const dur = musicBuf.duration;
  if (dur < 1) return;
  const fade = Math.min(CROSSFADE, dur * 0.2);
  const src = ctx.createBufferSource();
  src.buffer = musicBuf;
  const g = ctx.createGain();
  const t0 = Math.max(when, ctx.currentTime + 0.02);
  const tOut = t0 + dur - fade;
  const tEnd = t0 + dur;
  g.gain.setValueAtTime(fadeIn ? 0 : 1, t0);
  if (fadeIn) g.gain.linearRampToValueAtTime(1, t0 + fade);
  g.gain.setValueAtTime(1, tOut);
  g.gain.linearRampToValueAtTime(0, tEnd);
  src.connect(g);
  g.connect(musicGain);
  src.start(t0);
  src.stop(tEnd + 0.03);
  musicSources.push(src);
  src.onended = () => {
    const index = musicSources.indexOf(src);
    if (index >= 0) musicSources.splice(index, 1);
    try {
      g.disconnect();
    } catch {
      /* noop */
    }
  };
  const wait = Math.max(80, (tOut - ctx.currentTime - 0.15) * 1000);
  musicTimer = window.setTimeout(() => {
    musicTimer = null;
    if (musicWanted && !wantMute) armLoop(tOut, true);
  }, wait);
}

/** Casino bed at half gain, with a multi-second crossfade instead of a hard loop. */
export function startTableMusic(): void {
  musicWanted = true;
  if (wantMute) return;
  unlockAudio();
  void loadMusic().then((buf) => {
    if (!buf || !musicWanted || wantMute || !ctx) return;
    if (!musicGain) {
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(master ?? ctx.destination);
    }
    if (musicSources.length > 0) {
      applyMusicLevel();
      return;
    }
    const now = ctx.currentTime + 0.06;
    const level = Math.max(0.0001, musicTarget());
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(0.0001, now);
    musicGain.gain.exponentialRampToValueAtTime(level, now + 1.6);
    armLoop(now, false);
  });
}

export function stopTableMusic(): void {
  musicWanted = false;
  if (ctx && musicGain) {
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
  }
  window.setTimeout(() => {
    if (!musicWanted) stopMusicSources();
  }, 700);
}

export function preloadVoices(): void {
  const keys = ["welcome", "goodluck", "placebets", "nomorebets", "blackjack", "youwin", "bust", "welldone", "toobad", "congrats"];
  for (const key of keys) void loadBuffer(resolveKey(key));
}

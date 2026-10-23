// Coin toss trajectory, shared by the server (authoritative) and the client (replay). Pure + deterministic from params.
// The server picks the outcome with crypto RNG, then picks seeded toss params whose physics land on that face:
// half-turns N is chosen with the right parity, airtime T from launch speed, so coin angle at landing = N*PI exactly (flat).
(function (root) {
  const G = 9.8;
  function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // params for one coin: start face up = 'heads'; even N lands heads, odd N lands tails
  function params(seed, side) { const r = rng(seed), v0 = 3.2 + r() * 1.3, T = 2 * v0 / G; let N = 14 + Math.floor(r() * 12); if ((N % 2 === 0) !== (side === 'heads')) N++;
    return { seed: seed >>> 0, v0: +v0.toFixed(4), T: +T.toFixed(4), N, dx: +((r() - .5) * .5).toFixed(3), dz: +((r() - .5) * .3).toFixed(3), wob: +(0.08 + r() * .22).toFixed(3), prec: +(1 + r() * 3).toFixed(3), bounce: +(0.12 + r() * .1).toFixed(3) }; }
  // state at time t (seconds): height y (m), lateral x/z (m), flip angle (rad), wobble tilt (rad); after T a short damped bounce + settle
  function at(p, t) { const T = p.T; if (t <= 0) return { y: 0, x: 0, z: 0, a: 0, tilt: 0, done: false };
    if (t < T) { const k = t / T; return { y: p.v0 * t - G * t * t / 2, x: p.dx * k, z: p.dz * k, a: Math.PI * p.N * k, tilt: p.wob * Math.sin(p.prec * Math.PI * 2 * t), done: false }; }
    const s = t - T, bt = 2 * p.bounce * p.v0 * .25 / G * 4, hb = s < bt ? (p.bounce * p.v0 * s - G * s * s / 2) * .5 : 0;
    const settle = Math.exp(-s * 6); return { y: Math.max(0, hb), x: p.dx, z: p.dz, a: Math.PI * p.N + Math.sin(s * 18) * .25 * settle, tilt: p.wob * settle * Math.sin(s * 22), done: s > .9 }; }
  // face showing on top once landed (angle multiple of PI): even half-turns => heads
  const face = p => (Math.round(at(p, p.T).a / Math.PI) % 2 === 0) ? 'heads' : 'tails';
  const api = { params, at, face, rng, G };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CoinSim = api;
})(typeof self !== 'undefined' ? self : this);

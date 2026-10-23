// Chip Royale Premium Blackjack (standalone) - the ONE file to edit for assets and table settings.
// Paths are relative to index.html. A null value keeps the built-in art or synth sound.
window.BJ_CONFIG = {
  assets: {
    cardBack: 'assets/img/cardback.webp',
    felt: 'assets/img/felt-green.webp',            // legacy-skin felt (rookie/bronze)
    feltAlt: 'assets/img/felt-burgundy.webp',      // legacy-skin felt (silver and up)
    lobbyBg: 'assets/img/lobby-city.webp',
    chipImage: null,                               // one image for every bet chip button, or null for CSS chip art
    avatars: ['assets/img/avatar0.webp', 'assets/img/avatar1.webp', 'assets/img/avatar2.webp', 'assets/img/avatar3.webp',
              'assets/img/avatar4.webp', 'assets/img/avatar5.webp', 'assets/img/avatar6.webp', 'assets/img/avatar7.webp'],
    sounds: { deal: null, flip: null, chip: null, tap: null, pop: null, win: null, lose: null, bj: null, turn: null } // e.g. 'assets/sounds/win.mp3'
  },
  game: {
    playerName: 'You',
    avatar: 0,                 // index into avatars
    tier: 'rookie',            // rookie | bronze | silver | gold | platinum | diamond (sets limits, chips and Premium palette)
    startingChips: 100000,
    rebuyChips: 100000,        // free rebuy when you drop below the table minimum
    mySeat: 2,                 // 0..4
    bots: [                    // up to 4 simple bot seats; [] for solo
      { name: 'Ace Bot', avatar: 3, seat: 0 },
      { name: 'Lucky Lou', avatar: 5, seat: 4 }
    ],
    skin: 'premium',           // 'premium' or 'legacy'
    betMs: 12000, turnMs: 20000, botDelayMs: 700
  }
};

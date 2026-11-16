// ASHFALL PROTOCOL — look plan.
// A desert-industrial compound at dusk: ash-orange sky, warm dust fog, grey
// concrete and rusted steel, with two team accents (ember orange for the
// Ember Watch, slate teal for the Sable Guard) and one hazard yellow.
// Every colour in the game and the HUD comes from this file.
export const PALETTE = {
  sky: 0xa06a34,          // dusk haze at the horizon (bright, sun just set)
  skyHigh: 0x424a5e,      // upper sky, dusk blue-grey
  fog: 0x96682f,
  sun: 0xffc98a,
  ground: 0x7d7466,       // ash-covered asphalt
  groundDark: 0x655d52,
  concrete: 0x9a9284,
  concreteDark: 0x7e7668,
  steel: 0x707880,
  rust: 0x8a5a38,
  wood: 0x8a6b45,
  sandbag: 0x7a6f52,
  hazard: 0xd8a41c,
  ember: 0xe8641e,        // Ember Watch (attackers, the player's team)
  emberDark: 0x9c4212,
  sable: 0x2e8f86,        // Sable Guard (defenders)
  sableDark: 0x1d5f59,
  ink: 0xf2ede4,          // HUD text
  inkDim: 0xb9b0a0,
  panel: 0x17181c,
  danger: 0xe23b2e,
  good: 0x7dc95e,
  charge: 0xffcf3f,       // the breach charge
};

// Team metadata, shared by world dressing, bots and the HUD.
export const TEAMS = {
  ember: {
    id: 'ember',
    name: 'Ember Watch',
    short: 'EMB',
    role: 'Attack',
    color: PALETTE.ember,
    dark: PALETTE.emberDark,
  },
  sable: {
    id: 'sable',
    name: 'Sable Guard',
    short: 'SBL',
    role: 'Defend',
    color: PALETTE.sable,
    dark: PALETTE.sableDark,
  },
};

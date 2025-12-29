const I_FORM = {
  QB: { x: 0, y: -12 },
  RB: { x: 0, y: -26 },
  TE: { x: 26, y: 2 },
  WR1: { x: -60, y: -4 },
  WR2: { x: 60, y: -4 },
  WR3: { x: 20, y: -6 },
  OL1: { x: -20, y: 2 },
  OL2: { x: -10, y: 2 },
  OL3: { x: 0, y: 2 },
  OL4: { x: 10, y: 2 },
  OL5: { x: 20, y: 2 },
};

const SHOTGUN_TRIPS = {
  QB: { x: 0, y: -18 },
  RB: { x: -12, y: -30 },
  TE: { x: 32, y: 0 },
  WR1: { x: -70, y: -6 },
  WR2: { x: 70, y: -6 },
  WR3: { x: 40, y: -12 },
  OL1: { x: -20, y: 2 },
  OL2: { x: -10, y: 2 },
  OL3: { x: 0, y: 2 },
  OL4: { x: 10, y: 2 },
  OL5: { x: 20, y: 2 },
};

const ACE_TE = {
  QB: { x: 0, y: -12 },
  RB: { x: -8, y: -24 },
  TE: { x: -28, y: 2 },
  WR1: { x: -55, y: -4 },
  WR2: { x: 55, y: -4 },
  WR3: { x: 30, y: -10 },
  OL1: { x: -20, y: 2 },
  OL2: { x: -10, y: 2 },
  OL3: { x: 0, y: 2 },
  OL4: { x: 10, y: 2 },
  OL5: { x: 20, y: 2 },
};

const DEF_4_3 = [
  { role: 'DL', x: -26, y: 10 },
  { role: 'DL', x: -8, y: 10 },
  { role: 'DL', x: 8, y: 10 },
  { role: 'DL', x: 26, y: 10 },
  { role: 'LB', x: -20, y: 28 },
  { role: 'LB', x: 0, y: 28 },
  { role: 'LB', x: 20, y: 28 },
  { role: 'CB', x: -58, y: 18 },
  { role: 'CB', x: 58, y: 18 },
  { role: 'S', x: -18, y: 46 },
  { role: 'S', x: 18, y: 46 },
];

const DEF_NICKEL = [
  { role: 'DL', x: -20, y: 10 },
  { role: 'DL', x: 0, y: 10 },
  { role: 'DL', x: 20, y: 10 },
  { role: 'LB', x: -16, y: 28 },
  { role: 'LB', x: 16, y: 28 },
  { role: 'CB', x: -60, y: 20 },
  { role: 'CB', x: 60, y: 20 },
  { role: 'CB', x: -30, y: 34 },
  { role: 'S', x: -10, y: 48 },
  { role: 'S', x: 10, y: 48 },
  { role: 'S', x: 30, y: 44 },
];

const DEF_3_4 = [
  { role: 'DL', x: -20, y: 10 },
  { role: 'DL', x: 0, y: 10 },
  { role: 'DL', x: 20, y: 10 },
  { role: 'LB', x: -30, y: 26 },
  { role: 'LB', x: -10, y: 28 },
  { role: 'LB', x: 10, y: 28 },
  { role: 'LB', x: 30, y: 26 },
  { role: 'CB', x: -56, y: 18 },
  { role: 'CB', x: 56, y: 18 },
  { role: 'S', x: -18, y: 48 },
  { role: 'S', x: 18, y: 48 },
];

export const PLAYS = [
  {
    name: 'I-Form Slants',
    type: 'pass',
    offenseName: 'I-Form',
    defenseName: '4-3',
    offenseFormation: I_FORM,
    defenseFormation: DEF_4_3,
    defenseStyle: 'man',
    runOption: { available: true, lane: { x: 0, y: 1 } },
    routes: {
      WR1: [
        { x: -10, y: 16 },
        { x: -30, y: 32 },
        { x: -20, y: 56 },
      ],
      WR2: [
        { x: 10, y: 16 },
        { x: 30, y: 32 },
        { x: 20, y: 56 },
      ],
      WR3: [
        { x: 0, y: 18 },
        { x: 12, y: 34 },
      ],
      TE: [
        { x: 8, y: 12 },
        { x: 16, y: 28 },
      ],
      RB: [
        { x: 0, y: 12 },
      ],
    },
  },
  {
    name: 'Trips Flood',
    type: 'pass',
    offenseName: 'Shotgun Trips',
    defenseName: 'Nickel',
    offenseFormation: SHOTGUN_TRIPS,
    defenseFormation: DEF_NICKEL,
    defenseStyle: 'zone',
    runOption: { available: false },
    routes: {
      WR1: [
        { x: -10, y: 20 },
        { x: -10, y: 78 },
      ],
      WR2: [
        { x: 12, y: 16 },
        { x: 35, y: 40 },
      ],
      WR3: [
        { x: 10, y: 14 },
        { x: 40, y: 20 },
        { x: 55, y: 36 },
      ],
      TE: [
        { x: 0, y: 18 },
        { x: 12, y: 46 },
      ],
      RB: [
        { x: -8, y: 12 },
      ],
    },
  },
  {
    name: 'Ace Blast',
    type: 'run',
    offenseName: 'Ace TE',
    defenseName: '3-4',
    offenseFormation: ACE_TE,
    defenseFormation: DEF_3_4,
    defenseStyle: 'blitz',
    runOption: { available: true, lane: { x: 8, y: 1 } },
    routes: {
      WR1: [
        { x: 0, y: 12 },
        { x: 0, y: 34 },
      ],
      WR2: [
        { x: 0, y: 12 },
        { x: 0, y: 34 },
      ],
      WR3: [
        { x: 0, y: 10 },
        { x: 0, y: 28 },
      ],
      TE: [
        { x: 6, y: 12 },
        { x: 10, y: 30 },
      ],
    },
  },
];

export const PLAYS = [
  {
    name: 'Twin Slant',
    type: 'pass',
    routes: {
      WR1: [
        { x: -25, y: -10 },
        { x: -45, y: -35 },
        { x: -30, y: -55 },
      ],
      WR2: [
        { x: 25, y: -10 },
        { x: 45, y: -35 },
        { x: 30, y: -55 },
      ],
      TE: [
        { x: 15, y: -10 },
        { x: 10, y: -30 },
      ],
      RB: [
        { x: -8, y: -10 },
      ],
    },
  },
  {
    name: 'Trips Go',
    type: 'pass',
    routes: {
      WR1: [
        { x: -20, y: -20 },
        { x: -20, y: -70 },
      ],
      WR2: [
        { x: 20, y: -20 },
        { x: 20, y: -70 },
      ],
      TE: [
        { x: 0, y: -20 },
        { x: 15, y: -50 },
      ],
      RB: [
        { x: -12, y: -12 },
        { x: -20, y: -25 },
      ],
    },
  },
  {
    name: 'Inside Zone',
    type: 'run',
    runLane: { x: 0, y: -1 },
    routes: {
      TE: [
        { x: 12, y: -8 },
        { x: 12, y: -24 },
      ],
      WR1: [
        { x: -35, y: -5 },
        { x: -35, y: -25 },
      ],
      WR2: [
        { x: 35, y: -5 },
        { x: 35, y: -25 },
      ],
    },
  },
];

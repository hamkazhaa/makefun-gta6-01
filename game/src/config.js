// Porto Verde — shared constants: city layout, districts, landmarks,
// vehicles, radio, jobs. All positions are world units, x east, z south
// (three.js: -z is north on screen when looking from the south).

export const BLOCK = 36; // building block side
export const ROAD = 14; // road width between blocks
export const PITCH = BLOCK + ROAD; // 50, block-centre spacing
export const GRID = 9; // 9x9 blocks
export const HALF = ((GRID - 1) / 2) * PITCH; // 200, outer block centre

// Block centre for grid indices i (east), j (south), each 0..8.
export function blockCentre(i, j) {
  return { x: (i - 4) * PITCH, z: (j - 4) * PITCH };
}

// The park occupies the central block (4,4); the beach is the south strip.
export const PARK_BLOCK = { i: 4, j: 4 };
export const BEACH_Z = HALF + ROAD / 2 + 8; // sand starts here (~215)
export const OCEAN_Z = BEACH_Z + 70;

export const DISTRICTS = [
  { name: 'NORTH HILLS', test: (x, z) => z < -110 },
  { name: 'LA PLAYA', test: (x, z) => z > 175 },
  { name: 'HARBOR DISTRICT', test: (x, z) => x > 110 },
  { name: 'OLD TOWN', test: (x, z) => x < -110 },
  { name: 'DOWNTOWN', test: () => true },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d.name;
  return 'DOWNTOWN';
}

export const LANDMARKS = {
  docks: { name: 'The Docks', x: 205, z: 60 },
  warehouse7: { name: 'Warehouse 7', x: 185, z: 125 },
  motel: { name: 'Motel Sol', x: -60, z: 140 },
  safehouse: { name: 'Safehouse', x: -150, z: -150 },
  garage: { name: "Vega's Garage", x: 60, z: -160 },
  hospital: { name: 'Hospital', x: -140, z: 40 },
  plaza: { name: 'Plaza Verde', x: 0, z: -25 },
  beach: { name: 'La Playa', x: 20, z: 235 },
};

export const VEHICLES = [
  { name: 'Meridian', color: 0x3a6ea5, top: 26, accel: 14 },
  { name: 'Solstice GT', color: 0xe8641b, top: 34, accel: 20 },
  { name: 'City Cab', color: 0xe8c81b, top: 24, accel: 12 },
  { name: 'Hauler', color: 0x5a6b52, top: 20, accel: 10 },
  { name: 'Interceptor', color: 0x1b1e24, top: 32, accel: 18 },
];

export const RADIO = [
  { name: 'Brisa Bossa 88', bpm: 96, root: 220, mode: [0, 3, 5, 7, 10] },
  { name: 'Verde FM 101', bpm: 122, root: 174, mode: [0, 2, 4, 7, 9] },
  { name: 'Onda 76', bpm: 80, root: 196, mode: [0, 2, 3, 7, 8] },
];

export const JOBS = [
  {
    id: 1, name: 'THE PICKUP', pay: 500,
    steps: [
      { text: 'Meet Dre at the Docks', at: 'docks' },
      { text: 'Deliver the package to Motel Sol', at: 'motel' },
    ],
  },
  {
    id: 2, name: 'HEAT', pay: 300,
    steps: [
      { text: 'Lose the heat — reach the Safehouse', at: 'safehouse' },
    ],
  },
  {
    id: 3, name: 'THE HARBOR JOB', pay: 1000,
    steps: [
      { text: 'Clear the Red Suns from Warehouse 7', at: 'warehouse7', clear: 4 },
      { text: 'Steal the orange Solstice GT', at: 'warehouse7', steal: true },
      { text: 'Deliver the Solstice GT to Vega\'s Garage', at: 'garage', deliver: true },
    ],
  },
];

export const START_TIME = 17 + 20 / 60; // 17:20
export const SAVE_KEY = 'porto-verde-save-v1';

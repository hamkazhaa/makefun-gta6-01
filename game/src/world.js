// Porto Verde — the city: a 9x9-block grid with buildings at block centres
// (roads always clear), a central park, a container dock, and the La Playa
// beach with ocean to the south. Exports the scene group, colliders
// (axis-aligned boxes), and the meshes the main loop animates.

import * as THREE from 'three';
import { BLOCK, ROAD, PITCH, GRID, PARK_BLOCK, BEACH_Z, OCEAN_Z, LANDMARKS, blockCentre } from './config.js';
import { mulberry32, range, pick } from './random.js';

// Canvas texture with a lit-window facade, tinted per building.
function facadeTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const rng = mulberry32(base.length * 7919 + lit.length);
  for (let y = 12; y < 244; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      g.fillStyle = rng() < 0.42 ? lit : '#1c2430';
      g.fillRect(x, y, 12, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelSprite(text, color = '#ffd76a') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,22,0.72)';
  g.beginPath();
  g.roundRect(6, 14, 500, 68, 12);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = color;
  g.font = 'bold 40px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.set(22, 4.1, 1);
  return s;
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const rng = mulberry32(20261117);
  const animated = { ocean: null, beacons: [] };

  const facadeA = facadeTexture('#8a7f74', '#ffd98a');
  const facadeB = facadeTexture('#6f7d8c', '#9fd8ff');
  const facadeC = facadeTexture('#a08a6a', '#ffb36a');
  const facades = [facadeA, facadeB, facadeC];

  // Ground: one big asphalt/dirt base, then road strips on top.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 760),
    new THREE.MeshLambertMaterial({ color: 0x3d3a33 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 60);
  group.add(ground);

  // Roads: dark strips along every grid line, plus centre dashes.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x23262b });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8c95a });
  for (let k = -4; k <= 4; k++) {
    const c = k * PITCH;
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 560), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(c + PITCH / 2 - ROAD / 2 + 0, 0.02, 0);
    // vertical roads sit between block columns: centres at (i-4)*50 + 25
    vRoad.position.set(c + 25, 0.02, 0);
    group.add(vRoad);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(560, ROAD), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.02, c + 25);
    group.add(hRoad);
    for (let d = -260; d <= 260; d += 24) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 5), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(c + 25, 0.04, d);
      group.add(dash);
    }
  }

  // Buildings: one or two towers per block centre, never on the park block.
  const palette = [0x9a8f80, 0x7d8fa3, 0xb09a72, 0x8c7a90, 0x6f7f6a];
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      if (i === PARK_BLOCK.i && j === PARK_BLOCK.j) continue;
      const { x, z } = blockCentre(i, j);
      const n = 1 + Math.floor(rng() * 2);
      for (let b = 0; b < n; b++) {
        const w = range(rng, 12, 22);
        const d = range(rng, 12, 22);
        const h = range(rng, 14, 52);
        const ox = (b === 0 ? -6 : 7) + range(rng, -2, 2);
        const oz = (b === 0 ? -5 : 6) + range(rng, -2, 2);
        const mat = new THREE.MeshLambertMaterial({
          map: pick(rng, facades),
          color: pick(rng, palette),
        });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(x + ox, h / 2, z + oz);
        group.add(tower);
        // Rooftop box so silhouettes vary.
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.4, 2.5, d * 0.4),
          new THREE.MeshLambertMaterial({ color: 0x4a4a44 }),
        );
        roof.position.set(x + ox, h + 1.2, z + oz);
        group.add(roof);
        colliders.push({ minX: x + ox - w / 2, maxX: x + ox + w / 2, minZ: z + oz - d / 2, maxZ: z + oz + d / 2 });
      }
    }
  }

  // Central park: grass, paths, trees, a fountain.
  const park = blockCentre(PARK_BLOCK.i, PARK_BLOCK.j);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(BLOCK + 6, BLOCK + 6),
    new THREE.MeshLambertMaterial({ color: 0x4d7a3a }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(park.x, 0.03, park.z);
  group.add(grass);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a2e });
  for (let t = 0; t < 14; t++) {
    const tx = park.x + range(rng, -16, 16);
    const tz = park.z + range(rng, -16, 16);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 6), trunkMat);
    trunk.position.set(tx, 2, tz);
    group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 2.2, 3.4), 8, 6), leafMat);
    leaves.position.set(tx, 5.4, tz);
    group.add(leaves);
    colliders.push({ minX: tx - 0.7, maxX: tx + 0.7, minZ: tz - 0.7, maxZ: tz + 0.7 });
  }
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5.6, 1.2, 16),
    new THREE.MeshLambertMaterial({ color: 0x7fb2d9 }),
  );
  fountain.position.set(park.x, 0.6, park.z);
  group.add(fountain);
  colliders.push({ minX: park.x - 5.6, maxX: park.x + 5.6, minZ: park.z - 5.6, maxZ: park.z + 5.6 });

  // Beach: sand strip + ocean plane (animated), boardwalk edge.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, OCEAN_Z - BEACH_Z + 20),
    new THREE.MeshLambertMaterial({ color: 0xd9c28a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, BEACH_Z + (OCEAN_Z - BEACH_Z) / 2);
  group.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 220),
    new THREE.MeshLambertMaterial({ color: 0x1d6f8e, transparent: true, opacity: 0.92 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.12, OCEAN_Z + 110);
  group.add(ocean);
  animated.ocean = ocean;

  // Container docks on the east edge: stacks of coloured boxes + a crane.
  const dockCols = [0xc0392b, 0x2471a3, 0x229954, 0xd4ac0d, 0x7d3c98];
  for (let s = 0; s < 10; s++) {
    const cx = 218 + (s % 2) * 8;
    const cz = -20 + Math.floor(s / 2) * 22;
    const h = 2.6 * (1 + (s % 3));
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(7, h, 12),
      new THREE.MeshLambertMaterial({ color: pick(rng, dockCols) }),
    );
    box.position.set(cx, h / 2, cz);
    group.add(box);
    colliders.push({ minX: cx - 3.5, maxX: cx + 3.5, minZ: cz - 6, maxZ: cz + 6 });
  }
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a013 });
  const craneLeg = new THREE.Mesh(new THREE.BoxGeometry(3, 34, 3), craneMat);
  craneLeg.position.set(196, 17, 20);
  group.add(craneLeg);
  const craneArm = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 44), craneMat);
  craneArm.position.set(196, 32, 4);
  group.add(craneArm);
  colliders.push({ minX: 194, maxX: 198, minZ: 18, maxZ: 22 });

  // Street lamps along the main avenues.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xaa8833 });
  for (let k = -4; k <= 4; k++) {
    for (const z of [-175, -75, 25, 125]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 7, 6), lampMat);
      pole.position.set(k * PITCH + 25 + 6, 3.5, z);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), bulbMat);
      bulb.position.set(k * PITCH + 25 + 6, 7.2, z);
      group.add(bulb);
    }
  }

  // Landmark signs (floating labels) at each landmark.
  for (const key of Object.keys(LANDMARKS)) {
    const lm = LANDMARKS[key];
    const sign = labelSprite(lm.name);
    sign.position.set(lm.x, 13, lm.z);
    group.add(sign);
  }

  // Objective beacon: a glowing pillar the missions move around.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  beacon.position.set(LANDMARKS.docks.x, 30, LANDMARKS.docks.z);
  group.add(beacon);
  animated.beacons.push(beacon);

  return { group, colliders, animated };
}

// Push a circle (x, z, radius) out of every collider box it overlaps.
// Returns the corrected position.
export function resolveCollisions(colliders, x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r;
        else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
  }
  return { x, z };
}

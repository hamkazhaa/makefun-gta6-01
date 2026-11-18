// Porto Verde — people: sidewalk pedestrians who flee gunfire, the lively
// La Playa beach crowd (umbrellas, towels, lying and wandering sunbathers),
// and the Red Suns gang members guarding Warehouse 7.

import * as THREE from 'three';
import { BEACH_Z, OCEAN_Z } from './config.js';
import { mulberry32, pick, range, dist2d } from './random.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0xecf0f1, 0x1abc9c];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

export function makePerson(shirt, skin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 0.95;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  g.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.55, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2c3e50 }),
  );
  legs.position.y = 0.28;
  g.add(legs);
  return g;
}

export function makeBeach(scene) {
  const rng = mulberry32(4242);
  const group = new THREE.Group();
  scene.add(group);
  const sunbathers = [];
  const umbrellaCols = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22, 0xecf0f1];
  // ~26 umbrellas with towels and lying sunbathers, densest near the water.
  for (let i = 0; i < 26; i++) {
    const x = range(rng, -200, 220);
    const z = range(rng, BEACH_Z + 8, OCEAN_Z - 6);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }),
    );
    pole.position.set(x, 1.3, z);
    group.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(1.9, 0.9, 8),
      new THREE.MeshLambertMaterial({ color: pick(rng, umbrellaCols) }),
    );
    top.position.set(x, 2.9, z);
    group.add(top);
    const towel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 2.0),
      new THREE.MeshLambertMaterial({ color: pick(rng, umbrellaCols) }),
    );
    towel.rotation.x = -Math.PI / 2;
    towel.rotation.z = range(rng, 0, Math.PI);
    towel.position.set(x + range(rng, -2.4, 2.4), 0.08, z + range(rng, -1.5, 2.5));
    group.add(towel);
    // A lying sunbather beside most umbrellas.
    if (rng() < 0.85) {
      const p = makePerson(pick(rng, SHIRTS), pick(rng, SKINS));
      p.rotation.x = -Math.PI / 2 + 0.12;
      p.rotation.z = range(rng, 0, Math.PI * 2);
      p.position.set(towel.position.x, 0.35, towel.position.z);
      p.scale.set(1, 0.55, 1);
      group.add(p);
      sunbathers.push({ mesh: p, lying: true });
    }
  }
  // ~16 wandering sunbathers on the sand.
  for (let i = 0; i < 16; i++) {
    const p = makePerson(pick(rng, SHIRTS), pick(rng, SKINS));
    p.position.set(range(rng, -190, 210), 0, range(rng, BEACH_Z + 6, OCEAN_Z - 4));
    group.add(p);
    sunbathers.push({
      mesh: p, lying: false,
      x0: p.position.x, z0: p.position.z,
      phase: rng() * Math.PI * 2, speed: range(rng, 0.6, 1.4),
    });
  }
  return { group, sunbathers };
}

export function makePedestrians(scene) {
  const rng = mulberry32(99);
  const peds = [];
  for (let i = 0; i < 30; i++) {
    const p = makePerson(pick(rng, SHIRTS), pick(rng, SKINS));
    // Start on a sidewalk: near a road line.
    const onVertical = rng() < 0.5;
    const line = (Math.floor(rng() * 9) - 4) * 50 + 25;
    const along = range(rng, -220, 220);
    p.position.set(onVertical ? line + 8 : along, 0, onVertical ? along : line + 8);
    scene.add(p);
    peds.push({
      mesh: p, speed: range(rng, 1.2, 2.4),
      dir: rng() * Math.PI * 2, flee: 0,
      x0: p.position.x, z0: p.position.z,
    });
  }
  return peds;
}

export function updatePedestrians(dt, peds, gunPos) {
  for (const p of peds) {
    if (gunPos) {
      const d = dist2d(p.mesh.position.x, p.mesh.position.z, gunPos.x, gunPos.z);
      if (d < 26) {
        p.flee = 3;
        p.dir = Math.atan2(p.mesh.position.x - gunPos.x, p.mesh.position.z - gunPos.z);
      }
    }
    if (p.flee > 0) p.flee -= dt;
    const speed = p.flee > 0 ? p.speed * 3.2 : p.speed;
    p.mesh.position.x += Math.sin(p.dir) * speed * dt;
    p.mesh.position.z += Math.cos(p.dir) * speed * dt;
    p.mesh.rotation.y = p.dir;
    if (Math.abs(p.mesh.position.x) > 235 || Math.abs(p.mesh.position.z) > 285) {
      p.dir += Math.PI;
    }
    if (p.flee <= 0 && Math.random() < dt * 0.05) p.dir += (Math.random() - 0.5) * 1.6;
    // Gentle walk bob.
    p.mesh.position.y = Math.abs(Math.sin(performance.now() / 240 + p.x0)) * 0.05;
  }
}

export function updateBeach(dt, beach, t) {
  for (const s of beach.sunbathers) {
    if (s.lying) continue;
    s.mesh.position.x = s.x0 + Math.sin(t * 0.25 * s.speed + s.phase) * 7;
    s.mesh.position.z = s.z0 + Math.cos(t * 0.2 * s.speed + s.phase) * 4;
    s.mesh.rotation.y = Math.atan2(Math.cos(t * 0.25 * s.speed + s.phase), -Math.sin(t * 0.2 * s.speed + s.phase));
  }
}

// Red Suns gang members guarding Warehouse 7 (job 3 targets).
export function makeGang(scene, x, z) {
  const gang = [];
  const spots = [[-8, -6], [6, -4], [-4, 8], [8, 6]];
  for (const [dx, dz] of spots) {
    const g = makePerson(0xc0392b, 0xe0ac69);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.12, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    band.position.y = 1.62;
    g.add(band);
    g.position.set(x + dx, 0, z + dz);
    scene.add(g);
    gang.push({ mesh: g, alive: true, hp: 100 });
  }
  return gang;
}

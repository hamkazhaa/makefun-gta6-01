// Porto Verde — the wanted system: police cars that chase and ram, foot
// cops who chase on foot, and at 4+ stars a searchlight helicopter that
// circles the player with a visible beam and a pink dot on the minimap.

import * as THREE from 'three';
import { VEHICLES } from './config.js';
import { makeCar } from './vehicles.js';
import { makePerson } from './peds.js';
import { clamp, lerpAngle, dist2d } from './random.js';

export function makePolice(scene) {
  const state = {
    wanted: 0,
    heat: 0, // 0..100, drives the star count
    cars: [],
    cops: [],
    heli: null,
    heliLight: null,
    beam: null,
    sirenT: 0,
  };

  // Helicopter: box-built body, tail, skids, spinning rotors, searchlight.
  const heli = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.6, 5.2),
    new THREE.MeshLambertMaterial({ color: 0x1b2a3a }),
  );
  heli.add(body);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 5),
    new THREE.MeshLambertMaterial({ color: 0x1b2a3a }),
  );
  tail.position.set(0, 0.3, -4.6);
  heli.add(tail);
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), rotorMat);
  rotor.position.y = 1.1;
  heli.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.4), rotorMat);
  tailRotor.position.set(0.5, 0.4, -6.8);
  heli.add(tailRotor);
  for (const sx of [-1.4, 1.4]) {
    const skid = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 4.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    );
    skid.position.set(sx, -1.1, 0);
    heli.add(skid);
  }
  const spot = new THREE.SpotLight(0xfff2b0, 0, 90, 0.24, 0.45, 0.8);
  spot.position.set(0, -0.8, 1);
  const tgt = new THREE.Object3D();
  heli.add(tgt);
  spot.target = tgt;
  heli.add(spot);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 46, 12, 1, true), beamMat);
  beam.rotation.x = Math.PI; // cone points down
  beam.position.y = -24;
  heli.add(beam);
  heli.visible = false;
  scene.add(heli);
  state.heli = heli;
  state.heliLight = spot;
  state.beam = beamMat;
  state.rotor = rotor;
  state.tailRotor = tailRotor;

  return state;
}

function spawnPoliceCar(scene, state, x, z) {
  const car = makeCar({ name: 'Interceptor', color: 0x1b2a3a, top: 30, accel: 19 }, { police: true });
  car.position.set(x, 0, z);
  scene.add(car);
  state.cars.push({ mesh: car, speed: 0 });
}

function spawnFootCop(scene, state, x, z) {
  const cop = makePerson(0x1b2a3a, 0xe0ac69);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.14, 10),
    new THREE.MeshLambertMaterial({ color: 0x0f1a26 }),
  );
  cap.position.y = 1.82;
  cop.add(cap);
  cop.position.set(x, 0, z);
  scene.add(cop);
  state.cops.push({ mesh: cop, speed: 4.6 });
}

export function addHeat(state, amount) {
  state.heat = clamp(state.heat + amount, 0, 100);
  state.wanted = state.heat <= 0 ? 0 : state.heat < 20 ? 1 : state.heat < 40 ? 2 : state.heat < 60 ? 3 : state.heat < 85 ? 4 : 5;
}

export function updatePolice(dt, t, scene, state, playerPos, onFoot) {
  // Decay heat slowly when the player is calm.
  state.heat = Math.max(0, state.heat - dt * 1.1);
  state.wanted = state.heat <= 0 ? 0 : state.heat < 20 ? 1 : state.heat < 40 ? 2 : state.heat < 60 ? 3 : state.heat < 85 ? 4 : 5;

  const wantCars = state.wanted >= 1 ? Math.min(3, state.wanted) : 0;
  const wantCops = state.wanted >= 2 ? Math.min(4, state.wanted) : 0;

  // Spawn to match the wanted level, near (but not on top of) the player.
  while (state.cars.length < wantCars) {
    const a = Math.random() * Math.PI * 2;
    spawnPoliceCar(scene, state, playerPos.x + Math.sin(a) * 55, playerPos.z + Math.cos(a) * 55);
  }
  while (state.cops.length < wantCops) {
    const a = Math.random() * Math.PI * 2;
    spawnFootCop(scene, state, playerPos.x + Math.sin(a) * 30, playerPos.z + Math.cos(a) * 30);
  }
  // Remove extras as the heat falls.
  while (state.cars.length > wantCars) scene.remove(state.cars.pop().mesh);
  while (state.cops.length > wantCops) scene.remove(state.cops.pop().mesh);

  // Police cars chase and try to ram the player.
  for (const c of state.cars) {
    const m = c.mesh;
    const dx = playerPos.x - m.position.x;
    const dz = playerPos.z - m.position.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    m.rotation.y = lerpAngle(m.rotation.y, want, Math.min(1, dt * 2.2));
    const sp = d > 6 ? 24 : 10;
    m.position.x += Math.sin(m.rotation.y) * sp * dt;
    m.position.z += Math.cos(m.rotation.y) * sp * dt;
    // Flash the light bar.
    if (m.userData.policeLights) {
      const on = Math.sin(t * 10) > 0;
      m.userData.policeLights[0].material.color.setHex(on ? 0xff2222 : 0x441111);
      m.userData.policeLights[1].material.color.setHex(on ? 0x111144 : 0x2244ff);
    }
  }
  // Foot cops chase on foot.
  for (const c of state.cops) {
    const m = c.mesh;
    const dx = playerPos.x - m.position.x;
    const dz = playerPos.z - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.4) {
      m.rotation.y = Math.atan2(dx, dz);
      m.position.x += Math.sin(m.rotation.y) * c.speed * dt;
      m.position.z += Math.cos(m.rotation.y) * c.speed * dt;
    }
  }

  // Helicopter at 4+ stars: circles above, searchlight tracks the player.
  const heli = state.heli;
  if (state.wanted >= 4) {
    heli.visible = true;
    const a = t * 0.35;
    heli.position.set(playerPos.x + Math.sin(a) * 26, 46, playerPos.z + Math.cos(a) * 26);
    heli.rotation.y = Math.atan2(playerPos.x - heli.position.x, playerPos.z - heli.position.z);
    state.rotor.rotation.y += dt * 22;
    state.tailRotor.rotation.z += dt * 30;
    state.heliLight.intensity = 240;
    state.beam.opacity = 0.16;
    state.heliLight.target.position.set(
      playerPos.x - heli.position.x, -46, playerPos.z - heli.position.z,
    );
  } else {
    heli.visible = false;
    state.heliLight.intensity = 0;
    state.beam.opacity = 0;
  }

  return state.wanted;
}

// Distance from the nearest police unit (for HUD "heat" feel).
export function nearestPolice(state, x, z) {
  let best = Infinity;
  for (const c of state.cars) best = Math.min(best, dist2d(x, z, c.mesh.position.x, c.mesh.position.z));
  for (const c of state.cops) best = Math.min(best, dist2d(x, z, c.mesh.position.x, c.mesh.position.z));
  return best;
}

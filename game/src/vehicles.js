// Porto Verde — cars: box-built models, traffic that loops the road grid,
// parked cars to steal, and arcade driving physics for the player's car.

import * as THREE from 'three';
import { PITCH, VEHICLES, LANDMARKS } from './config.js';
import { mulberry32, pick, range, clamp, lerpAngle } from './random.js';
import { resolveCollisions } from './world.js';

// Build a simple car from boxes: body, cabin, wheels, headlights.
export function makeCar(model, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: model.color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.05, -0.2);
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    g.add(wheel);
  }
  // Headlight cones (visible at dusk/night) + light spots.
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false,
  });
  for (const sx of [-0.6, 0.6]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 10, 1, true), coneMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(sx, 0.6, 2.2 + 3.5);
    g.add(cone);
  }
  const spots = [];
  for (const sx of [-0.6, 0.6]) {
    const s = new THREE.SpotLight(0xffe9a8, 0, 26, 0.42, 0.5, 1.2);
    s.position.set(sx, 0.8, 2.0);
    const tgt = new THREE.Object3D();
    tgt.position.set(sx * 1.4, 0, 12);
    g.add(tgt);
    s.target = tgt;
    g.add(s);
    spots.push(s);
  }
  g.userData = { model, cones: g.children.filter((c) => c.material === coneMat), spots };
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x223344 }));
    bar.position.set(0, 1.45, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.32, 1.58, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.32, 1.58, -0.2);
    g.add(blue);
    g.userData.policeLights = [red, blue];
  }
  return g;
}

export function setHeadlights(car, on, darkness) {
  const u = car.userData;
  const strength = on ? 1 : 0;
  for (const c of u.cones) c.material.opacity = 0.45 * strength * Math.max(0.2, darkness);
  for (const s of u.spots) s.intensity = on ? 60 * Math.max(0.25, darkness) : 0;
}

// Traffic: cars looping rectangular circuits on the road grid.
export function makeTraffic(scene, colliders) {
  const rng = mulberry32(777);
  const cars = [];
  const circuits = [];
  for (let k = 0; k < 4; k++) {
    const a = -175 + k * 100;
    circuits.push([
      { x: a, z: -225 }, { x: a, z: 225 }, { x: a + 50, z: 225 }, { x: a + 50, z: -225 },
    ]);
  }
  for (let i = 0; i < 12; i++) {
    const model = pick(rng, VEHICLES);
    const car = makeCar(model);
    const circuit = circuits[i % circuits.length];
    const wp = Math.floor(rng() * circuit.length);
    const node = circuit[wp];
    car.position.set(node.x + range(rng, -3, 3), 0, node.z + range(rng, -3, 3));
    scene.add(car);
    cars.push({ mesh: car, circuit, wp, speed: range(rng, 7, 12), model });
  }
  // Parked cars (stealable), placed along roads.
  const parked = [];
  const parkSpots = [
    { x: -168, z: 30, model: VEHICLES[0] }, { x: 32, z: -168, model: VEHICLES[2] },
    { x: 132, z: 80, model: VEHICLES[3] }, { x: -32, z: 168, model: VEHICLES[0] },
    { x: 168, z: -30, model: VEHICLES[2] }, { x: -82, z: -118, model: VEHICLES[3] },
    { x: 82, z: 118, model: VEHICLES[0] }, { x: -118, z: 132, model: VEHICLES[2] },
    { x: 118, z: -82, model: VEHICLES[3] }, { x: 30, z: 32, model: VEHICLES[0] },
    { x: -30, z: -32, model: VEHICLES[2] }, { x: 180, z: 118, model: VEHICLES[1] },
  ];
  for (const s of parkSpots) {
    const car = makeCar(s.model);
    car.position.set(s.x, 0, s.z);
    car.rotation.y = (Math.abs(s.x) > Math.abs(s.z) ? Math.PI / 2 : 0) + (rng() < 0.5 ? Math.PI : 0);
    scene.add(car);
    parked.push({ mesh: car, model: s.model, stolen: false });
  }
  // The orange Solstice GT for job 3, parked by Warehouse 7.
  const gt = makeCar(VEHICLES[1]);
  gt.position.set(LANDMARKS.warehouse7.x - 12, 0, LANDMARKS.warehouse7.z + 8);
  gt.rotation.y = Math.PI / 2;
  scene.add(gt);
  parked.push({ mesh: gt, model: VEHICLES[1], stolen: false, jobCar: true });

  return { cars, parked };
}

export function updateTraffic(dt, traffic) {
  for (const t of traffic.cars) {
    const target = t.circuit[(t.wp + 1) % t.circuit.length];
    const dx = target.x - t.mesh.position.x;
    const dz = target.z - t.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) {
      t.wp = (t.wp + 1) % t.circuit.length;
      continue;
    }
    const want = Math.atan2(dx, dz);
    t.mesh.rotation.y = lerpAngle(t.mesh.rotation.y, want, Math.min(1, dt * 3));
    t.mesh.position.x += Math.sin(t.mesh.rotation.y) * t.speed * dt;
    t.mesh.position.z += Math.cos(t.mesh.rotation.y) * t.speed * dt;
  }
}

// Arcade driving for the player's car. Returns the car's new speed.
export function driveCar(car, input, dt, colliders) {
  const u = car.userData;
  const m = u.model;
  const speed = u.speed || 0;
  let next = speed;
  if (input.forward) next += m.accel * dt;
  else if (input.back) next -= m.accel * 0.7 * dt;
  else next -= Math.sign(next) * Math.min(Math.abs(next), 8 * dt);
  next = clamp(next, -m.top * 0.45, m.top);
  if (Math.abs(next) > 0.5) {
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    car.rotation.y += steer * (next > 0 ? 1 : -1) * 1.9 * dt * Math.min(1, Math.abs(next) / 10);
  }
  const nx = car.position.x + Math.sin(car.rotation.y) * next * dt;
  const nz = car.position.z + Math.cos(car.rotation.y) * next * dt;
  const fixed = resolveCollisions(colliders, nx, nz, 2.2);
  if (fixed.x !== nx || fixed.z !== nz) next *= 0.4;
  car.position.x = clamp(fixed.x, -245, 245);
  car.position.z = clamp(fixed.z, -245, 290);
  u.speed = next;
  return next;
}

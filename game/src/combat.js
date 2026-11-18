// Porto Verde — pistol combat: aim with the mouse, click to shoot, a
// magazine with reload, tracers, and hit tests against gang members and
// pedestrians (shooting a pedestrian raises the heat a lot).

import * as THREE from 'three';
import { dist2d } from './random.js';

export function makeCombat(scene) {
  return {
    mag: 12,
    magSize: 12,
    reserve: 60,
    reloading: 0,
    cooldown: 0,
    tracers: [],
    scene,
  };
}

function spawnTracer(combat, from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }),
  );
  combat.scene.add(line);
  combat.tracers.push({ line, life: 0.12, max: 0.12 });
}

export function updateTracers(dt, combat) {
  for (let i = combat.tracers.length - 1; i >= 0; i--) {
    const tr = combat.tracers[i];
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life / tr.max) * 0.9;
    if (tr.life <= 0) {
      combat.scene.remove(tr.line);
      tr.line.geometry.dispose();
      combat.tracers.splice(i, 1);
    }
  }
}

// Fire one shot from the camera toward the aim point.
// targets: [{mesh, alive, hp, kind}] — gang and peds. Returns hit info.
export function shoot(combat, origin, dir, targets) {
  if (combat.cooldown > 0 || combat.reloading > 0) return null;
  if (combat.mag <= 0) {
    combat.reloading = 1.1;
    return { dry: true };
  }
  combat.mag--;
  combat.cooldown = 0.22;
  const end = origin.clone().add(dir.clone().multiplyScalar(90));
  let best = null;
  let bestD = 95;
  for (const t of targets) {
    if (!t.alive) continue;
    const p = t.mesh.position;
    // Distance from the target to the shot ray.
    const to = new THREE.Vector3(p.x - origin.x, 1.2 - origin.y, p.z - origin.z);
    const along = to.dot(dir);
    if (along < 0 || along > 90) continue;
    const closest = origin.clone().add(dir.clone().multiplyScalar(along));
    const d = Math.hypot(p.x - closest.x, 1.2 - closest.y, p.z - closest.z);
    if (d < 1.6 && along < bestD) {
      bestD = along;
      best = t;
    }
  }
  const hitPoint = best
    ? new THREE.Vector3(best.mesh.position.x, 1.2, best.mesh.position.z)
    : end;
  spawnTracer(combat, origin.clone(), hitPoint);
  if (best) {
    best.hp -= 50;
    if (best.hp <= 0) {
      best.alive = false;
      best.mesh.visible = false;
    }
    return { hit: best };
  }
  return { miss: true };
}

export function updateCombat(dt, combat) {
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  if (combat.reloading > 0) {
    combat.reloading -= dt;
    if (combat.reloading <= 0) {
      const need = combat.magSize - combat.mag;
      const take = Math.min(need, combat.reserve);
      combat.mag += take;
      combat.reserve -= take;
    }
  }
  updateTracers(dt, combat);
}

// Porto Verde — the game loop: renderer, third-person camera, on-foot and
// driving controls, time-of-day keyframes, headlights, the wanted loop,
// missions, combat wiring, saves and the title/pause/map modes.

import * as THREE from 'three';
import { START_TIME, LANDMARKS } from './config.js';
import { clamp, lerp, dist2d } from './random.js';
import { buildWorld, resolveCollisions } from './world.js';
import { makeCar, makeTraffic, updateTraffic, driveCar, setHeadlights } from './vehicles.js';
import { makePedestrians, makeBeach, updatePedestrians, updateBeach, makeGang } from './peds.js';
import { makePolice, updatePolice, addHeat, nearestPolice } from './police.js';
import { makeMissions, updateMissions, objectiveOf } from './missions.js';
import { makeCombat, shoot, updateCombat } from './combat.js';
import { makeAudio } from './audio.js';
import { makeHud, updateHud, showVehiclePlate, refreshMapPanel } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { installHooks } from './shots.js';

// Time-of-day keyframes: [hour, sky, sun intensity, hemi intensity, darkness]
const SKY_KEYS = [
  [5, 0x8a7f9e, 0.4, 0.5, 0.55],
  [7, 0x9fc3e0, 1.4, 0.8, 0.05],
  [12, 0x87b5d6, 2.2, 1.0, 0.0],
  [17.33, 0x9ec3dd, 1.8, 0.9, 0.02],
  [18.5, 0xe8793a, 1.0, 0.55, 0.45],
  [19.5, 0x7a4a6e, 0.4, 0.35, 0.8],
  [21, 0x0e1626, 0.12, 0.18, 1.0],
  [24, 0x0a1220, 0.1, 0.15, 1.0],
  [29, 0x8a7f9e, 0.4, 0.5, 0.55], // wraps to 5:00 next day
];

function skyAt(t) {
  const h = ((t % 24) + 24) % 24;
  const hh = h < 5 ? h + 24 : h;
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const [h0, c0, s0, e0, d0] = SKY_KEYS[i];
    const [h1, c1, s1, e1, d1] = SKY_KEYS[i + 1];
    if (hh >= h0 && hh <= h1) {
      const f = (hh - h0) / (h1 - h0);
      const col0 = new THREE.Color(c0);
      const col1 = new THREE.Color(c1);
      return {
        sky: col0.lerp(col1, f),
        sun: lerp(s0, s1, f),
        hemi: lerp(e0, e1, f),
        darkness: lerp(d0, d1, f),
      };
    }
  }
  return { sky: new THREE.Color(0x87b5d6), sun: 2, hemi: 1, darkness: 0 };
}

export function boot() {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ec3dd);
  scene.fog = new THREE.Fog(0x9ec3dd, 120, 520);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 30, 120);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a2f26, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
  sun.position.set(120, 180, 60);
  scene.add(sun);

  const { colliders, animated } = buildWorld(scene);
  const traffic = makeTraffic(scene, colliders);
  const peds = makePedestrians(scene);
  const beach = makeBeach(scene);
  const gang = makeGang(scene, LANDMARKS.warehouse7.x, LANDMARKS.warehouse7.z);
  const police = makePolice(scene);
  const missions = makeMissions();
  const combat = makeCombat(scene);
  const audio = makeAudio();
  const hud = makeHud(document.getElementById('ui'));

  // The player: capsule body + head, third-person.
  const playerMesh = new THREE.Group();
  const pBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.9, 0.36),
    new THREE.MeshLambertMaterial({ color: 0x2e86c1 }),
  );
  pBody.position.y = 1.0;
  playerMesh.add(pBody);
  const pHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe0ac69 }),
  );
  pHead.position.y = 1.68;
  playerMesh.add(pHead);
  const pLegs = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.55, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x2c3e50 }),
  );
  pLegs.position.y = 0.3;
  playerMesh.add(pLegs);
  scene.add(playerMesh);

  const state = {
    mode: 'title', // title | playing | paused | map
    time: START_TIME,
    player: { x: 0, z: -25, yaw: 0, health: 100, speed: 0 },
    camYaw: Math.PI,
    camPitch: 0.32,
    car: null,
    missions,
    police,
    combat,
    audio,
    hud,
    traffic,
    gang,
    keys: {},
    mouseDown: false,
    lastShot: 0,
  };

  function applyObjective() {
    const obj = objectiveOf(missions);
    missions.objective = obj;
    const beacon = animated.beacons[0];
    if (beacon) beacon.position.set(obj.x, 30, obj.z);
  }
  applyObjective();

  state.startPlaying = function (saved) {
    if (saved) {
      missions.cash = saved.cash;
      missions.jobsDone = saved.jobsDone;
      missions.jobIndex = saved.jobIndex;
      missions.stepIndex = saved.stepIndex;
      state.player.x = saved.x;
      state.player.z = saved.z;
      state.time = saved.time;
      applyObjective();
    } else {
      state.player.x = 0;
      state.player.z = -25;
      state.time = START_TIME;
    }
    state.mode = 'playing';
    hud.el('title-screen').style.display = 'none';
    hud.el('pause-menu').style.display = 'none';
    hud.el('big-map').style.display = 'none';
    audio.unlock();
    if (hasSave()) hud.el('btn-continue').style.display = 'none';
  };

  state.exitCar = function () {
    if (!state.car) return;
    const c = state.car;
    c.userData.speed = 0;
    setHeadlights(c, false, 0);
    state.player.x = c.position.x + Math.sin(c.rotation.y + Math.PI / 2) * 3;
    state.player.z = c.position.z + Math.cos(c.rotation.y + Math.PI / 2) * 3;
    state.player.yaw = c.rotation.y;
    state.car = null;
    playerMesh.visible = true;
  };

  state.enterCar = function (parked) {
    if (state.car) return;
    parked.stolen = true;
    missions.carsStolen++;
    state.car = parked.mesh;
    playerMesh.visible = false;
    showVehiclePlate(hud, parked.model.name);
  };

  state.tryShoot = function () {
    if (state.mode !== 'playing') return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone();
    const targets = [
      ...gang.map((g) => ({ ...g, kind: 'gang' })),
      ...peds.map((p) => ({ mesh: p.mesh, alive: p.alive !== false, hp: 50, kind: 'ped', _ped: p })),
    ];
    const res = shoot(combat, origin, dir, targets);
    if (!res) return;
    if (res.dry) return;
    audio.gunshot();
    addHeat(police, 6);
    if (res.hit) {
      if (res.hit.kind === 'gang') {
        addHeat(police, 9);
        if (!res.hit.alive) addHeat(police, 6);
      } else if (res.hit.kind === 'ped') {
        addHeat(police, 22);
        res.hit._ped.alive = false;
        res.hit.mesh.rotation.x = Math.PI / 2;
        res.hit.mesh.position.y = 0.3;
      }
    }
    // Nearby pedestrians flee the gunshot.
    updatePedestrians(0, peds, { x: state.player.x, z: state.player.z });
  };

  // ---- Input ----
  window.addEventListener('keydown', (e) => {
    state.keys[e.code] = true;
    if (e.code === 'KeyM' && state.mode === 'playing') {
      state.mode = 'map';
      refreshMapPanel(hud, state);
      hud.el('big-map').style.display = 'block';
    } else if ((e.code === 'KeyM' || e.code === 'Escape') && state.mode === 'map') {
      state.mode = 'playing';
      hud.el('big-map').style.display = 'none';
    } else if (e.code === 'KeyP' && state.mode === 'playing') {
      state.mode = 'paused';
      saveGame(state);
      hud.el('pause-menu').style.display = 'block';
    } else if (e.code === 'KeyP' && state.mode === 'paused') {
      state.mode = 'playing';
      hud.el('pause-menu').style.display = 'none';
    } else if (e.code === 'KeyQ' && state.mode === 'playing') {
      audio.cycleStation();
    } else if (e.code === 'KeyR' && state.mode === 'playing') {
      if (combat.mag < combat.magSize && combat.reserve > 0 && combat.reloading <= 0) {
        combat.reloading = 1.1;
      }
    } else if (e.code === 'KeyE' && state.mode === 'playing') {
      if (state.car) {
        state.exitCar();
      } else {
        let best = null;
        let bestD = 4.5;
        for (const p of traffic.parked) {
          if (p.stolen) continue;
          const d = dist2d(state.player.x, state.player.z, p.mesh.position.x, p.mesh.position.z);
          if (d < bestD) { bestD = d; best = p; }
        }
        if (best) state.enterCar(best);
      }
    }
  });
  window.addEventListener('keyup', (e) => { state.keys[e.code] = false; });
  let dragging = false;
  let lastMX = 0, lastMY = 0;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    lastMX = e.clientX;
    lastMY = e.clientY;
    state.mouseDown = true;
    if (state.mode === 'playing') state.tryShoot();
  });
  window.addEventListener('mouseup', () => { dragging = false; state.mouseDown = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    state.camYaw -= (e.clientX - lastMX) * 0.005;
    state.camPitch = clamp(state.camPitch + (e.clientY - lastMY) * 0.004, -0.1, 1.1);
    lastMX = e.clientX;
    lastMY = e.clientY;
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- Buttons ----
  hud.el('btn-new').addEventListener('click', () => state.startPlaying(null));
  hud.el('btn-continue').addEventListener('click', () => state.startPlaying(loadGame()));
  hud.el('btn-resume').addEventListener('click', () => {
    state.mode = 'playing';
    hud.el('pause-menu').style.display = 'none';
  });
  hud.el('btn-save').addEventListener('click', () => { saveGame(state); });
  hud.el('btn-quit').addEventListener('click', () => {
    saveGame(state);
    state.mode = 'title';
    hud.el('pause-menu').style.display = 'none';
    hud.el('title-screen').style.display = 'block';
    if (hasSave()) hud.el('btn-continue').style.display = 'block';
  });
  if (hasSave()) hud.el('btn-continue').style.display = 'block';

  const hooks = installHooks(state);
  const clock = new THREE.Clock();
  let elapsed = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    hooks.tickFrame();

    if (state.mode === 'title') {
      // Slow orbit over the city behind the title screen.
      hud.el('hud').style.display = 'none';
      const a = elapsed * 0.05;
      camera.position.set(Math.sin(a) * 160, 55, Math.cos(a) * 160);
      camera.lookAt(0, 10, 0);
      const sky = skyAt(state.time);
      scene.background.copy(sky.sky);
      scene.fog.color.copy(sky.sky);
      sun.intensity = sky.sun;
      hemi.intensity = sky.hemi;
    } else if (state.mode === 'playing') {
      hud.el('hud').style.display = 'block';
      state.time += dt / 120; // 1 game hour per 2 real minutes
      const sky = skyAt(state.time);
      scene.background.copy(sky.sky);
      scene.fog.color.copy(sky.sky);
      sun.intensity = sky.sun;
      hemi.intensity = sky.hemi;
      const darkness = sky.darkness;

      // Sun angle follows the time of day.
      const sunA = ((state.time % 24) / 24) * Math.PI * 2 - Math.PI / 2;
      sun.position.set(Math.cos(sunA) * 160, Math.max(20, Math.sin(sunA) * 160 + 40), 80);

      // Ocean shimmer.
      if (animated.ocean) animated.ocean.position.y = 0.12 + Math.sin(elapsed * 0.7) * 0.08;
      if (animated.beacons[0]) animated.beacons[0].rotation.y += dt * 0.8;

      updateTraffic(dt, traffic);
      updatePedestrians(dt, peds, null);
      updateBeach(dt, beach, elapsed);
      updateCombat(dt, combat);

      // Missions + wanted.
      const gangAlive = gang.filter((g) => g.alive).length;
      const res = updateMissions(dt, missions, {
        x: state.player.x, z: state.player.z,
        inCar: !!state.car, carName: state.car ? state.car.userData.model.name : null,
        gangAlive,
      });
      if (res.clearHeat) {
        police.heat = 0;
        police.wanted = 0;
      }
      updatePolice(dt, elapsed, scene, police, { x: state.player.x, z: state.player.z }, !state.car);
      audio.siren(police.wanted >= 2 && nearestPolice(police, state.player.x, state.player.z) < 40);

      // Movement.
      const k = state.keys;
      const input = {
        forward: !!(k.KeyW || k.ArrowUp),
        back: !!(k.KeyS || k.ArrowDown),
        left: !!(k.KeyA || k.ArrowLeft),
        right: !!(k.KeyD || k.ArrowRight),
      };
      if (state.car) {
        const speed = driveCar(state.car, input, dt, colliders);
        state.player.x = state.car.position.x;
        state.player.z = state.car.position.z;
        state.player.yaw = state.car.rotation.y;
        audio.engine(Math.abs(speed) / 34);
        setHeadlights(state.car, darkness > 0.45, darkness);
      } else {
        audio.engine(0);
        const moveSpeed = (k.ShiftLeft || k.ShiftRight) ? 9 : 6;
        let mx = 0, mz = 0;
        if (input.forward) { mx += Math.sin(state.camYaw); mz += Math.cos(state.camYaw); }
        if (input.back) { mx -= Math.sin(state.camYaw); mz -= Math.cos(state.camYaw); }
        if (input.left) { mx += Math.sin(state.camYaw - Math.PI / 2); mz += Math.cos(state.camYaw - Math.PI / 2); }
        if (input.right) { mx += Math.sin(state.camYaw + Math.PI / 2); mz += Math.cos(state.camYaw + Math.PI / 2); }
        const len = Math.hypot(mx, mz);
        if (len > 0) {
          mx /= len;
          mz /= len;
          const nx = state.player.x + mx * moveSpeed * dt;
          const nz = state.player.z + mz * moveSpeed * dt;
          const fixed = resolveCollisions(colliders, nx, nz, 0.8);
          state.player.x = clamp(fixed.x, -245, 245);
          state.player.z = clamp(fixed.z, -245, 290);
          state.player.yaw = Math.atan2(mx, mz);
        }
        playerMesh.position.set(state.player.x, 0, state.player.z);
        playerMesh.rotation.y = state.player.yaw;
      }

      // Busted: cops touching the player on foot.
      if (!state.car) {
        const near = nearestPolice(police, state.player.x, state.player.z);
        if (near < 2.2) {
          state.player.health -= 14 * dt;
          if (state.player.health <= 0) {
            state.player.health = 100;
            police.heat = 0;
            police.wanted = 0;
            missions.cash = Math.max(0, missions.cash - 100);
            state.player.x = LANDMARKS.hospital.x;
            state.player.z = LANDMARKS.hospital.z;
            missions.message = 'BUSTED — you woke up at the Hospital (-$100).';
            missions.messageT = 4;
          }
        }
      }

      // Camera: third-person follow.
      const target = state.car ? state.car.position : playerMesh.position;
      const camDist = state.car ? 11 : 7.5;
      const camH = state.car ? 4.5 : 3.6;
      const cx = target.x - Math.sin(state.camYaw) * camDist;
      const cz = target.z - Math.cos(state.camYaw) * camDist;
      camera.position.set(cx, camH + Math.sin(state.camPitch) * 4, cz);
      camera.lookAt(target.x, 1.6, target.z);

      updateHud(hud, state, dt);
    } else if (state.mode === 'map') {
      // Frozen game behind the map; keep the scene visible.
      hud.el('hud').style.display = 'none';
    }

    renderer.render(scene, camera);
  }
  frame();
  return state;
}

boot();

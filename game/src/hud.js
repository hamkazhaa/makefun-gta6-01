// Porto Verde — the HUD: a big round minimap with a gold dashed route line,
// in-game clock + phase, radio strip, district splash, mission tracker,
// vehicle name plate, wanted stars, cash, health and ammo; plus the title
// screen, pause menu and the full-screen map (M key).

import { LANDMARKS, districtAt } from './config.js';
import { missionList } from './missions.js';

export function makeHud(root) {
  root.innerHTML = `
  <div id="hud">
    <div id="top-right">
      <div id="clock">17:20 <span id="phase">DAY</span></div>
      <div id="cash">$750</div>
      <div id="stars"></div>
    </div>
    <div id="radio-strip">♪ <span id="station">Brisa Bossa 88</span> · <span id="track">—</span></div>
    <div id="mission-box"><div id="mission-title">JOB 1 — THE PICKUP</div><div id="mission-text">Meet Dre at the Docks</div><div id="mission-dist">224 m</div></div>
    <div id="vehicle-plate" style="display:none"></div>
    <div id="district-splash"></div>
    <div id="flash"></div>
    <div id="bottom-left">
      <div id="health-bar"><div id="health-fill"></div></div>
      <div id="ammo">▸ 12 / 60</div>
    </div>
    <canvas id="minimap" width="220" height="220"></canvas>
  </div>
  <div id="title-screen">
    <div class="title-inner">
      <h1>PORTO VERDE</h1>
      <p class="subtitle">AN OPEN-WORLD CRIME STORY</p>
      <p class="blurb">Rico Vega is back in Porto Verde to settle a debt. Steal cars, lose the heat, run the jobs — the city is yours.</p>
      <button id="btn-new">NEW GAME</button>
      <button id="btn-continue" style="display:none">CONTINUE</button>
      <p class="controls">WASD move / drive · Mouse drag to look · E steal car · Click shoot · R reload · M map · Q radio · P pause</p>
    </div>
  </div>
  <div id="pause-menu" style="display:none">
    <div class="title-inner">
      <h1>PAUSED</h1>
      <button id="btn-resume">RESUME</button>
      <button id="btn-save">SAVE GAME</button>
      <button id="btn-quit">QUIT TO TITLE</button>
      <p class="controls">Progress saves automatically when you pause.</p>
    </div>
  </div>
  <div id="big-map" style="display:none">
    <div class="map-col">
      <h2>PORTO VERDE — CITY MAP</h2>
      <div class="map-row-wrap">
        <div id="map-canvas-wrap"><canvas id="map-canvas" width="760" height="560"></canvas></div>
        <div id="map-side">
          <h3>MISSIONS</h3><div id="map-missions"></div>
          <h3>STATS</h3><div id="map-stats"></div>
          <p class="controls">Press M or Esc to close</p>
        </div>
      </div>
    </div>
  </div>`;

  const el = (id) => root.querySelector('#' + id);
  return {
    el,
    minimap: el('minimap'),
    mapCanvas: el('map-canvas'),
    lastDistrict: '',
    splashT: 0,
    plateT: 0,
  };
}

function fmtTime(t) {
  const h = Math.floor(t) % 24;
  const m = Math.floor((t % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function phaseOf(t) {
  const h = t % 24;
  if (h >= 6 && h < 11.5) return 'MORNING';
  if (h >= 11.5 && h < 17.5) return 'DAY';
  if (h >= 17.5 && h < 19.5) return 'DUSK';
  if (h >= 19.5 || h < 5) return 'NIGHT';
  return 'DAWN';
}

// Draw the round minimap: roads, districts, player arrow, objective dot,
// police dots, heli dot, and the gold dashed route line.
export function drawMinimap(hud, state) {
  const c = hud.minimap;
  const g = c.getContext('2d');
  const S = 220;
  const R = S / 2;
  const scale = S / 560; // world -280..280 -> 0..220
  const toMap = (x, z) => [(x + 280) * scale, (z + 280) * scale];
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(R, R, R - 2, 0, Math.PI * 2);
  g.clip();
  // Sea + sand + land.
  g.fillStyle = '#1d6f8e';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#d9c28a';
  const [, beachY] = toMap(0, 215);
  g.fillRect(0, beachY, S, S - beachY);
  g.fillStyle = '#3d3a33';
  g.fillRect(0, 0, S, beachY);
  // Roads.
  g.strokeStyle = '#23262b';
  g.lineWidth = 7;
  for (let k = -4; k <= 4; k++) {
    const p = (k * 50 + 25 + 280) * scale;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  // Park.
  g.fillStyle = '#4d7a3a';
  const [px, py] = toMap(0, 0);
  g.fillRect(px - 18, py - 18, 36, 36);
  // Route: gold dashed line from player to objective.
  const [ox, oy] = toMap(state.missions.objective.x, state.missions.objective.z);
  const [plx, ply] = toMap(state.player.x, state.player.z);
  g.strokeStyle = '#ffd76a';
  g.lineWidth = 2.5;
  g.setLineDash([7, 6]);
  g.beginPath();
  g.moveTo(plx, ply);
  g.lineTo(ox, oy);
  g.stroke();
  g.setLineDash([]);
  // Objective marker.
  g.fillStyle = '#ffd76a';
  g.beginPath();
  g.arc(ox, oy, 6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  g.stroke();
  // Police dots (white) and heli dot (pink).
  g.fillStyle = '#ffffff';
  for (const car of state.police.cars) {
    const [cx, cy] = toMap(car.mesh.position.x, car.mesh.position.z);
    g.beginPath(); g.arc(cx, cy, 3.5, 0, Math.PI * 2); g.fill();
  }
  if (state.police.wanted >= 4 && state.police.heli.visible) {
    const [hx, hy] = toMap(state.police.heli.position.x, state.police.heli.position.z);
    g.fillStyle = '#ff5fa2';
    g.beginPath(); g.arc(hx, hy, 4.5, 0, Math.PI * 2); g.fill();
  }
  // Player arrow.
  g.save();
  g.translate(plx, ply);
  g.rotate(state.player.yaw);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#111';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(6, 6);
  g.lineTo(-6, 6);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  g.restore();
  // Round rim.
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(R, R, R - 2, 0, Math.PI * 2);
  g.stroke();
}

export function drawBigMap(hud, state) {
  const c = hud.mapCanvas;
  const g = c.getContext('2d');
  const W = 760, H = 560;
  const scale = W / 560;
  const toMap = (x, z) => [(x + 280) * scale, (z + 200) * scale * (H / 560) * (560 / 560)];
  g.fillStyle = '#14181f';
  g.fillRect(0, 0, W, H);
  // Land.
  g.fillStyle = '#3d3a33';
  g.fillRect(0, 0, W, (215 + 200) * (H / 560));
  // Beach + ocean.
  g.fillStyle = '#d9c28a';
  g.fillRect(0, (215 + 200) * (H / 560), W, 40);
  g.fillStyle = '#1d6f8e';
  g.fillRect(0, (255 + 200) * (H / 560), W, H);
  // Roads.
  g.strokeStyle = '#23262b';
  g.lineWidth = 8;
  for (let k = -4; k <= 4; k++) {
    const p = (k * 50 + 25 + 280) * scale;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, H); g.stroke();
    const q = (k * 50 + 25 + 200) * (H / 560);
    g.beginPath(); g.moveTo(0, q); g.lineTo(W, q); g.stroke();
  }
  // Park.
  g.fillStyle = '#4d7a3a';
  g.fillRect((0 + 280) * scale - 24, (0 + 200) * (H / 560) - 24, 48, 48);
  // District labels.
  g.fillStyle = '#ffd76a';
  g.font = 'bold 22px Arial';
  g.textAlign = 'center';
  const labels = [
    ['NORTH HILLS', 0, -160], ['OLD TOWN', -170, 0], ['DOWNTOWN', 0, -40],
    ['HARBOR DISTRICT', 180, 20], ['LA PLAYA', 0, 235],
  ];
  for (const [name, x, z] of labels) {
    const [mx, my] = toMap(x, z);
    g.fillText(name, mx, my);
  }
  // Landmarks.
  g.font = '15px Arial';
  g.fillStyle = '#9fd8ff';
  for (const key of Object.keys(LANDMARKS)) {
    const lm = LANDMARKS[key];
    const [mx, my] = toMap(lm.x, lm.z);
    g.beginPath();
    g.arc(mx, my, 4, 0, Math.PI * 2);
    g.fill();
    g.fillText(lm.name, mx, my - 9);
  }
  // Objective + player.
  const obj = state.missions.objective;
  const [ox, oy] = toMap(obj.x, obj.z);
  g.fillStyle = '#ffd76a';
  g.beginPath();
  g.arc(ox, oy, 8, 0, Math.PI * 2);
  g.fill();
  const [plx, ply] = toMap(state.player.x, state.player.z);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(plx, ply, 7, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  g.stroke();
}

export function updateHud(hud, state, dt) {
  const m = state.missions;
  hud.el('clock').innerHTML = `${fmtTime(state.time)} <span id="phase">${phaseOf(state.time)}</span>`;
  hud.el('cash').textContent = '$' + m.cash.toLocaleString('en-US');
  // Wanted stars.
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < state.police.wanted ? '★' : '☆';
  const starEl = hud.el('stars');
  starEl.textContent = stars;
  starEl.style.color = state.police.wanted >= 4 ? '#ff4444' : '#ffd76a';
  // Mission tracker.
  const jobName = m.jobIndex < 3 ? `JOB ${m.jobIndex + 1} — ${['THE PICKUP', 'HEAT', 'THE HARBOR JOB'][m.jobIndex]}` : 'FREE ROAM — COURIER';
  hud.el('mission-title').textContent = jobName;
  hud.el('mission-text').textContent = m.objective.text;
  const d = Math.round(Math.hypot(state.player.x - m.objective.x, state.player.z - m.objective.z));
  hud.el('mission-dist').textContent = `${d} m — ${m.objective.name}`;
  // Radio.
  hud.el('station').textContent = state.audio.stationName();
  hud.el('track').textContent = state.audio.state.trackName || '—';
  // Health + ammo.
  hud.el('health-fill').style.width = `${Math.max(0, state.player.health)}%`;
  hud.el('ammo').textContent = state.combat.reloading > 0
    ? '▸ RELOADING…'
    : `▸ ${state.combat.mag} / ${state.combat.reserve}`;
  // Flash message.
  const flash = hud.el('flash');
  if (m.messageT > 0) {
    flash.textContent = m.message;
    flash.style.opacity = '1';
  } else {
    flash.style.opacity = '0';
  }
  // District splash.
  const dist = districtAt(state.player.x, state.player.z);
  if (dist !== hud.lastDistrict) {
    hud.lastDistrict = dist;
    hud.splashT = 2.6;
    const sp = hud.el('district-splash');
    sp.textContent = dist;
    sp.style.opacity = '1';
  }
  if (hud.splashT > 0) {
    hud.splashT -= dt;
    if (hud.splashT <= 0) hud.el('district-splash').style.opacity = '0';
  }
  // Vehicle plate.
  if (hud.plateT > 0) {
    hud.plateT -= dt;
    if (hud.plateT <= 0) hud.el('vehicle-plate').style.display = 'none';
  }
  drawMinimap(hud, state);
}

export function showVehiclePlate(hud, name) {
  const el = hud.el('vehicle-plate');
  el.textContent = name;
  el.style.display = 'block';
  hud.plateT = 3;
}

export function refreshMapPanel(hud, state) {
  const rows = missionList(state.missions).map((r) =>
    `<div class="map-row"><span>${r.name}</span><span>${r.state === 'DONE' ? '✓ DONE' : r.state === 'ACTIVE' ? '▶ ACTIVE' : '○ LOCKED'}</span><span>$${r.pay}</span></div>`).join('');
  hud.el('map-missions').innerHTML = rows;
  hud.el('map-stats').innerHTML = `
    <div class="map-row"><span>Cash</span><span>$${state.missions.cash}</span></div>
    <div class="map-row"><span>Jobs done</span><span>${state.missions.jobsDone} / 3</span></div>
    <div class="map-row"><span>Cars stolen</span><span>${state.missions.carsStolen}</span></div>
    <div class="map-row"><span>Wanted</span><span>${'★'.repeat(state.police.wanted)}${'☆'.repeat(5 - state.police.wanted)}</span></div>
    <div class="map-row"><span>Time</span><span>${fmtTime(state.time)} ${phaseOf(state.time)}</span></div>
    <div class="map-row"><span>District</span><span>${districtAt(state.player.x, state.player.z)}</span></div>`;
  drawBigMap(hud, state);
}

// Porto Verde — hooks for headless playtesting and screenshots. Exposes a
// small window.__pv API (start, teleport, set time, set wanted, state dump)
// and a __shotReady flag the screenshot driver waits for. These hooks are
// harmless in normal play: they only read state and drive the same code
// paths a player uses.

export function installHooks(state) {
  let frames = 0;
  window.__pv = {
    state,
    startGame() {
      state.startPlaying();
    },
    teleport(place) {
      const spots = {
        beach: { x: 20, z: 235 },
        docks: { x: 190, z: 60 },
        downtown: { x: 0, z: 0 },
        garage: { x: 60, z: -160 },
        motel: { x: -60, z: 140 },
        warehouse: { x: 185, z: 125 },
      };
      const s = spots[place] || spots.downtown;
      state.exitCar();
      state.player.x = s.x;
      state.player.z = s.z;
      state.player.yaw = Math.PI;
    },
    setTime(hours) {
      state.time = hours;
    },
    setWanted(stars) {
      const heat = [0, 12, 30, 50, 70, 95][stars] ?? 0;
      state.police.heat = heat;
    },
    enterCar(name) {
      const car = state.traffic.parked.find((p) => !p.stolen && (!name || p.model.name === name));
      if (car) state.enterCar(car);
      return !!car;
    },
    shoot() {
      state.tryShoot();
    },
    clearOverlays() {
      // Zero the flash message, district splash and vehicle plate timers so
      // a screenshot shows the game, not a stale banner.
      state.missions.messageT = 0;
      if (state.hud) {
        state.hud.splashT = 0;
        state.hud.plateT = 0;
        const q = (id) => document.getElementById(id);
        if (q('flash')) q('flash').style.opacity = '0';
        if (q('district-splash')) q('district-splash').style.opacity = '0';
        if (q('vehicle-plate')) q('vehicle-plate').style.display = 'none';
      }
    },
    dump() {
      return JSON.stringify({
        mode: state.mode,
        x: Math.round(state.player.x * 10) / 10,
        z: Math.round(state.player.z * 10) / 10,
        yaw: Math.round(state.player.yaw * 100) / 100,
        inCar: !!state.car,
        carName: state.car ? state.car.userData.model.name : null,
        speed: state.car ? Math.round((state.car.userData.speed || 0) * 10) / 10 : 0,
        mag: state.combat.mag,
        wanted: state.police.wanted,
        cash: state.missions.cash,
        jobIndex: state.missions.jobIndex,
        time: Math.round(state.time * 100) / 100,
        errors: window.__pvErrors || [],
      });
    },
  };
  window.__pvErrors = [];
  window.addEventListener('error', (e) => {
    window.__pvErrors.push(String(e.message || e.error));
  });
  // __shotReady flips true once the renderer has produced real frames.
  Object.defineProperty(window, '__shotReady', {
    get() { return frames > 12; },
    configurable: true,
  });
  return {
    tickFrame() { frames++; },
  };
}

// Porto Verde — localStorage save/load: cash, jobs done, position, time
// of day, and the current mission step. A save is written on pause and on
// leaving the game; loading restores it from the title screen.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      cash: state.missions.cash,
      jobsDone: state.missions.jobsDone,
      jobIndex: state.missions.jobIndex,
      stepIndex: state.missions.stepIndex,
      x: state.player.x,
      z: state.player.z,
      time: state.time,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}

// Porto Verde — story jobs: three scripted jobs in order, then repeatable
// courier jobs for cash. Tracks the current objective, its map position,
// progress, and the player's cash / jobs done / cars stolen.

import { JOBS, LANDMARKS } from './config.js';
import { dist2d } from './random.js';

export function makeMissions() {
  return {
    jobIndex: 0, // 0..2 story, then -1 (free roam / couriers)
    stepIndex: 0,
    cash: 750,
    jobsDone: 0,
    carsStolen: 0,
    courier: null,
    message: '',
    messageT: 0,
    objective: { ...LANDMARKS.docks },
    objectiveText: 'Meet Dre at the Docks',
    jobName: 'JOB 1 — THE PICKUP',
    cleared: 0,
  };
}

function currentJob(m) {
  return JOBS[m.jobIndex];
}

function currentStep(m) {
  const job = currentJob(m);
  return job ? job.steps[m.stepIndex] : null;
}

export function objectiveOf(m) {
  const step = currentStep(m);
  if (step) {
    const lm = LANDMARKS[step.at];
    return { x: lm.x, z: lm.z, text: step.text, name: lm.name };
  }
  if (m.courier) {
    const lm = LANDMARKS[m.courier.at];
    return { x: lm.x, z: lm.z, text: m.courier.text, name: lm.name };
  }
  return { x: 0, z: 0, text: 'Free roam — Porto Verde is yours', name: 'Porto Verde' };
}

// Advance the mission state when the player reaches the objective.
// ctx: {x, z, inCar, carName, gangAlive, onKill}. Returns a flash message.
export function updateMissions(dt, m, ctx) {
  const obj = objectiveOf(m);
  m.objective = obj;
  const step = currentStep(m);
  let flash = '';
  if (step) {
    const d = dist2d(ctx.x, ctx.z, obj.x, obj.z);
    if (step.clear) {
      // Job 3 step 1: wait until the gang is cleared.
      if (ctx.gangAlive === 0 && m.cleared < step.clear) {
        m.cleared = step.clear;
        flash = 'Warehouse 7 clear — take the Solstice GT!';
        m.stepIndex++;
      }
    } else if (step.steal) {
      if (ctx.inCar && ctx.carName === 'Solstice GT') {
        flash = 'Solstice GT stolen — deliver it to Vega\'s Garage!';
        m.stepIndex++;
      }
    } else if (step.deliver) {
      if (ctx.inCar && ctx.carName === 'Solstice GT' && d < 12) {
        flash = 'Delivered! The Harbor Job pays $1,000.';
        m.cash += currentJob(m).pay;
        m.jobsDone++;
        m.jobIndex++;
        m.stepIndex = 0;
        m.cleared = 0;
        startCourier(m);
      }
    } else if (d < 10) {
      if (m.jobIndex === 1 && m.stepIndex === 0) {
        // Job 2 "Heat": reaching the safehouse also clears the heat.
        flash = 'You lost them. Heat pays $300.';
        m.cash += currentJob(m).pay;
        m.jobsDone++;
        m.jobIndex++;
        m.stepIndex = 0;
        startCourier(m);
        return { flash, clearHeat: true };
      }
      if (m.stepIndex === currentJob(m).steps.length - 1) {
        flash = `Job done — ${currentJob(m).name} pays $${currentJob(m).pay}.`;
        m.cash += currentJob(m).pay;
        m.jobsDone++;
        m.jobIndex++;
        m.stepIndex = 0;
        startCourier(m);
      } else {
        flash = 'Package picked up — deliver it to Motel Sol.';
        m.stepIndex++;
      }
    }
  } else if (m.courier) {
    const d = dist2d(ctx.x, ctx.z, obj.x, obj.z);
    if (d < 10) {
      m.cash += m.courier.pay;
      flash = `Courier done — +$${m.courier.pay}.`;
      startCourier(m);
    }
  }
  if (flash) {
    m.message = flash;
    m.messageT = 4;
  }
  if (m.messageT > 0) m.messageT -= dt;
  return { flash };
}

const COURIER_SPOTS = ['docks', 'motel', 'hospital', 'plaza', 'garage', 'beach'];

function startCourier(m) {
  const at = COURIER_SPOTS[Math.floor(Math.random() * COURIER_SPOTS.length)];
  const pay = 150 + Math.floor(Math.random() * 6) * 50;
  m.courier = { at, pay, text: `Courier: deliver to ${LANDMARKS[at].name} (+$${pay})` };
}

export function missionList(m) {
  const rows = JOBS.map((job, i) => ({
    name: job.name,
    pay: job.pay,
    state: i < m.jobIndex ? 'DONE' : i === m.jobIndex ? 'ACTIVE' : 'LOCKED',
  }));
  if (m.jobIndex >= JOBS.length) rows.push({ name: 'COURIER RUNS', pay: 0, state: 'ACTIVE' });
  return rows;
}

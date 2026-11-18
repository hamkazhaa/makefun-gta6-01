// Porto Verde — fully synthesized WebAudio: engine hum while driving,
// gunshots, a police siren, and three procedural radio stations (Q cycles).
// No audio files, no network. Everything is guarded so the game still runs
// when audio is unavailable (headless playtests).

import { RADIO } from './config.js';

export function makeAudio() {
  let ctx = null;
  let master = null;
  let radioNodes = null;
  let engineNodes = null;
  const state = {
    station: 0,
    trackT: 0,
    trackName: '',
    muted: false,
  };

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  function noteFreq(root, semis) {
    return root * Math.pow(2, semis / 12);
  }

  // A simple looping groove: bass line + hats + a plucked lead.
  function startRadio() {
    if (!ctx || radioNodes) return;
    const st = RADIO[state.station];
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    gain.connect(master);
    const stepDur = 60 / st.bpm / 2;
    let step = 0;
    const timer = setInterval(() => {
      if (!ctx || state.muted) return;
      const now = ctx.currentTime;
      const bar = Math.floor(step / 8) % 4;
      const scale = st.mode;
      const bassNote = scale[(step * 2 + bar) % scale.length];
      // Bass.
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = noteFreq(st.root / 2, bassNote);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.5, now);
      og.gain.exponentialRampToValueAtTime(0.01, now + stepDur * 0.95);
      o.connect(og);
      og.connect(gain);
      o.start(now);
      o.stop(now + stepDur);
      // Lead pluck every other step.
      if (step % 2 === 0) {
        const l = ctx.createOscillator();
        l.type = 'square';
        l.frequency.value = noteFreq(st.root * 2, scale[(step + bar * 3) % scale.length]);
        const lg = ctx.createGain();
        lg.gain.setValueAtTime(0.08, now);
        lg.gain.exponentialRampToValueAtTime(0.01, now + stepDur * 0.8);
        l.connect(lg);
        lg.connect(gain);
        l.start(now);
        l.stop(now + stepDur * 0.85);
      }
      // Hat tick.
      if (step % 2 === 1) {
        const n = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, 2205, 44100);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        n.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.value = 0.05;
        n.connect(ng);
        ng.connect(gain);
        n.start(now);
      }
      step++;
    }, stepDur * 1000);
    radioNodes = { gain, timer };
    state.trackName = `${st.name} — Porto Groove ${1 + (Math.floor(Math.random() * 3))}`;
  }

  function stopRadio() {
    if (radioNodes) {
      clearInterval(radioNodes.timer);
      try { radioNodes.gain.disconnect(); } catch (e) {}
      radioNodes = null;
    }
  }

  return {
    state,
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
      startRadio();
    },
    cycleStation() {
      state.station = (state.station + 1) % RADIO.length;
      stopRadio();
      startRadio();
      return RADIO[state.station].name;
    },
    stationName() {
      return RADIO[state.station].name;
    },
    gunshot() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      const n = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, 8820, 44100);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      n.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, now);
      g.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      n.connect(g);
      g.connect(master);
      n.start(now);
    },
    engine(speed01) {
      if (!ensure()) return;
      if (!engineNodes) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 55;
        const g = ctx.createGain();
        g.gain.value = 0;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 320;
        o.connect(f);
        f.connect(g);
        g.connect(master);
        o.start();
        engineNodes = { o, g };
      }
      const target = speed01 > 0.02 ? 0.05 + speed01 * 0.09 : 0;
      engineNodes.g.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineNodes.o.frequency.setTargetAtTime(55 + speed01 * 110, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!ensure()) return;
      if (on && !this._siren) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        const g = ctx.createGain();
        g.gain.value = 0.05;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.7;
        const lg = ctx.createGain();
        lg.gain.value = 320;
        lfo.connect(lg);
        lg.connect(o.frequency);
        o.frequency.value = 760;
        o.connect(g);
        g.connect(master);
        o.start();
        lfo.start();
        this._siren = { o, lfo, g };
      } else if (!on && this._siren) {
        try { this._siren.o.stop(); this._siren.lfo.stop(); } catch (e) {}
        this._siren = null;
      }
    },
    setMuted(m) {
      state.muted = m;
      if (master) master.gain.value = m ? 0 : 0.4;
    },
  };
}

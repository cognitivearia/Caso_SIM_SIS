import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';

const PARTICLE_COUNT = 131072;
const PULSE_ATTACK = 0.04;
const PULSE_HOLD = 0.12;
const PULSE_DECAY = 0.55;
const PULSE_TOTAL = PULSE_ATTACK + PULSE_HOLD + PULSE_DECAY;

async function main() {
  const mount = document.querySelector('#app');

  if (!WebGPU.isAvailable()) {
    mount.appendChild(WebGPU.getErrorMessage());
    throw new Error('Este proyecto requiere WebGPU para ejecutar compute shaders.');
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050607');

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
  camera.position.set(0, 0, 11);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  mount.appendChild(renderer.domElement);
  await renderer.init();

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0, 0);

  const params = createParameters();
  const simulation = createSimulation({ renderer, scene, params, count: PARTICLE_COUNT });

  // Sin armature / wireframe del orbe
  const axes = new THREE.AxesHelper(1.5);
  axes.visible = false;
  scene.add(axes);

  let paused = false;
  let mode = 'LAB';
  let elapsed = 0;
  let panel;

  const pulses = {
    mace: { t0: -999, live: false },
    wave: { t0: -999, live: false }
  };

  // Envolvente ADS: sube, sostiene un instante y cae a 0 (pulso único)
  const envelope = (t0) => {
    const age = elapsed - t0;
    if (age < 0 || age >= PULSE_TOTAL) return 0;
    if (age < PULSE_ATTACK) return age / PULSE_ATTACK;
    if (age < PULSE_ATTACK + PULSE_HOLD) return 1;
    const decayAge = age - PULSE_ATTACK - PULSE_HOLD;
    return 1 - decayAge / PULSE_DECAY;
  };

  const anyPulseLive = () => pulses.mace.live || pulses.wave.live;

  const updateHud = () => {
    const mace = pulses.mace.live ? 'pulse' : '—';
    const wave = pulses.wave.live ? 'pulse' : '—';
    if (mode === 'LAB') {
      hud.innerHTML = `<strong>LAB</strong> · P: performance · R: reset<br>1: maza [${mace}] · 2: ondas X [${wave}] · cada pulso vuelve al orbe`;
    } else {
      hud.innerHTML = `<strong>PERFORMANCE</strong> · 1: maza [${mace}] · 2: ondas X [${wave}]`;
    }
  };

  const triggerPulse = (name) => {
    // Reinicia el pulso desde cero (siempre único, no acumula estado ON)
    pulses[name].t0 = elapsed;
    pulses[name].live = true;
    if (name === 'wave') {
      params.waveOriginTime.value = elapsed;
    }
    params.recoveryBoost.value = 1.0;
    updateHud();
  };

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel.setVisible(lab);
    axes.visible = lab;
    updateHud();
  };

  panel = createLabPanel({
    params,
    onReset: () => {
      pulses.mace.t0 = -999;
      pulses.wave.t0 = -999;
      pulses.mace.live = false;
      pulses.wave.live = false;
      params.macePulse.value = 0;
      params.wavePulse.value = 0;
      params.recoveryBoost.value = 1;
      simulation.reset();
      updateHud();
    },
    onPulseActor: triggerPulse,
    onModeChange: () => setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB'),
    onPauseChange: () => { paused = !paused; }
  });

  const hud = document.createElement('div');
  hud.className = 'hud';
  document.body.append(hud);
  setMode('LAB');

  addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
    if (event.code === 'KeyR') {
      pulses.mace.t0 = -999;
      pulses.wave.t0 = -999;
      pulses.mace.live = false;
      pulses.wave.live = false;
      params.macePulse.value = 0;
      params.wavePulse.value = 0;
      params.recoveryBoost.value = 1;
      simulation.reset();
      updateHud();
    }
    if (event.code === 'Digit1') triggerPulse('mace');
    if (event.code === 'Digit2') triggerPulse('wave');
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  simulation.reset();

  renderer.setAnimationLoop(() => {
    if (!paused) {
      elapsed += params.dt.value * params.timeScale.value;
      params.time.value = elapsed;

      const maceEnv = envelope(pulses.mace.t0);
      const waveEnv = envelope(pulses.wave.t0);
      // Corte duro a 0 cuando el pulso termina
      params.macePulse.value = maceEnv > 0.001 ? maceEnv : 0;
      params.wavePulse.value = waveEnv > 0.001 ? waveEnv : 0;

      let hudDirty = false;
      if (pulses.mace.live && maceEnv <= 0) {
        pulses.mace.live = false;
        params.macePulse.value = 0;
        hudDirty = true;
      }
      if (pulses.wave.live && waveEnv <= 0) {
        pulses.wave.live = false;
        params.wavePulse.value = 0;
        hudDirty = true;
      }

      // Tras el pulso, refuerza resorte/drag unos frames para volver al orbe limpio
      if (!anyPulseLive()) {
        params.recoveryBoost.value = 2.4;
      } else {
        params.recoveryBoost.value = 1.0;
      }

      if (hudDirty) updateHud();

      simulation.stepSimulation();
    }
    orbit.update();
    renderer.render(scene, camera);
  });
}

main().catch((error) => {
  console.error(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:16px;white-space:pre-wrap;color:#fff;z-index:50';
  pre.textContent = String(error?.stack || error);
  document.body.append(pre);
});

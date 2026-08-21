import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';

const PARTICLE_COUNT = 524288;

function createPerfChaosSlider(params) {
  const wrap = document.createElement('div');
  wrap.className = 'perf-chaos hidden';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '6';
  input.step = '0.1';
  input.value = String(params.layer1Chaos.value);
  input.setAttribute('aria-label', 'caos');
  input.addEventListener('input', () => {
    params.layer1Chaos.value = Number(input.value);
  });
  wrap.append(input);
  document.body.append(wrap);
  return {
    element: wrap,
    setVisible(visible) {
      wrap.classList.toggle('hidden', !visible);
    },
    sync() {
      input.value = String(params.layer1Chaos.value);
    }
  };
}

async function main() {
  const mount = document.querySelector('#app');

  if (!WebGPU.isAvailable()) {
    mount.appendChild(WebGPU.getErrorMessage());
    throw new Error('Este proyecto requiere WebGPU para ejecutar compute shaders.');
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07080a');

  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 80);
  camera.position.set(0, 5.2, 9.5);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  mount.appendChild(renderer.domElement);
  await renderer.init();

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0.4, 2.5);
  orbit.maxPolarAngle = Math.PI * 0.48;
  orbit.minDistance = 4;
  orbit.maxDistance = 18;

  const params = createParameters();
  const simulation = createSimulation({ renderer, scene, params, count: PARTICLE_COUNT });

  let paused = false;
  let mode = 'LAB';
  let elapsed = 0;
  let panel;
  let ready = false;

  const layers = {
    cornerVortices: { on: false },
    neuralNet: { on: false },
    sawLines: { on: false }
  };

  const perfChaos = createPerfChaosSlider(params);

  const updateHud = () => {
    const l1 = layers.cornerVortices.on ? 'ON' : 'off';
    const l2 = layers.neuralNet.on ? 'ON' : 'off';
    const l3 = layers.sawLines.on ? 'ON' : 'off';
    if (mode === 'LAB') {
      hud.innerHTML = `<strong>LAB</strong> · P: performance · R: reset<br>1: vórtices [${l1}] · 2: neuronas [${l2}] · 3: sierra [${l3}]`;
    } else {
      hud.innerHTML = `<strong>PERFORMANCE</strong> · 1 [${l1}] · 2 [${l2}] · 3 [${l3}]`;
    }
  };

  const setLayer1 = (on) => {
    layers.cornerVortices.on = on;
    params.layer1Enabled.value = on ? 1 : 0;
    panel?.refresh();
    updateHud();
  };

  const setLayer2 = (on) => {
    layers.neuralNet.on = on;
    params.layer2Enabled.value = on ? 1 : 0;
    panel?.refresh();
    updateHud();
  };

  const setLayer3 = (on) => {
    layers.sawLines.on = on;
    params.layer3Enabled.value = on ? 1 : 0;
    panel?.refresh();
    updateHud();
  };

  const toggleLayer1 = () => setLayer1(!layers.cornerVortices.on);
  const toggleLayer2 = () => setLayer2(!layers.neuralNet.on);
  const toggleLayer3 = () => setLayer3(!layers.sawLines.on);

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel.setVisible(lab);
    perfChaos.setVisible(!lab);
    if (!lab) perfChaos.sync();
    updateHud();
  };

  const hardReset = () => {
    setLayer1(false);
    setLayer2(false);
    setLayer3(false);
    elapsed = 0;
    params.time.value = 0;
    simulation.reset();
    updateHud();
  };

  panel = createLabPanel({
    params,
    layers,
    onReset: hardReset,
    onToggleLayer: (id) => {
      if (id === 'cornerVortices') toggleLayer1();
      if (id === 'neuralNet') toggleLayer2();
      if (id === 'sawLines') toggleLayer3();
    },
    onModeChange: () => setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB'),
    onPauseChange: () => { paused = !paused; },
    onChaosChange: () => perfChaos.sync()
  });

  const hud = document.createElement('div');
  hud.className = 'hud';
  document.body.append(hud);
  setMode('LAB');

  addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
    if (event.code === 'KeyR') hardReset();
    if (event.code === 'Digit1') toggleLayer1();
    if (event.code === 'Digit2') toggleLayer2();
    if (event.code === 'Digit3') toggleLayer3();
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  simulation.reset();
  ready = true;

  renderer.setAnimationLoop(() => {
    if (ready && !paused) {
      elapsed += params.dt.value * params.timeScale.value;
      params.time.value = elapsed;
      try {
        simulation.stepSimulation();
      } catch (err) {
        console.error('Compute update failed:', err);
      }
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

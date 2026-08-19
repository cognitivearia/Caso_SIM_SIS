import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';

const PARTICLE_COUNT = 131072;

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

  const orbHelper = new THREE.Mesh(
    new THREE.SphereGeometry(params.orbRadius.value, 24, 16),
    new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.12 })
  );
  scene.add(orbHelper);

  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  let paused = false;
  let mode = 'LAB';
  let elapsed = 0;
  let panel;

  const actorLabel = (enabled) => enabled > 0 ? 'ON' : 'off';

  const updateHud = () => {
    const mace = actorLabel(params.maceEnabled.value);
    const wave = actorLabel(params.waveEnabled.value);
    if (mode === 'LAB') {
      hud.innerHTML = `<strong>LAB</strong> · P: performance · R: reset<br>1: maza [${mace}] · 2: ondas X [${wave}]`;
    } else {
      hud.innerHTML = `<strong>PERFORMANCE</strong> · P: lab · 1: maza [${mace}] · 2: ondas X [${wave}]`;
    }
  };

  const toggleActor = (name) => {
    if (name === 'mace') {
      params.maceEnabled.value = params.maceEnabled.value > 0 ? 0 : 1;
    } else if (name === 'wave') {
      params.waveEnabled.value = params.waveEnabled.value > 0 ? 0 : 1;
    }
    panel?.refresh();
    updateHud();
  };

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel.setVisible(lab);
    axes.visible = lab;
    orbHelper.visible = lab;
    updateHud();
  };

  panel = createLabPanel({
    params,
    onReset: () => simulation.reset(),
    onToggleActor: toggleActor,
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
    if (event.code === 'KeyR') simulation.reset();
    if (event.code === 'Digit1') toggleActor('mace');
    if (event.code === 'Digit2') toggleActor('wave');
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

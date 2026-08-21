function rangeRow(parent, label, object, key, min, max, step, onInput, getValue) {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  const lab = document.createElement('label');
  const name = document.createElement('span');
  const value = document.createElement('span');
  value.className = 'value';
  name.textContent = label;
  lab.append(name, value);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(object[key]);
  const refresh = () => {
    object[key] = Number(input.value);
    value.textContent = Number(input.value).toFixed(step < 0.01 ? 3 : 2);
    onInput?.(object[key]);
  };
  input.addEventListener('input', refresh);
  refresh();
  wrap.append(lab, input);
  parent.append(wrap);
  return {
    input,
    refresh() {
      if (getValue) {
        const next = Number(getValue());
        object[key] = next;
        input.value = String(next);
        value.textContent = next.toFixed(step < 0.01 ? 3 : 2);
      }
    }
  };
}

function button(parent, label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  parent.append(b);
  return b;
}

export function createLabPanel({
  params,
  layers,
  onReset,
  onToggleLayer,
  onModeChange,
  onPauseChange,
  onChaosChange
}) {
  const refreshers = [];
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.innerHTML = `
    <h1>Horizon · Layer Forces</h1>
    <p>Base: plano olas/dunas. Capas on/off con cross-talk. Look: estelas + bloom.</p>
  `;

  const sim = document.createElement('div');
  sim.className = 'group';
  sim.innerHTML = '<h2>Base · plano</h2>';
  panel.append(sim);

  const state = {
    timeScale: params.timeScale.value,
    particleSize: params.particleSize.value,
    waveAmp: params.waveAmp.value,
    waveSpeed: params.waveSpeed.value,
    planeSpring: params.planeSpring.value,
    trailStretch: params.trailStretch.value,
    trailDamp: params.trailDamp.value,
    glowFalloff: params.glowFalloff.value,
    bloomStrength: params.bloomStrength.value,
    bloomRadius: params.bloomRadius.value,
    bloomThreshold: params.bloomThreshold.value,
    layer1Attract: params.layer1Attract.value,
    layer1Vortex: params.layer1Vortex.value,
    layer1Flow: params.layer1Flow.value,
    layer1Chaos: params.layer1Chaos.value,
    layer2Spring: params.layer2Spring.value,
    layer2BranchLen: params.layer2BranchLen.value,
    layer2Pulse: params.layer2Pulse.value,
    layer2Organic: params.layer2Organic.value,
    layer2Thickness: params.layer2Thickness.value,
    layer3Spring: params.layer3Spring.value,
    layer3Density: params.layer3Density.value,
    layer3Amplitude: params.layer3Amplitude.value,
    layer3Frequency: params.layer3Frequency.value,
    layer3Speed: params.layer3Speed.value,
    layer3Span: params.layer3Span.value,
    layer4Spring: params.layer4Spring.value,
    layer4Radius: params.layer4Radius.value,
    layer4Depth: params.layer4Depth.value,
    layer4Turns: params.layer4Turns.value,
    layer4Spin: params.layer4Spin.value,
    layer4Streak: params.layer4Streak.value,
    layer4PathSpeed: params.layer4PathSpeed.value,
    layerCrossTalk: params.layerCrossTalk.value
  };

  refreshers.push(rangeRow(sim, 'timeScale', state, 'timeScale', 0, 2, 0.01, (v) => params.timeScale.value = v, () => params.timeScale.value));
  refreshers.push(rangeRow(sim, 'particleSize', state, 'particleSize', 0.004, 0.05, 0.001, (v) => params.particleSize.value = v, () => params.particleSize.value));
  refreshers.push(rangeRow(sim, 'waveAmp', state, 'waveAmp', 0, 0.8, 0.01, (v) => params.waveAmp.value = v, () => params.waveAmp.value));
  refreshers.push(rangeRow(sim, 'waveSpeed', state, 'waveSpeed', 0, 3, 0.05, (v) => params.waveSpeed.value = v, () => params.waveSpeed.value));
  refreshers.push(rangeRow(sim, 'planeSpring', state, 'planeSpring', 1, 16, 0.1, (v) => params.planeSpring.value = v, () => params.planeSpring.value));

  const lookGroup = document.createElement('div');
  lookGroup.className = 'group';
  lookGroup.innerHTML = '<h2>Look · luz</h2>';
  panel.append(lookGroup);
  refreshers.push(rangeRow(lookGroup, 'trail stretch', state, 'trailStretch', 1, 5, 0.05, (v) => params.trailStretch.value = v, () => params.trailStretch.value));
  refreshers.push(rangeRow(lookGroup, 'trail persist', state, 'trailDamp', 0.7, 0.98, 0.01, (v) => params.trailDamp.value = v, () => params.trailDamp.value));
  refreshers.push(rangeRow(lookGroup, 'glow soft', state, 'glowFalloff', 3, 14, 0.1, (v) => params.glowFalloff.value = v, () => params.glowFalloff.value));
  refreshers.push(rangeRow(lookGroup, 'bloom', state, 'bloomStrength', 0, 1.5, 0.05, (v) => params.bloomStrength.value = v, () => params.bloomStrength.value));
  refreshers.push(rangeRow(lookGroup, 'bloom radius', state, 'bloomRadius', 0, 1, 0.05, (v) => params.bloomRadius.value = v, () => params.bloomRadius.value));
  refreshers.push(rangeRow(lookGroup, 'bloom threshold', state, 'bloomThreshold', 0, 1, 0.05, (v) => params.bloomThreshold.value = v, () => params.bloomThreshold.value));

  const layersGroup = document.createElement('div');
  layersGroup.className = 'group';
  layersGroup.innerHTML = '<h2>Capas (presets)</h2>';
  panel.append(layersGroup);

  refreshers.push(rangeRow(layersGroup, 'cross-talk', state, 'layerCrossTalk', 0, 1.2, 0.05, (v) => params.layerCrossTalk.value = v, () => params.layerCrossTalk.value));

  const layerStatus = document.createElement('p');
  layerStatus.style.margin = '6px 0 0';
  const refreshLayerStatus = () => {
    const l1 = layers.cornerVortices.on ? 'ON' : 'off';
    const l2 = layers.neuralNet.on ? 'ON' : 'off';
    const l3 = layers.sawLines.on ? 'ON' : 'off';
    const l4 = layers.maelstrom.on ? 'ON' : 'off';
    layerStatus.textContent = `1: ${l1} · 2: ${l2} · 3: ${l3} · 4 torbellino: ${l4}`;
  };
  refreshLayerStatus();
  layersGroup.append(layerStatus);
  refreshers.push({ refresh: refreshLayerStatus });

  button(layersGroup, '1 · Vórtices esquinas', () => onToggleLayer('cornerVortices'));
  refreshers.push(rangeRow(layersGroup, 'attract', state, 'layer1Attract', 0, 16, 0.1, (v) => params.layer1Attract.value = v, () => params.layer1Attract.value));
  refreshers.push(rangeRow(layersGroup, 'vortex spin', state, 'layer1Vortex', 0, 12, 0.1, (v) => params.layer1Vortex.value = v, () => params.layer1Vortex.value));
  refreshers.push(rangeRow(layersGroup, 'flow', state, 'layer1Flow', 0, 8, 0.1, (v) => params.layer1Flow.value = v, () => params.layer1Flow.value));
  refreshers.push(rangeRow(
    layersGroup,
    'chaos',
    state,
    'layer1Chaos',
    0,
    6,
    0.1,
    (v) => {
      params.layer1Chaos.value = v;
      onChaosChange?.();
    },
    () => params.layer1Chaos.value
  ));

  button(layersGroup, '2 · Redes neuronales', () => onToggleLayer('neuralNet'));
  refreshers.push(rangeRow(layersGroup, 'neural spring', state, 'layer2Spring', 4, 24, 0.1, (v) => params.layer2Spring.value = v, () => params.layer2Spring.value));
  refreshers.push(rangeRow(layersGroup, 'branch length', state, 'layer2BranchLen', 1.5, 6, 0.05, (v) => params.layer2BranchLen.value = v, () => params.layer2BranchLen.value));
  refreshers.push(rangeRow(layersGroup, 'thickness', state, 'layer2Thickness', 0.02, 0.25, 0.005, (v) => params.layer2Thickness.value = v, () => params.layer2Thickness.value));
  refreshers.push(rangeRow(layersGroup, 'soma pulse', state, 'layer2Pulse', 0, 0.3, 0.01, (v) => params.layer2Pulse.value = v, () => params.layer2Pulse.value));
  refreshers.push(rangeRow(layersGroup, 'organic', state, 'layer2Organic', 0, 1.5, 0.05, (v) => params.layer2Organic.value = v, () => params.layer2Organic.value));

  button(layersGroup, '3 · Líneas sierra armónicas', () => onToggleLayer('sawLines'));
  refreshers.push(rangeRow(layersGroup, 'saw spring', state, 'layer3Spring', 4, 24, 0.1, (v) => params.layer3Spring.value = v, () => params.layer3Spring.value));
  refreshers.push(rangeRow(layersGroup, 'density', state, 'layer3Density', 0, 1, 0.01, (v) => params.layer3Density.value = v, () => params.layer3Density.value));
  refreshers.push(rangeRow(layersGroup, 'spacing', state, 'layer3Span', 3, 12, 0.1, (v) => params.layer3Span.value = v, () => params.layer3Span.value));
  refreshers.push(rangeRow(layersGroup, 'amplitude', state, 'layer3Amplitude', 0.05, 1.5, 0.05, (v) => params.layer3Amplitude.value = v, () => params.layer3Amplitude.value));
  refreshers.push(rangeRow(layersGroup, 'frequency', state, 'layer3Frequency', 0.1, 2, 0.05, (v) => params.layer3Frequency.value = v, () => params.layer3Frequency.value));
  refreshers.push(rangeRow(layersGroup, 'speed', state, 'layer3Speed', 0.1, 3, 0.05, (v) => params.layer3Speed.value = v, () => params.layer3Speed.value));

  button(layersGroup, '4 · Torbellino (−Z)', () => onToggleLayer('maelstrom'));
  refreshers.push(rangeRow(layersGroup, 'mael spring', state, 'layer4Spring', 4, 24, 0.1, (v) => params.layer4Spring.value = v, () => params.layer4Spring.value));
  refreshers.push(rangeRow(layersGroup, 'radius', state, 'layer4Radius', 1.5, 6, 0.1, (v) => params.layer4Radius.value = v, () => params.layer4Radius.value));
  refreshers.push(rangeRow(layersGroup, 'depth (−Z)', state, 'layer4Depth', 3, 14, 0.1, (v) => params.layer4Depth.value = v, () => params.layer4Depth.value));
  refreshers.push(rangeRow(layersGroup, 'turns', state, 'layer4Turns', 1, 10, 0.1, (v) => params.layer4Turns.value = v, () => params.layer4Turns.value));
  refreshers.push(rangeRow(layersGroup, 'spin', state, 'layer4Spin', 0, 4, 0.05, (v) => params.layer4Spin.value = v, () => params.layer4Spin.value));
  refreshers.push(rangeRow(layersGroup, 'streak', state, 'layer4Streak', 0, 0.6, 0.01, (v) => params.layer4Streak.value = v, () => params.layer4Streak.value));
  refreshers.push(rangeRow(layersGroup, 'path speed', state, 'layer4PathSpeed', 0, 0.5, 0.01, (v) => params.layer4PathSpeed.value = v, () => params.layer4PathSpeed.value));

  const actions = document.createElement('div');
  actions.className = 'group';
  actions.innerHTML = '<h2>Acciones</h2>';
  panel.append(actions);
  button(actions, 'Reset plano (R)', onReset);
  button(actions, 'Pausar / continuar', () => onPauseChange());
  button(actions, 'LAB / PERFORMANCE (P)', () => onModeChange());

  document.body.append(panel);

  return {
    element: panel,
    setVisible(visible) { panel.classList.toggle('hidden', !visible); },
    refresh() { for (const item of refreshers) item.refresh(); }
  };
}

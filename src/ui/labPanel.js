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

export function createLabPanel({ params, layers, onReset, onToggleLayer, onModeChange, onPauseChange }) {
  const refreshers = [];
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.innerHTML = `
    <h1>Horizon · Layer Forces</h1>
    <p>Base: plano hacia el horizonte (olas/dunas). Los presets son <strong>capas</strong> on/off sobre esa base. Sin mouse.</p>
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
    layer1Attract: params.layer1Attract.value,
    layer1OrbRadius: params.layer1OrbRadius.value,
    layer1PulseAmp: params.layer1PulseAmp.value,
    layer1PulseSpeed: params.layer1PulseSpeed.value
  };

  refreshers.push(rangeRow(sim, 'timeScale', state, 'timeScale', 0, 2, 0.01, (v) => params.timeScale.value = v, () => params.timeScale.value));
  refreshers.push(rangeRow(sim, 'particleSize', state, 'particleSize', 0.005, 0.08, 0.001, (v) => params.particleSize.value = v, () => params.particleSize.value));
  refreshers.push(rangeRow(sim, 'waveAmp', state, 'waveAmp', 0, 0.8, 0.01, (v) => params.waveAmp.value = v, () => params.waveAmp.value));
  refreshers.push(rangeRow(sim, 'waveSpeed', state, 'waveSpeed', 0, 3, 0.05, (v) => params.waveSpeed.value = v, () => params.waveSpeed.value));
  refreshers.push(rangeRow(sim, 'planeSpring', state, 'planeSpring', 1, 16, 0.1, (v) => params.planeSpring.value = v, () => params.planeSpring.value));

  const layersGroup = document.createElement('div');
  layersGroup.className = 'group';
  layersGroup.innerHTML = '<h2>Capas (presets)</h2><p>1 activa/desactiva sobre el mismo plano. Formación → pulso automático.</p>';
  panel.append(layersGroup);

  const layerStatus = document.createElement('p');
  layerStatus.style.margin = '6px 0 0';
  const refreshLayerStatus = () => {
    const on = layers.orbSides.on;
    const phase = layers.orbSides.phase;
    layerStatus.textContent = on
      ? `Capa 1: ON · fase ${phase === 'form' ? 'formación' : 'pulso lento'}`
      : 'Capa 1: OFF';
  };
  refreshLayerStatus();
  layersGroup.append(layerStatus);
  refreshers.push({ refresh: refreshLayerStatus });

  button(layersGroup, '1 · Orbes laterales (toggle)', () => onToggleLayer('orbSides'));
  refreshers.push(rangeRow(layersGroup, 'attract', state, 'layer1Attract', 1, 16, 0.1, (v) => params.layer1Attract.value = v, () => params.layer1Attract.value));
  refreshers.push(rangeRow(layersGroup, 'orbRadius', state, 'layer1OrbRadius', 0.2, 1.4, 0.05, (v) => params.layer1OrbRadius.value = v, () => params.layer1OrbRadius.value));
  refreshers.push(rangeRow(layersGroup, 'pulseAmp', state, 'layer1PulseAmp', 0, 0.6, 0.01, (v) => params.layer1PulseAmp.value = v, () => params.layer1PulseAmp.value));
  refreshers.push(rangeRow(layersGroup, 'pulseSpeed', state, 'layer1PulseSpeed', 0.2, 4, 0.05, (v) => params.layer1PulseSpeed.value = v, () => params.layer1PulseSpeed.value));

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

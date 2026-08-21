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

export function createLabPanel({ params, onReset, onPulseActor, onModeChange, onPauseChange }) {
  const refreshers = [];
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.innerHTML = `
    <h1>Orb · Force Actors</h1>
    <p>Orbe central. <strong>1</strong> y <strong>2</strong> disparan pulsaciones (no toggle).</p>
  `;

  const sim = document.createElement('div');
  sim.className = 'group';
  sim.innerHTML = '<h2>Simulación</h2>';
  panel.append(sim);

  const state = {
    timeScale: params.timeScale.value,
    maxSpeed: params.maxSpeed.value,
    particleSize: params.particleSize.value,
    orbRadius: params.orbRadius.value,
    orbSpringStrength: params.orbSpringStrength.value,
    dragCoefficient: params.dragCoefficient.value
  };

  refreshers.push(rangeRow(sim, 'timeScale', state, 'timeScale', 0, 2, 0.01, (v) => params.timeScale.value = v, () => params.timeScale.value));
  refreshers.push(rangeRow(sim, 'maxSpeed', state, 'maxSpeed', 0.2, 12, 0.1, (v) => params.maxSpeed.value = v, () => params.maxSpeed.value));
  refreshers.push(rangeRow(sim, 'particleSize', state, 'particleSize', 0.005, 0.1, 0.001, (v) => params.particleSize.value = v, () => params.particleSize.value));
  refreshers.push(rangeRow(sim, 'orbRadius', state, 'orbRadius', 1, 4, 0.05, (v) => params.orbRadius.value = v, () => params.orbRadius.value));
  refreshers.push(rangeRow(sim, 'orbSpring', state, 'orbSpringStrength', 1, 20, 0.1, (v) => params.orbSpringStrength.value = v, () => params.orbSpringStrength.value));
  refreshers.push(rangeRow(sim, 'drag', state, 'dragCoefficient', 0, 1, 0.01, (v) => params.dragCoefficient.value = v, () => params.dragCoefficient.value));

  const actors = document.createElement('div');
  actors.className = 'group';
  actors.innerHTML = '<h2>Actores (pulsos)</h2><p>Cada disparo lanza una envolvente que decae sola.</p>';
  panel.append(actors);

  const actorState = {
    maceStrength: params.maceStrength.value,
    maceSpikeCount: params.maceSpikeCount.value,
    maceSharpness: params.maceSharpness.value,
    waveStrength: params.waveStrength.value,
    waveFrequency: params.waveFrequency.value,
    waveSpeed: params.waveSpeed.value,
    waveWidth: params.waveWidth.value
  };

  actors.insertAdjacentHTML('beforeend', '<h2 style="margin-top:12px">1 · Maza</h2>');
  button(actors, 'Disparar maza (1)', () => onPulseActor('mace'));
  refreshers.push(rangeRow(actors, 'maceStrength', actorState, 'maceStrength', 0, 50, 0.5, (v) => params.maceStrength.value = v, () => params.maceStrength.value));
  refreshers.push(rangeRow(actors, 'maceSpikeCount', actorState, 'maceSpikeCount', 4, 20, 1, (v) => params.maceSpikeCount.value = v, () => params.maceSpikeCount.value));
  refreshers.push(rangeRow(actors, 'maceSharpness', actorState, 'maceSharpness', 2, 20, 0.5, (v) => params.maceSharpness.value = v, () => params.maceSharpness.value));

  actors.insertAdjacentHTML('beforeend', '<h2 style="margin-top:12px">2 · Ondas X</h2>');
  button(actors, 'Disparar ondas (2)', () => onPulseActor('wave'));
  refreshers.push(rangeRow(actors, 'waveStrength', actorState, 'waveStrength', 0, 4, 0.05, (v) => params.waveStrength.value = v, () => params.waveStrength.value));
  refreshers.push(rangeRow(actors, 'waveFrequency', actorState, 'waveFrequency', 1, 10, 0.1, (v) => params.waveFrequency.value = v, () => params.waveFrequency.value));
  refreshers.push(rangeRow(actors, 'waveSpeed', actorState, 'waveSpeed', 0.5, 12, 0.1, (v) => params.waveSpeed.value = v, () => params.waveSpeed.value));
  refreshers.push(rangeRow(actors, 'waveWidth', actorState, 'waveWidth', 0.15, 1.5, 0.05, (v) => params.waveWidth.value = v, () => params.waveWidth.value));

  const actions = document.createElement('div');
  actions.className = 'group';
  actions.innerHTML = '<h2>Acciones</h2>';
  panel.append(actions);
  button(actions, 'Reset orbe (R)', onReset);
  button(actions, 'Pausar / continuar', () => onPauseChange());
  button(actions, 'LAB / PERFORMANCE (P)', () => onModeChange());

  document.body.append(panel);

  return {
    element: panel,
    setVisible(visible) { panel.classList.toggle('hidden', !visible); },
    refresh() { for (const item of refreshers) item.refresh(); }
  };
}

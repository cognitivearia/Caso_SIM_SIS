import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  color,
  cos,
  float,
  floor,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  sin,
  smoothstep,
  sqrt,
  step,
  uint,
  uv,
  vec3,
  vec4
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 524288 }) {
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');
  const homeBuffer = instancedArray(count, 'vec3');

  const initParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);
    const home = homeBuffer.element(i);

    const r1 = hash(i.add(uint(11)));
    const r2 = hash(i.add(uint(23)));
    const r3 = hash(i.add(uint(37)));

    const x = r1.sub(0.5).mul(12.0);
    const z = r2.mul(14.0).sub(2.0);
    const y = r3.sub(0.5).mul(0.04);

    home.assign(vec3(x, y, z));
    p.assign(vec3(x, y, z));
    v.assign(vec3(0.0, 0.0, 0.0));
  })().compute(count).setName('Initialize Horizon Plane');

  const updateParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);
    const home = homeBuffer.element(i);

    const dt = params.dt.mul(params.timeScale);
    const force = vec3(0.0).toVar();

    const hx = home.x;
    const hy = home.y;
    const hz = home.z;

    // --- BASE: plano que ondula ---
    const wave = sin(hx.mul(params.waveFreqX).add(params.time.mul(params.waveSpeed)))
      .mul(params.waveAmp)
      .add(
        sin(hz.mul(params.waveFreqZ).sub(params.time.mul(params.waveSpeed.mul(0.7))))
          .mul(params.waveAmp.mul(0.65))
      )
      .add(
        sin(hx.add(hz).mul(0.55).add(params.time.mul(0.9)))
          .mul(params.waveAmp.mul(0.35))
      );

    const baseTarget = vec3(hx, hy.add(wave), hz).toVar();
    const target = baseTarget.toVar();
    const springK = params.planeSpring.toVar();

    // --- CAPA 1: vórtices TR / BL ---
    const diag = hx.mul(0.65).sub(hz.sub(4.5).mul(0.55));
    const wTR = smoothstep(float(-0.35), float(1.1), diag).mul(params.layer1Enabled);
    const wBL = smoothstep(float(-0.35), float(1.1), diag.mul(-1.0)).mul(params.layer1Enabled);
    const seam = max(float(1.0).sub(abs(diag).mul(0.55)), float(0.0)).mul(params.layer1Enabled);

    const toTR = params.vortexTR.sub(p);
    const toBL = params.vortexBL.sub(p);
    const dTR = max(toTR.length(), params.layer1Softening);
    const dBL = max(toBL.length(), params.layer1Softening);
    const dirTR = toTR.div(dTR);
    const dirBL = toBL.div(dBL);

    const flowTR = vec3(0.80, 0.16, -0.58);
    const flowBL = vec3(-0.78, 0.10, 0.62);

    const pullTR = dirTR.mul(params.layer1Attract).div(dTR.add(0.5))
      .add(flowTR.mul(params.layer1Flow).mul(smoothstep(float(0.0), float(5.0), dTR)));
    const pullBL = dirBL.mul(params.layer1Attract).div(dBL.add(0.5))
      .add(flowBL.mul(params.layer1Flow).mul(smoothstep(float(0.0), float(5.0), dBL)));

    const swirlPhase = sin(params.time.mul(1.7)).mul(0.25).add(1.0);
    const spinTR = vec3(0.0, 1.0, 0.0).cross(dirTR)
      .mul(params.layer1Vortex).div(dTR.add(0.35)).mul(swirlPhase);
    const spinBL = vec3(0.0, 1.0, 0.0).cross(dirBL)
      .mul(params.layer1Vortex.mul(-1.15)).div(dBL.add(0.35))
      .mul(sin(params.time.mul(1.3)).mul(0.3).add(1.0));

    const n1 = hash(i.add(uint(101))).sub(0.5);
    const n2 = hash(i.add(uint(207))).sub(0.5);
    const n3 = hash(i.add(uint(313))).sub(0.5);
    const wobble = vec3(
      sin(p.z.mul(1.8).add(params.time.mul(2.4)).add(n1.mul(6.28))),
      cos(p.x.mul(1.3).add(params.time.mul(1.9)).add(n2.mul(6.28))).mul(0.55),
      sin(p.x.mul(1.1).sub(p.z.mul(0.9)).add(params.time.mul(2.1)).add(n3.mul(6.28)))
    ).mul(params.layer1Chaos);

    force.addAssign(pullTR.add(spinTR).mul(wTR));
    force.addAssign(pullBL.add(spinBL).mul(wBL));
    force.addAssign(wobble.mul(wTR.add(wBL).mul(0.5).add(seam.mul(0.35))));

    const influence1 = max(wTR, wBL).mul(0.9).add(seam.mul(0.2)).clamp(0.0, 0.92);

    // --- CAPA 2: redes neuronales (somas + dendritas ramificadas) ---
    const a = hash(i.add(uint(17)));
    const b = hash(i.add(uint(41)));
    const c = hash(i.add(uint(67)));
    const d = hash(i.add(uint(97)));
    const e = hash(i.add(uint(131)));

    // 6 hubs fijos en el volumen (predecibles)
    const h0 = vec3(-2.2, 1.6, 3.2);
    const h1 = vec3(2.4, 2.1, 2.0);
    const h2 = vec3(0.1, 2.8, 5.0);
    const h3 = vec3(-3.1, 1.0, 6.4);
    const h4 = vec3(3.0, 1.4, 4.2);
    const h5 = vec3(0.6, 3.2, 1.2);

    const hubSel = floor(a.mul(5.999));
    const hub = mix(h0, h1, step(0.5, hubSel))
      .toVar();
    hub.assign(mix(hub, h2, step(1.5, hubSel)));
    hub.assign(mix(hub, h3, step(2.5, hubSel)));
    hub.assign(mix(hub, h4, step(3.5, hubSel)));
    hub.assign(mix(hub, h5, step(4.5, hubSel)));

    // Soma (~14%) o rama dendrítica
    const onSoma = step(b, 0.14);
    const theta = c.mul(6.28318530718);
    const cosPhi = d.mul(1.6).sub(0.8);
    const sinPhi = sqrt(max(float(1.0).sub(cosPhi.mul(cosPhi)), 0.05));
    const branchDir = vec3(sinPhi.mul(cos(theta)), cosPhi.mul(0.85).add(0.15), sinPhi.mul(sin(theta)));

    const t = e.mul(0.92).add(0.04);
    const len = params.layer2BranchLen.mul(mix(0.55, 1.15, c));
    // Bifurcación secundaria a mitad de rama
    const forkGate = step(0.55, b);
    const forkAngle = a.mul(6.28318530718);
    const forkDir = vec3(cos(forkAngle), 0.25, sin(forkAngle));
    const forkT = max(t.sub(0.42), 0.0);
    const fork = forkDir.mul(forkT.mul(len.mul(0.45))).mul(forkGate);

    const pulse = sin(params.time.mul(1.1).add(a.mul(6.28))).mul(params.layer2Pulse);
    const somaPos = hub.add(branchDir.mul(float(0.22).add(pulse)));
    const branchPos = hub.add(branchDir.mul(t.mul(len).mul(float(1.0).add(pulse.mul(0.35))))).add(fork);
    // Algunos conectores entre hubs vecinos (malla)
    const other = mix(h0, h5, step(0.5, c));
    const bridge = mix(hub, other, t.mul(0.85).add(0.08))
      .add(branchDir.mul(0.15).mul(sin(t.mul(3.14))));
    const useBridge = step(0.88, b);

    const neuralTarget = mix(
      mix(branchPos, somaPos, onSoma),
      bridge,
      useBridge
    );

    // Blend hacia red neuronal cuando capa 2 está on
    target.assign(mix(baseTarget, neuralTarget, params.layer2Enabled));
    springK.assign(
      mix(
        params.planeSpring.mul(float(1.0).sub(influence1)),
        params.layer2Spring,
        params.layer2Enabled
      )
    );

    // Caos también agita un poco las ramas neuronales
    force.addAssign(
      wobble.mul(params.layer2Enabled).mul(0.35)
    );

    force.addAssign(target.sub(p).mul(springK));
    force.addAssign(v.mul(params.dragCoefficient).mul(-1.0));

    v.addAssign(force.mul(dt));

    const speed = v.length();
    If(speed.greaterThan(params.maxSpeed), () => {
      v.assign(v.normalize().mul(params.maxSpeed));
    });

    p.addAssign(v.mul(dt));
  })().compute(count).setName('Update Horizon Layers');

  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  });

  material.positionNode = positionBuffer.toAttribute();
  // Cerca de hubs (altura media-alta) un poco más grandes → somas legibles
  material.scaleNode = Fn(() => {
    const pos = positionBuffer.toAttribute();
    const hubGlow = smoothstep(float(1.0), float(2.6), pos.y);
    return params.particleSize.mul(mix(1.0, 1.85, hubGlow.mul(params.layer2Enabled)));
  })();

  material.colorNode = Fn(() => {
    const pos = positionBuffer.toAttribute();
    const speed = velocityBuffer.toAttribute().length();
    const heightT = pos.y.mul(0.55).add(0.35).clamp(0.0, 1.0);
    const speedT = speed.div(params.maxSpeed).clamp(0.0, 1.0);

    // Paleta dunas (capa off) vs neuronal (púrpura/sepia + nodos claros)
    const dune = color('#c4a574');
    const foam = color('#8ec8ff');
    const hot = color('#ffb35a');
    const planeCol = mix(dune, foam, heightT);

    const axon = color('#6a4a62');
    const flesh = color('#8b6b5a');
    const node = color('#f2e6c8');
    const neuralBase = mix(axon, flesh, heightT.mul(0.7));
    const nearHub = smoothstep(float(1.2), float(2.8), pos.y);
    const neuralCol = mix(neuralBase, node, nearHub.mul(0.85));

    const base = mix(planeCol, neuralCol, params.layer2Enabled);
    return vec4(mix(base, hot, speedT.mul(0.4)), 1.0);
  })();

  material.opacityNode = step(uv().xy.sub(0.5).length(), 0.5);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function reset() {
    renderer.compute(initParticles);
  }

  function stepSimulation() {
    renderer.compute(updateParticles);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
  }

  return {
    count,
    positionBuffer,
    velocityBuffer,
    homeBuffer,
    reset,
    stepSimulation,
    dispose
  };
}

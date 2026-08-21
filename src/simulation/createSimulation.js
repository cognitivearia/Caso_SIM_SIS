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

    // --- CAPA 2: redes neuronales orgánicas (más ramas + curva) ---
    const a = hash(i.add(uint(17)));
    const b = hash(i.add(uint(41)));
    const c = hash(i.add(uint(67)));
    const d = hash(i.add(uint(97)));
    const e = hash(i.add(uint(131)));
    const f = hash(i.add(uint(163)));
    const g = hash(i.add(uint(193)));

    // 8 hubs dispersos (cuerpos neuronales)
    const h0 = vec3(-2.4, 1.5, 3.0);
    const h1 = vec3(2.6, 2.2, 1.8);
    const h2 = vec3(0.2, 2.9, 4.8);
    const h3 = vec3(-3.2, 0.95, 6.2);
    const h4 = vec3(3.1, 1.35, 4.0);
    const h5 = vec3(0.5, 3.3, 1.1);
    const h6 = vec3(-1.2, 2.4, 2.2);
    const h7 = vec3(1.8, 1.1, 5.6);

    const hubSel = floor(a.mul(7.999));
    const hub = mix(h0, h1, step(0.5, hubSel)).toVar();
    hub.assign(mix(hub, h2, step(1.5, hubSel)));
    hub.assign(mix(hub, h3, step(2.5, hubSel)));
    hub.assign(mix(hub, h4, step(3.5, hubSel)));
    hub.assign(mix(hub, h5, step(4.5, hubSel)));
    hub.assign(mix(hub, h6, step(5.5, hubSel)));
    hub.assign(mix(hub, h7, step(6.5, hubSel)));

    // ~10% soma denso; el resto ramas / bifurcaciones / puentes
    const onSoma = step(b, 0.10);
    const theta = c.mul(6.28318530718);
    const cosPhi = d.mul(1.7).sub(0.85);
    const sinPhi = sqrt(max(float(1.0).sub(cosPhi.mul(cosPhi)), 0.04));
    const mainDir = vec3(
      sinPhi.mul(cos(theta)),
      cosPhi.mul(0.75).add(0.2),
      sinPhi.mul(sin(theta))
    );

    const t = e.pow(0.85).mul(0.96).add(0.02);
    const len = params.layer2BranchLen.mul(mix(0.45, 1.35, f));

    // Curvatura orgánica a lo largo de la rama (no líneas rectas)
    const bendAmp = params.layer2Organic.mul(mix(0.15, 0.55, g));
    const sideA = vec3(0.0, 1.0, 0.0).cross(mainDir);
    const sideLen = max(sideA.length(), 0.05);
    const side = sideA.div(sideLen);
    const bend = side.mul(sin(t.mul(6.28).mul(mix(1.0, 2.4, c))).mul(bendAmp).mul(t))
      .add(mainDir.cross(side).mul(cos(t.mul(4.5).add(a.mul(6.28))).mul(bendAmp.mul(0.55)).mul(t)));

    // Bifurcación 1 (desde ~35% de la rama)
    const fork1Gate = step(0.32, b);
    const fork1Ang = a.add(f).mul(6.28318530718);
    const fork1Dir = vec3(cos(fork1Ang), mix(-0.15, 0.45, d), sin(fork1Ang));
    const fork1T = max(t.sub(0.35), 0.0);
    const fork1 = fork1Dir.mul(fork1T.mul(len.mul(mix(0.35, 0.75, g)))).mul(fork1Gate);

    // Bifurcación 2 (más fina, desde ~55%)
    const fork2Gate = step(0.5, c).mul(step(0.4, f));
    const fork2Ang = e.mul(6.28318530718).add(2.1);
    const fork2Dir = vec3(sin(fork2Ang), mix(0.05, 0.5, b), cos(fork2Ang));
    const fork2T = max(t.sub(0.55), 0.0);
    const fork2 = fork2Dir.mul(fork2T.mul(len.mul(mix(0.25, 0.55, a)))).mul(fork2Gate);

    // Bifurcación 3 (ramitas terminales)
    const fork3Gate = step(0.62, d).mul(step(0.55, g));
    const fork3Ang = g.mul(6.28318530718).sub(1.3);
    const fork3Dir = vec3(cos(fork3Ang).mul(0.8), mix(-0.1, 0.35, e), sin(fork3Ang).mul(0.8));
    const fork3T = max(t.sub(0.68), 0.0);
    const fork3 = fork3Dir.mul(fork3T.mul(len.mul(0.4))).mul(fork3Gate);

    const pulse = sin(params.time.mul(0.9).add(a.mul(6.28))).mul(params.layer2Pulse);
    const somaJitter = vec3(
      sin(params.time.mul(1.3).add(c.mul(6.28))),
      cos(params.time.mul(1.1).add(d.mul(6.28))),
      sin(params.time.mul(0.8).add(e.mul(6.28)))
    ).mul(0.06);
    const somaPos = hub.add(mainDir.mul(float(0.18).add(pulse))).add(somaJitter);

    const branchPos = hub
      .add(mainDir.mul(t.mul(len).mul(float(1.0).add(pulse.mul(0.25)))))
      .add(bend)
      .add(fork1)
      .add(fork2)
      .add(fork3);

    // Puentes sinuosos entre hubs (más aleatorios)
    const otherSel = floor(f.mul(7.999));
    const other = mix(h0, h1, step(0.5, otherSel)).toVar();
    other.assign(mix(other, h2, step(1.5, otherSel)));
    other.assign(mix(other, h3, step(2.5, otherSel)));
    other.assign(mix(other, h4, step(3.5, otherSel)));
    other.assign(mix(other, h5, step(4.5, otherSel)));
    other.assign(mix(other, h6, step(5.5, otherSel)));
    other.assign(mix(other, h7, step(6.5, otherSel)));

    const bridgeT = t.mul(0.9).add(0.05);
    const bridgeBend = side.mul(sin(bridgeT.mul(3.14)).mul(0.55).mul(params.layer2Organic));
    const bridge = mix(hub, other, bridgeT).add(bridgeBend).add(mainDir.mul(0.08));
    const useBridge = step(0.82, b);

    const neuralTarget = mix(
      mix(branchPos, somaPos, onSoma),
      bridge,
      useBridge
    );

    // Micro-ruido orgánico en la posición objetivo (aleatoriedad viva)
    const organicNoise = vec3(
      sin(t.mul(9.0).add(params.time.mul(1.4)).add(a.mul(10.0))),
      cos(t.mul(7.0).add(params.time.mul(1.1)).add(b.mul(8.0))).mul(0.7),
      sin(t.mul(8.0).sub(params.time.mul(1.2)).add(c.mul(9.0)))
    ).mul(params.layer2Organic.mul(0.08)).mul(float(1.0).sub(onSoma));

    target.assign(mix(baseTarget, neuralTarget.add(organicNoise), params.layer2Enabled));
    springK.assign(
      mix(
        params.planeSpring.mul(float(1.0).sub(influence1)),
        params.layer2Spring,
        params.layer2Enabled
      )
    );

    // Caos agita las ramas (más en puntas)
    force.addAssign(
      wobble.mul(params.layer2Enabled).mul(mix(0.25, 0.7, t)).mul(0.45)
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
    // Somas más grandes; puntas de rama más finas (por altura/dispersión)
    const hubGlow = smoothstep(float(0.9), float(2.7), pos.y);
    const tipSoft = float(1.0).sub(smoothstep(float(2.8), float(4.5), pos.length()));
    const neuralScale = mix(0.7, 2.1, hubGlow).mul(mix(0.85, 1.0, tipSoft));
    return params.particleSize.mul(mix(1.0, neuralScale, params.layer2Enabled));
  })();

  material.colorNode = Fn(() => {
    const pos = positionBuffer.toAttribute();
    const speed = velocityBuffer.toAttribute().length();
    const heightT = pos.y.mul(0.45).add(0.3).clamp(0.0, 1.0);
    const speedT = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    const depthT = pos.z.div(8.0).clamp(0.0, 1.0);

    const dune = color('#c4a574');
    const foam = color('#8ec8ff');
    const hot = color('#ffb35a');
    const planeCol = mix(dune, foam, heightT);

    // Paleta imagen: púrpura apagado / sepia / nodos blanco-ámbar
    const deep = color('#3a2a38');
    const axon = color('#7a5a68');
    const flesh = color('#9a7a62');
    const node = color('#f5ecd4');
    const glow = color('#ffe9a8');
    const neuralBase = mix(deep, mix(axon, flesh, heightT), depthT.mul(0.5).add(0.5));
    const nearHub = smoothstep(float(1.1), float(2.9), pos.y);
    const neuralCol = mix(neuralBase, mix(node, glow, nearHub), nearHub.mul(0.9));

    const base = mix(planeCol, neuralCol, params.layer2Enabled);
    return vec4(mix(base, hot, speedT.mul(0.28)), 1.0);
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

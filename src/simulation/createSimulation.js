import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  color,
  cos,
  float,
  floor,
  fract,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  mod,
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

    // --- CAPA 2: esqueleto neuronal = tubos finos (filamentos legibles) ---
    const a = hash(i.add(uint(17)));
    const b = hash(i.add(uint(41)));
    const c = hash(i.add(uint(67)));
    const d = hash(i.add(uint(97)));
    const e = hash(i.add(uint(131)));
    const f = hash(i.add(uint(163)));
    const g = hash(i.add(uint(193)));
    const h = hash(i.add(uint(227)));

    const h0 = vec3(-2.3, 1.55, 3.1);
    const h1 = vec3(2.5, 2.25, 1.9);
    const h2 = vec3(0.15, 2.95, 4.9);
    const h3 = vec3(-3.15, 1.05, 6.3);
    const h4 = vec3(3.05, 1.4, 4.1);
    const h5 = vec3(0.55, 3.25, 1.15);
    const h6 = vec3(-1.35, 2.35, 2.35);
    const h7 = vec3(1.85, 1.15, 5.55);

    const hubSel = floor(a.mul(7.999));
    const hub = mix(h0, h1, step(0.5, hubSel)).toVar();
    hub.assign(mix(hub, h2, step(1.5, hubSel)));
    hub.assign(mix(hub, h3, step(2.5, hubSel)));
    hub.assign(mix(hub, h4, step(3.5, hubSel)));
    hub.assign(mix(hub, h5, step(4.5, hubSel)));
    hub.assign(mix(hub, h6, step(5.5, hubSel)));
    hub.assign(mix(hub, h7, step(6.5, hubSel)));

    // Soma compacto (~7%)
    const onSoma = step(b, 0.07);
    const somaR = mix(0.12, 0.28, c);
    const somaTheta = d.mul(6.28318530718);
    const somaCos = e.mul(2.0).sub(1.0);
    const somaSin = sqrt(max(float(1.0).sub(somaCos.mul(somaCos)), 0.02));
    const pulse = sin(params.time.mul(0.85).add(a.mul(6.28))).mul(params.layer2Pulse);
    const somaPos = hub.add(
      vec3(somaSin.mul(cos(somaTheta)), somaCos, somaSin.mul(sin(somaTheta)))
        .mul(somaR.mul(float(1.0).add(pulse)))
    );

    // Ramas primarias discretas (18 por hub) → filamentos claros, no nube
    const branchCount = float(18.0);
    const branchId = floor(c.mul(branchCount));
    const theta = branchId.add(d.sub(0.5).mul(0.22)).div(branchCount).mul(6.28318530718);
    const elev = mix(-0.35, 0.95, e.add(f).mul(0.5));
    const elevLen = sqrt(max(float(1.0).sub(elev.mul(elev)), 0.05));
    const mainDir = vec3(elevLen.mul(cos(theta)), elev, elevLen.mul(sin(theta)));

    // t a lo largo de la rama (un poco más densidad cerca del hub)
    const t = g.pow(1.15).mul(0.98).add(0.01);
    const len = params.layer2BranchLen.mul(mix(0.75, 1.2, h));

    const up = vec3(0.0, 1.0, 0.0);
    const sideA = up.cross(mainDir);
    const side = sideA.div(max(sideA.length(), 0.05));
    const binormal = mainDir.cross(side);

    // Curva suave controlada (organic bajo = filamento legible)
    const bendAmt = params.layer2Organic.mul(0.22).mul(t).mul(t);
    const centerline = hub
      .add(mainDir.mul(t.mul(len)))
      .add(side.mul(sin(t.mul(3.6).add(a.mul(6.28))).mul(bendAmt)))
      .add(binormal.mul(cos(t.mul(2.8).add(b.mul(4.0))).mul(bendAmt.mul(0.65))));

    // Grosor del tubo: grueso en hub, muy fino en punta
    const tubeR = params.layer2Thickness
      .mul(mix(1.15, 0.12, t.pow(0.75)))
      .mul(mix(0.85, 1.15, f));
    const tubeAng = h.mul(6.28318530718);
    const tubeOff = side.mul(cos(tubeAng)).add(binormal.mul(sin(tubeAng))).mul(tubeR.mul(e));
    const primaryPos = centerline.add(tubeOff);

    // --- Fork nivel 1: nueva rama fina que nace a ~40% ---
    const onFork1 = step(0.55, b).mul(step(0.35, f));
    const fork1StartT = mix(0.32, 0.48, c);
    const fork1Origin = hub
      .add(mainDir.mul(fork1StartT.mul(len)))
      .add(side.mul(sin(fork1StartT.mul(3.6).add(a.mul(6.28))).mul(params.layer2Organic.mul(0.08))));
    const fork1Yaw = a.add(f).mul(6.28318530718);
    const fork1Dir = side.mul(cos(fork1Yaw)).add(binormal.mul(sin(fork1Yaw))).add(mainDir.mul(0.55));
    const fork1DirN = fork1Dir.div(max(fork1Dir.length(), 0.05));
    const t1 = max(t.sub(fork1StartT), 0.0).div(max(float(1.0).sub(fork1StartT), 0.05));
    const fork1Len = len.mul(mix(0.35, 0.7, g));
    const fork1Side = up.cross(fork1DirN).div(max(up.cross(fork1DirN).length(), 0.05));
    const fork1R = params.layer2Thickness.mul(mix(0.55, 0.08, t1.pow(0.7)));
    const fork1Ang = d.mul(6.28318530718);
    const fork1Pos = fork1Origin
      .add(fork1DirN.mul(t1.mul(fork1Len)))
      .add(fork1Side.mul(cos(fork1Ang)).mul(fork1R.mul(e)))
      .add(fork1DirN.cross(fork1Side).mul(sin(fork1Ang)).mul(fork1R.mul(e)));

    // --- Fork nivel 2: ramita terminal ---
    const onFork2 = step(0.7, c).mul(step(0.5, g)).mul(onFork1);
    const fork2StartT = mix(0.55, 0.72, d);
    const fork2Origin = fork1Origin.add(fork1DirN.mul(fork2StartT.mul(fork1Len)));
    const fork2Yaw = e.add(h).mul(6.28318530718);
    const fork2Dir = fork1Side.mul(cos(fork2Yaw)).add(fork1DirN.mul(0.4)).add(binormal.mul(sin(fork2Yaw).mul(0.6)));
    const fork2DirN = fork2Dir.div(max(fork2Dir.length(), 0.05));
    const t2 = max(t1.sub(0.35), 0.0);
    const fork2Len = fork1Len.mul(mix(0.3, 0.55, a));
    const fork2R = params.layer2Thickness.mul(mix(0.28, 0.05, t2.clamp(0.0, 1.0)));
    const fork2Pos = fork2Origin
      .add(fork2DirN.mul(t2.mul(fork2Len)))
      .add(fork1Side.mul(sin(f.mul(6.28))).mul(fork2R));

    // --- Puentes finos entre hubs ---
    const otherSel = floor(mod(f.mul(7.999).add(1.0), 8.0));
    const other = mix(h0, h1, step(0.5, otherSel)).toVar();
    other.assign(mix(other, h2, step(1.5, otherSel)));
    other.assign(mix(other, h3, step(2.5, otherSel)));
    other.assign(mix(other, h4, step(3.5, otherSel)));
    other.assign(mix(other, h5, step(4.5, otherSel)));
    other.assign(mix(other, h6, step(5.5, otherSel)));
    other.assign(mix(other, h7, step(6.5, otherSel)));
    const bridgeT = t;
    const bridgeDir = other.sub(hub);
    const bridgeN = bridgeDir.div(max(bridgeDir.length(), 0.05));
    const bridgeSide = up.cross(bridgeN).div(max(up.cross(bridgeN).length(), 0.05));
    const bridgeBend = bridgeSide.mul(sin(bridgeT.mul(3.14159)).mul(0.28).mul(params.layer2Organic));
    const bridgeR = params.layer2Thickness.mul(mix(0.35, 0.07, abs(bridgeT.sub(0.5)).mul(2.0)));
    const bridgePos = mix(hub, other, bridgeT)
      .add(bridgeBend)
      .add(bridgeSide.mul(cos(h.mul(6.28))).mul(bridgeR.mul(e)));
    const onBridge = step(0.9, b);

    const filament = mix(primaryPos, mix(fork1Pos, fork2Pos, onFork2), onFork1);
    const neuralTarget = mix(mix(filament, somaPos, onSoma), bridgePos, onBridge);

    // --- CAPA 3: líneas paralelas + onda de sierra armónica ---
    const s1 = hash(i.add(uint(307)));
    const s2 = hash(i.add(uint(353)));
    const s3 = hash(i.add(uint(401)));

    // Densidad → cantidad de líneas (pocas↔muchas)
    const density = params.layer3Density.clamp(0.0, 1.0);
    const lineCount = max(mix(5.0, 38.0, density), 2.0);
    const lineId = floor(s1.mul(lineCount));

    // Grosor inverso a la densidad: menos líneas = más gruesas
    const thickScale = mix(2.4, 0.35, density);
    const lineThick = s3.sub(0.5).mul(0.045).mul(thickScale);

    // Posición a lo largo de la línea (eje X)
    const along = s2.sub(0.5).mul(11.5);
    // Span más corto → menor distancia entre líneas
    const lineZ = lineId.add(0.5).div(lineCount).mul(params.layer3Span).add(
      float(4.2).sub(params.layer3Span.mul(0.5))
    );

    // Armónicos: línea n vibra a frecuencia (n+1) · f0, desfasada
    const harmonic = lineId.add(1.0);
    const sawPhase = along.mul(params.layer3Frequency).mul(harmonic.mul(0.12).add(0.55))
      .add(params.time.mul(params.layer3Speed).mul(harmonic.mul(0.35).add(0.65)))
      .add(lineId.mul(0.37));
    const saw = fract(sawPhase);
    const sawY = saw.mul(params.layer3Amplitude).mul(mix(0.75, 1.2, s3));

    const sawLinesTarget = vec3(along, sawY.add(0.15), lineZ.add(lineThick));

    // Blend de capas (base → neuronas → sierra)
    target.assign(mix(baseTarget, neuralTarget, params.layer2Enabled));
    target.assign(mix(target, sawLinesTarget, params.layer3Enabled));

    springK.assign(
      mix(
        params.planeSpring.mul(float(1.0).sub(influence1)),
        params.layer2Spring,
        params.layer2Enabled
      )
    );
    springK.assign(mix(springK, params.layer3Spring, params.layer3Enabled));

    force.addAssign(wobble.mul(params.layer2Enabled).mul(0.04));
    force.addAssign(wobble.mul(params.layer3Enabled).mul(0.03));

    force.addAssign(target.sub(p).mul(springK));
    const layerDrag = max(params.layer2Enabled, params.layer3Enabled);
    const drag = params.dragCoefficient.mul(mix(1.0, 2.8, layerDrag));
    force.addAssign(v.mul(drag).mul(-1.0));

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
    const neuralScale = mix(0.45, 1.55, hubGlow);
    const sawScale = mix(1.35, 0.5, params.layer3Density);
    const layered = mix(1.0, neuralScale, params.layer2Enabled);
    return params.particleSize.mul(mix(layered, sawScale, params.layer3Enabled));
  })();

  material.colorNode = Fn(() => {
    const pos = positionBuffer.toAttribute();
    const speed = velocityBuffer.toAttribute().length();
    const heightT = pos.y.mul(0.45).add(0.25).clamp(0.0, 1.0);
    const speedT = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    const depthT = pos.z.div(8.0).clamp(0.0, 1.0);

    const dune = color('#c4a574');
    const foam = color('#8ec8ff');
    const hot = color('#ffb35a');
    const planeCol = mix(dune, foam, heightT);

    const deep = color('#2a1e28');
    const axon = color('#6e4e5c');
    const flesh = color('#8a6a58');
    const node = color('#f3ebcf');
    const glow = color('#ffe6a0');
    const neuralBase = mix(deep, mix(axon, flesh, heightT), float(1.0).sub(depthT.mul(0.35)));
    const nearHub = smoothstep(float(1.15), float(2.85), pos.y);
    const neuralCol = mix(neuralBase, mix(node, glow, 0.55), nearHub.mul(0.95));

    const sawCold = color('#7eb8ff');
    const sawWarm = color('#e8f0ff');
    const sawCol = mix(sawCold, sawWarm, heightT);

    const afterNeural = mix(planeCol, neuralCol, params.layer2Enabled);
    const base = mix(afterNeural, sawCol, params.layer3Enabled);
    return vec4(mix(base, hot, speedT.mul(0.2)), 1.0);
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

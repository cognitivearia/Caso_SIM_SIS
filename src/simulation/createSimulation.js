import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  color,
  float,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  sin,
  smoothstep,
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
    p.assign(home);
    v.assign(vec3(0.0, 0.0, 0.0));
  })().compute(count).setName('Initialize Horizon Plane');

  const updateParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);
    const home = homeBuffer.element(i);

    const dt = params.dt.mul(params.timeScale);
    const force = vec3(0.0).toVar();

    // --- BASE: plano que ondula ---
    const wave =
      sin(home.x.mul(params.waveFreqX).add(params.time.mul(params.waveSpeed)))
        .mul(params.waveAmp)
        .add(
          sin(home.z.mul(params.waveFreqZ).sub(params.time.mul(params.waveSpeed.mul(0.7))))
            .mul(params.waveAmp.mul(0.65))
        )
        .add(
          sin(home.x.add(home.z).mul(0.55).add(params.time.mul(0.9)))
            .mul(params.waveAmp.mul(0.35))
        );

    const baseTarget = vec3(home.x, home.y.add(wave), home.z);
    const springK = params.planeSpring.toVar();

    // --- CAPA 1: zonas azules + vórtices rojos ---
    If(params.layer1Enabled.greaterThan(0.5), () => {
      // Diagonal TL→BR (canal azul): separa influencia TR vs BL
      // valor > 0 → lado superior-derecha; < 0 → inferior-izquierda
      const sample = mix(home, p, 0.35);
      const diag = sample.x.mul(0.65).sub(sample.z.sub(4.5).mul(0.55));
      const wTR = smoothstep(-0.35, 1.1, diag);
      const wBL = smoothstep(-0.35, 1.1, diag.mul(-1.0));

      // Ligero solape caótico cerca del canal
      const seam = float(1.0).sub(abs(diag).mul(0.55)).clamp(0.0, 1.0);

      const toTR = params.vortexTR.sub(p);
      const toBL = params.vortexBL.sub(p);
      const dTR = max(toTR.length(), params.layer1Softening);
      const dBL = max(toBL.length(), params.layer1Softening);
      const dirTR = toTR.div(dTR);
      const dirBL = toBL.div(dBL);

      // Flujo direccional (flechas azules): TR ← arriba-derecha; BL ← abajo-izquierda
      const flowTR = vec3(0.75, 0.15, -0.55).normalize();
      const flowBL = vec3(-0.75, 0.1, 0.6).normalize();

      // Atracción + flujo (más fuerte lejos del núcleo, para arrastrar la zona)
      const pullTR = dirTR.mul(params.layer1Attract).div(dTR.add(0.5))
        .add(flowTR.mul(params.layer1Flow).mul(smoothstep(0.0, 5.0, dTR)));
      const pullBL = dirBL.mul(params.layer1Attract).div(dBL.add(0.5))
        .add(flowBL.mul(params.layer1Flow).mul(smoothstep(0.0, 5.0, dBL)));

      // Giro opuesto en cada vórtice (eje Y → remolino en el plano)
      const swirlPhase = sin(params.time.mul(1.7)).mul(0.25).add(1.0);
      const spinTR = vec3(0.0, 1.0, 0.0).cross(dirTR)
        .mul(params.layer1Vortex).div(dTR.add(0.35)).mul(swirlPhase);
      const spinBL = vec3(0.0, 1.0, 0.0).cross(dirBL)
        .mul(params.layer1Vortex.mul(-1.15)).div(dBL.add(0.35))
        .mul(sin(params.time.mul(1.3)).mul(0.3).add(1.0));

      // Turbulencia local (caos visual)
      const n1 = hash(i.add(uint(101))).sub(0.5);
      const n2 = hash(i.add(uint(207))).sub(0.5);
      const n3 = hash(i.add(uint(313))).sub(0.5);
      const wobble = vec3(
        sin(p.z.mul(1.8).add(params.time.mul(2.4)).add(n1.mul(6.28))),
        cos(p.x.mul(1.3).add(params.time.mul(1.9)).add(n2.mul(6.28))).mul(0.55),
        sin(p.x.mul(1.1).sub(p.z.mul(0.9)).add(params.time.mul(2.1)).add(n3.mul(6.28)))
      ).mul(params.layer1Chaos).mul(wTR.add(wBL).mul(0.5).add(seam.mul(0.35)));

      force.addAssign(pullTR.add(spinTR).mul(wTR));
      force.addAssign(pullBL.add(spinBL).mul(wBL));
      force.addAssign(wobble);

      // En zona de influencia, el plano suelta (el canal diagonal también se agita)
      const influence = max(wTR, wBL).mul(0.92).add(seam.mul(0.25)).clamp(0.0, 0.95);
      springK.assign(params.planeSpring.mul(float(1.0).sub(influence)));
    });

    force.addAssign(baseTarget.sub(p).mul(springK));
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
  material.scaleNode = params.particleSize;

  material.colorNode = Fn(() => {
    const pos = positionBuffer.toAttribute();
    const speed = velocityBuffer.toAttribute().length();
    const heightT = pos.y.mul(0.55).add(0.35).clamp(0.0, 1.0);
    const speedT = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    const dune = color('#c4a574');
    const foam = color('#8ec8ff');
    const hot = color('#ffb35a');
    const base = mix(dune, foam, heightT);
    return vec4(mix(base, hot, speedT.mul(0.55)), 1.0);
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

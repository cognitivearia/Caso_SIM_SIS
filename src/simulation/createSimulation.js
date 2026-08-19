import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  acos,
  atan,
  clamp,
  color,
  cos,
  exp,
  float,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  pow,
  sin,
  smoothstep,
  sqrt,
  step,
  uint,
  uv,
  vec3,
  vec4
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 131072 }) {
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');

  const initParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);

    const r1 = hash(i.add(uint(11)));
    const r2 = hash(i.add(uint(23)));
    const r3 = hash(i.add(uint(97)));

    const theta = r1.mul(6.28318530718);
    const cosPhi = r2.mul(2.0).sub(1.0);
    const sinPhi = sqrt(max(float(1.0).sub(cosPhi.pow(2)), 0.001));
    const jitter = r3.sub(0.5).mul(params.orbThickness);
    const radius = params.orbRadius.add(jitter);

    p.assign(vec3(
      sinPhi.mul(cos(theta)),
      sinPhi.mul(sin(theta)),
      cosPhi
    ).mul(radius));
    v.assign(vec3(0.0, 0.0, 0.0));
  })().compute(count).setName('Initialize Orb Particles');

  const updateParticles = Fn(() => {
    const p = positionBuffer.element(instanceIndex);
    const v = velocityBuffer.element(instanceIndex);

    const dt = params.dt.mul(params.timeScale);
    const force = vec3(0.0).toVar();

    const dist = max(p.length(), 0.001);
    const dir = p.div(dist);

    // Resorte hacia la cáscara del orbe (mantiene la forma esférica)
    const shellError = dist.sub(params.orbRadius);
    force.addAssign(dir.mul(shellError).mul(params.orbSpringStrength).mul(-1.0));

    // Actor 1 · Maza: picos radiales en el exterior del orbe
    const shellMask = smoothstep(params.orbRadius.mul(0.9), params.orbRadius.mul(1.02), dist)
      .mul(smoothstep(params.orbRadius.mul(1.2), params.orbRadius.mul(1.0), dist));

    const theta = atan(dir.y, dir.x);
    const phi = acos(clamp(dir.z, -1.0, 1.0));
    const spikeA = sin(theta.mul(params.maceSpikeCount));
    const spikeB = sin(phi.mul(params.maceSpikeCount.mul(0.5)));
    const spikePattern = pow(max(spikeA.mul(spikeB), 0.0), params.maceSharpness);

    force.addAssign(
      dir.mul(spikePattern).mul(params.maceStrength).mul(params.maceEnabled).mul(shellMask)
    );

    // Actor 2 · Ondas en X desde el centro
    const wavePhase = params.waveFrequency.mul(p.x).sub(params.time.mul(params.waveSpeed));
    const waveVal = sin(wavePhase);
    const yzDistSq = p.y.mul(p.y).add(p.z.mul(p.z));
    const falloff = exp(yzDistSq.mul(-0.3));

    force.addAssign(
      vec3(waveVal, 0.0, 0.0).mul(params.waveStrength).mul(params.waveEnabled).mul(falloff)
    );

    // Drag lineal
    force.addAssign(v.mul(params.dragCoefficient).mul(params.dragEnabled).mul(-1.0));

    // Integración
    v.addAssign(force.mul(dt));

    const speed = v.length();
    If(speed.greaterThan(params.maxSpeed), () => {
      v.assign(v.normalize().mul(params.maxSpeed));
    });

    p.addAssign(v.mul(dt));
  })().compute(count).setName('Update Orb Particles');

  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  });

  material.positionNode = positionBuffer.toAttribute();
  material.scaleNode = params.particleSize;

  material.colorNode = Fn(() => {
    const speed = velocityBuffer.toAttribute().length();
    const dist = positionBuffer.toAttribute().length();
    const shellT = dist.div(params.orbRadius).sub(0.95).div(0.15).clamp(0.0, 1.0);
    const speedT = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    const core = color('#6ec8ff');
    const edge = color('#ffb35a');
    const hot = color('#ff6b4a');
    const base = mix(core, edge, shellT);
    return vec4(mix(base, hot, speedT.mul(0.6)), 1.0);
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
    reset,
    stepSimulation,
    dispose
  };
}

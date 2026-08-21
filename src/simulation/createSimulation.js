import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  atan,
  color,
  cos,
  exp,
  float,
  fract,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  pow,
  sin,
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

    // Resorte hacia la cáscara base del orbe
    const shellError = dist.sub(params.orbRadius);
    force.addAssign(dir.mul(shellError).mul(params.orbSpringStrength).mul(-1.0));

    // Actor 1 · Maza: picos triangulares afilados (menos redondeados)
    // Patrón tipo sierra: crestas estrechas en el ángulo azimut
    const theta = atan(dir.y, dir.x);
    const spikePhase = fract(theta.div(6.28318530718).mul(params.maceSpikeCount).add(0.5));
    const triangular = abs(spikePhase.sub(0.5)).mul(2.0); // 0 en cresta, 1 en valle
    const spikePattern = pow(max(float(1.0).sub(triangular.mul(params.maceSharpness.mul(0.45))), 0.0), 1.8);

    // Solo empuja la cáscara exterior hacia fuera en las crestas
    const outerBias = max(dist.sub(params.orbRadius.mul(0.75)), 0.0).div(params.orbRadius.mul(0.4)).clamp(0.0, 1.0);
    force.addAssign(
      dir.mul(spikePattern).mul(params.maceStrength).mul(params.macePulse).mul(outerBias)
    );

    // Actor 2 · Ondas: anillos de desplazamiento radial viajando por el eje X
    // desde el centro hacia ±X (crestas perpendiculares al eje X)
    const ax = abs(p.x);
    const localT = max(params.time.sub(params.waveOriginTime), 0.0);
    const phase = params.waveFrequency.mul(ax).sub(localT.mul(params.waveSpeed));
    const ring = sin(phase);
    // Ventana que sigue el frente de onda saliendo del centro
    const front = localT.mul(params.waveSpeed).div(params.waveFrequency.add(0.001));
    const frontDist = abs(ax.sub(front));
    const frontMask = exp(frontDist.mul(frontDist).div(params.waveWidth.mul(params.waveWidth).add(0.001)).mul(-1.0));
    const radialYZ = sqrt(p.y.mul(p.y).add(p.z.mul(p.z)).add(0.001));
    const ringShape = radialYZ.div(params.orbRadius.add(0.001)).clamp(0.2, 1.0);

    const waveOffset = ring.mul(params.waveStrength).mul(params.wavePulse).mul(frontMask).mul(ringShape);
    force.addAssign(dir.mul(waveOffset).mul(params.orbSpringStrength.mul(1.8)));

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
    const shellT = dist.div(params.orbRadius).sub(0.95).div(0.2).clamp(0.0, 1.0);
    const speedT = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    const core = color('#6ec8ff');
    const edge = color('#ffb35a');
    const hot = color('#ff6b4a');
    const base = mix(core, edge, shellT);
    return vec4(mix(base, hot, speedT.mul(0.7)), 1.0);
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

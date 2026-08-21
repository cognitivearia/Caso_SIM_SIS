import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  color,
  float,
  hash,
  instanceIndex,
  instancedArray,
  max,
  min,
  mix,
  sin,
  step,
  uint,
  uv,
  vec3,
  vec4
} from 'three/tsl';

function vortexForce(p, center, attract, swirl, softening) {
  const toCenter = center.sub(p);
  const dist = max(toCenter.length(), softening);
  const radial = toCenter.div(dist);
  // Atracción hacia el centro del vórtice
  const pull = radial.mul(attract).div(dist.add(0.25));
  // Giro tangencial alrededor del eje de visión aproximado (Z)
  const tangent = vec3(0.0, 0.0, 1.0).cross(radial);
  const spin = tangent.mul(swirl).div(dist.add(0.4));
  return pull.add(spin);
}

export function createSimulation({ renderer, scene, params, count = 262144 }) {
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
    const p = positionBuffer.element(instanceIndex);
    const v = velocityBuffer.element(instanceIndex);
    const home = homeBuffer.element(instanceIndex);

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

    // --- CAPA 1: dos vórtices de atracción (esquinas) ---
    If(params.layer1Enabled.greaterThan(0.5), () => {
      const fTR = vortexForce(
        p,
        params.vortexTR,
        params.layer1Attract,
        params.layer1Vortex,
        params.layer1Softening
      );
      const fBL = vortexForce(
        p,
        params.vortexBL,
        params.layer1Attract,
        params.layer1Vortex,
        params.layer1Softening
      );
      force.addAssign(fTR.add(fBL));

      // Cerca de un vórtice, afloja el anclaje al plano para que el remolino se lea
      const dTR = max(params.vortexTR.sub(p).length(), 0.01);
      const dBL = max(params.vortexBL.sub(p).length(), 0.01);
      const near = float(1.0).sub(min(dTR, dBL).div(4.5).clamp(0.0, 1.0));
      springK.assign(params.planeSpring.mul(float(1.0).sub(near.mul(0.9))));
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
    return vec4(mix(base, hot, speedT.mul(0.45)), 1.0);
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

import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  color,
  cos,
  float,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  sin,
  step,
  uint,
  uv,
  vec3,
  vec4
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 131072 }) {
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');
  // Posición de reposo en el plano (para resultados predecibles y retorno al desactivar capas)
  const homeBuffer = instancedArray(count, 'vec3');

  const initParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);
    const home = homeBuffer.element(i);

    const r1 = hash(i.add(uint(11)));
    const r2 = hash(i.add(uint(23)));
    const r3 = hash(i.add(uint(37)));

    // Plano hacia el horizonte: X ancho, Z profundidad, Y casi 0
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

    // --- BASE: plano que pulsa como olas / dunas ---
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

    const baseTarget = vec3(home.x, home.y.add(wave), home.z).toVar();
    const target = baseTarget.toVar();
    const springK = params.planeSpring.toVar();

    // --- CAPA 1: orbes laterales ---
    If(params.layer1Enabled.greaterThan(0.5), () => {
      const toLeft = params.orbLeft.sub(p);
      const toRight = params.orbRight.sub(p);
      const distL = max(toLeft.length(), 0.05);
      const distR = max(toRight.length(), 0.05);
      const side = step(0.0, home.x); // 0 izquierda, 1 derecha
      const isLateral = step(params.layer1LateralBand, abs(home.x));

      // Modo formación: atrae partículas laterales (y un poco del borde del suelo)
      If(params.layer1Mode.lessThan(0.5), () => {
        const edgeSoft = max(abs(home.x).sub(params.layer1LateralBand.mul(0.55)), 0.0).mul(0.25);
        const gatherMask = isLateral.add(edgeSoft).clamp(0.0, 1.0);
        const dirL = toLeft.div(distL);
        const dirR = toRight.div(distR);
        const attractL = dirL.mul(params.layer1Attract).div(distL.add(0.35)).mul(float(1.0).sub(side)).mul(gatherMask);
        const attractR = dirR.mul(params.layer1Attract).div(distR.add(0.35)).mul(side).mul(gatherMask);
        force.addAssign(attractL.add(attractR));
        // Mientras se forman, suaviza el anclaje al plano en laterales
        springK.assign(params.planeSpring.mul(float(1.0).sub(gatherMask.mul(0.85))));
      });

      // Modo pulso: ya no atrae del suelo; solo partículas cerca del orbe pulsan
      If(params.layer1Mode.greaterThan(0.5), () => {
        const nearest = mix(params.orbLeft, params.orbRight, side);
        const toOrb = nearest.sub(p);
        const dist = max(toOrb.length(), 0.02);
        const inOrb = step(dist, params.layer1OrbRadius.mul(2.4));

        const pulse = sin(params.time.mul(params.layer1PulseSpeed)).mul(params.layer1PulseAmp);
        const radius = params.layer1OrbRadius.mul(float(1.0).add(pulse));

        // Dirección estable desde home lateral → centro del orbe (predecible)
        const fromHome = nearest.sub(vec3(home.x, nearest.y, home.z));
        const shellDir = fromHome.normalize();
        const shellTarget = nearest.add(shellDir.mul(radius));

        target.assign(mix(baseTarget, shellTarget, inOrb));
        springK.assign(mix(params.planeSpring, params.planeSpring.mul(2.2), inOrb));
      });
    });

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

import * as THREE from 'three/webgpu';
import {
  Fn,
  color,
  float,
  max,
  mix,
  positionWorldDirection,
  pow,
  smoothstep,
  uniform,
  vec3,
  vec4
} from 'three/tsl';

/**
 * Dos soles lejanos (atrás / adelante del set), distinta elevación.
 * Morado atrás-alto · azul adelante-bajo. Alejados para no invadir partículas.
 */
export function createAmbientEnvironment(scene, params) {
  const stage = new THREE.Vector3(0, 1.2, 3.5);

  // Atrás del set (−Z), elevación alta · morado
  const sunBackPos = new THREE.Vector3(-20, 26, -48);
  // Adelante del set (+Z), elevación baja · azul
  const sunFrontPos = new THREE.Vector3(16, -12, 46);

  const sunBackDir = sunBackPos.clone().sub(stage).normalize();
  const sunFrontDir = sunFrontPos.clone().sub(stage).normalize();

  const backHex = '#c4b5fd';
  const frontHex = '#93c5fd';
  const backCol = new THREE.Color(backHex);
  const frontCol = new THREE.Color(frontHex);

  const uGlowBack = uniform(0.22);
  const uHazeBack = uniform(0.08);
  const uGlowFront = uniform(0.2);
  const uHazeFront = uniform(0.07);

  const sunGroup = new THREE.Group();
  sunGroup.name = 'TwinSuns';
  scene.add(sunGroup);

  const makeSun = (position, hex, coreR, glowR, uGlow, uHaze) => {
    const g = new THREE.Group();
    g.position.copy(position);

    const coreMat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    coreMat.colorNode = color(hex);
    coreMat.opacityNode = float(0.95);

    const glowMat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    glowMat.colorNode = color(hex);
    glowMat.opacityNode = uGlow;

    const hazeMat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    hazeMat.colorNode = color(hex);
    hazeMat.opacityNode = uHaze;

    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 28), coreMat);
    core.scale.setScalar(coreR);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 24), glowMat);
    glow.scale.setScalar(glowR);
    const haze = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 20), hazeMat);
    haze.scale.setScalar(glowR * 2.15);

    g.add(core, glow, haze);
    sunGroup.add(g);
    return g;
  };

  makeSun(sunBackPos, backHex, 4.2, 14, uGlowBack, uHazeBack);
  makeSun(sunFrontPos, frontHex, 3.4, 12, uGlowFront, uHazeFront);

  // Luces con alcance limitado: iluminan atmósfera lejana, no saturan el set
  const lightBack = new THREE.PointLight(backCol.getHex(), 2.0, 88, 2.1);
  lightBack.position.copy(sunBackPos);
  lightBack.name = 'SunBackPurple';
  scene.add(lightBack);

  const lightFront = new THREE.PointLight(frontCol.getHex(), 1.7, 88, 2.1);
  lightFront.position.copy(sunFrontPos);
  lightFront.name = 'SunFrontBlue';
  scene.add(lightFront);

  const dirBack = new THREE.DirectionalLight(backCol.getHex(), 0.28);
  dirBack.position.copy(sunBackDir);
  dirBack.target.position.copy(stage);
  scene.add(dirBack);
  scene.add(dirBack.target);

  const dirFront = new THREE.DirectionalLight(frontCol.getHex(), 0.22);
  dirFront.position.copy(sunFrontDir);
  dirFront.target.position.copy(stage);
  scene.add(dirFront);
  scene.add(dirFront.target);

  const fill = new THREE.AmbientLight(0x161222, 0.14);
  fill.name = 'SunFill';
  scene.add(fill);

  // Cielo oscuro + difuminación hacia cada sol
  scene.background = null;
  scene.backgroundNode = Fn(() => {
    const view = positionWorldDirection;
    const backD = vec3(sunBackDir.x, sunBackDir.y, sunBackDir.z);
    const frontD = vec3(sunFrontDir.x, sunFrontDir.y, sunFrontDir.z);

    const backDot = max(view.dot(backD), float(0.0));
    const frontDot = max(view.dot(frontD), float(0.0));

    const backCore = pow(backDot, float(52.0));
    const backHalo = pow(backDot, float(5.5));
    const frontCore = pow(frontDot, float(44.0));
    const frontHalo = pow(frontDot, float(4.8));

    const purple = color('#a78bfa');
    const blue = color('#60a5fa');
    const night = color('#0a0912');

    const sky = night
      .add(purple.mul(backHalo.mul(0.32).add(backCore.mul(0.9))))
      .add(blue.mul(frontHalo.mul(0.28).add(frontCore.mul(0.8))));

    const elev = smoothstep(float(-0.55), float(0.65), view.y);
    const elevTint = mix(blue.mul(0.08), purple.mul(0.1), elev);
    const lit = sky.add(elevTint).mul(params.ambientIntensity.mul(0.55).add(0.4));
    return vec4(lit, 1.0);
  })();

  const syncIntensity = () => {
    const i = Math.max(0, params.ambientIntensity.value);
    lightBack.intensity = 0.9 + i * 2.0;
    lightFront.intensity = 0.75 + i * 1.8;
    dirBack.intensity = 0.12 + i * 0.28;
    dirFront.intensity = 0.1 + i * 0.24;
    fill.intensity = 0.08 + i * 0.1;
    uGlowBack.value = 0.12 + i * 0.14;
    uHazeBack.value = 0.04 + i * 0.06;
    uGlowFront.value = 0.1 + i * 0.12;
    uHazeFront.value = 0.035 + i * 0.05;
  };
  syncIntensity();

  return {
    lightBack,
    lightFront,
    syncIntensity,
    dispose() {
      scene.remove(sunGroup, lightBack, lightFront, dirBack, dirBack.target, dirFront, dirFront.target, fill);
      sunGroup.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      lightBack.dispose?.();
      lightFront.dispose?.();
      dirBack.dispose?.();
      dirFront.dispose?.();
      fill.dispose?.();
      scene.backgroundNode = null;
      scene.background = new THREE.Color('#0a0912');
    }
  };
}

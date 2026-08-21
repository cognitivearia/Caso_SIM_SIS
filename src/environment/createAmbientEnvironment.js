import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  max,
  mix,
  positionWorldDirection,
  pow,
  smoothstep,
  vec3,
  vec4
} from 'three/tsl';

/**
 * Dos soles lejanos (invisibles): solo luz + atmósfera.
 * Atrás-alto y adelante-bajo; colores editables desde LAB.
 */
export function createAmbientEnvironment(scene, params) {
  const stage = new THREE.Vector3(0, 1.2, 3.5);

  const sunBackPos = new THREE.Vector3(-20, 26, -48);
  const sunFrontPos = new THREE.Vector3(16, -12, 46);

  const sunBackDir = sunBackPos.clone().sub(stage).normalize();
  const sunFrontDir = sunFrontPos.clone().sub(stage).normalize();

  const lightBack = new THREE.PointLight(params.sunBackColor.value.getHex(), 2.0, 88, 2.1);
  lightBack.position.copy(sunBackPos);
  lightBack.name = 'SunBack';
  scene.add(lightBack);

  const lightFront = new THREE.PointLight(params.sunFrontColor.value.getHex(), 1.7, 88, 2.1);
  lightFront.position.copy(sunFrontPos);
  lightFront.name = 'SunFront';
  scene.add(lightFront);

  const dirBack = new THREE.DirectionalLight(params.sunBackColor.value.getHex(), 0.28);
  dirBack.position.copy(sunBackDir);
  dirBack.target.position.copy(stage);
  scene.add(dirBack);
  scene.add(dirBack.target);

  const dirFront = new THREE.DirectionalLight(params.sunFrontColor.value.getHex(), 0.22);
  dirFront.position.copy(sunFrontDir);
  dirFront.target.position.copy(stage);
  scene.add(dirFront);
  scene.add(dirFront.target);

  const fill = new THREE.AmbientLight(0x161222, 0.14);
  fill.name = 'SunFill';
  scene.add(fill);

  // Cielo: difuminación suave (sin discos / coronas visibles)
  scene.background = null;
  scene.backgroundNode = Fn(() => {
    const view = positionWorldDirection;
    const backD = vec3(sunBackDir.x, sunBackDir.y, sunBackDir.z);
    const frontD = vec3(sunFrontDir.x, sunFrontDir.y, sunFrontDir.z);

    const backDot = max(view.dot(backD), float(0.0));
    const frontDot = max(view.dot(frontD), float(0.0));

    // Halos anchos y suaves — sin núcleo tipo “sol”
    const backWash = pow(backDot, float(2.6));
    const frontWash = pow(frontDot, float(2.3));

    const backCol = params.sunBackColor;
    const frontCol = params.sunFrontColor;
    const night = vec3(0.04, 0.035, 0.07);

    const sky = night
      .add(backCol.mul(backWash.mul(0.38)))
      .add(frontCol.mul(frontWash.mul(0.34)));

    const elev = smoothstep(float(-0.55), float(0.65), view.y);
    const elevTint = mix(frontCol.mul(0.07), backCol.mul(0.09), elev);
    const lit = sky.add(elevTint).mul(params.ambientIntensity.mul(0.55).add(0.4));
    return vec4(lit, 1.0);
  })();

  const syncColors = () => {
    const back = params.sunBackColor.value;
    const front = params.sunFrontColor.value;
    lightBack.color.copy(back);
    lightFront.color.copy(front);
    dirBack.color.copy(back);
    dirFront.color.copy(front);
  };

  const syncIntensity = () => {
    const i = Math.max(0, params.ambientIntensity.value);
    lightBack.intensity = 0.9 + i * 2.0;
    lightFront.intensity = 0.75 + i * 1.8;
    dirBack.intensity = 0.12 + i * 0.28;
    dirFront.intensity = 0.1 + i * 0.24;
    fill.intensity = 0.08 + i * 0.1;
  };

  const sync = () => {
    syncColors();
    syncIntensity();
  };
  sync();

  return {
    lightBack,
    lightFront,
    syncIntensity,
    syncColors,
    sync,
    dispose() {
      scene.remove(lightBack, lightFront, dirBack, dirBack.target, dirFront, dirFront.target, fill);
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

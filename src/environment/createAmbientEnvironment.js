import * as THREE from 'three/webgpu';
import { Fn, color, float, mix, positionWorldDirection, smoothstep, vec4 } from 'three/tsl';

/**
 * Ambiente lejano al plano de partículas:
 * morado arriba · azul abajo (hemisferio + luces puntuales distantes + fondo degradado).
 */
export function createAmbientEnvironment(scene, params) {
  // Hemisferio: ilumina el “cielo” morado y el “suelo” azul
  const hemi = new THREE.HemisphereLight(0x9b6bdb, 0x3a6fd8, 0.55);
  hemi.name = 'AmbientHemi';
  scene.add(hemi);

  // Luz morada lejana, por encima del plano
  const lightTop = new THREE.PointLight(0xb794f6, 2.4, 120, 1.6);
  lightTop.position.set(-6, 32, -8);
  lightTop.name = 'AmbientTopPurple';
  scene.add(lightTop);

  const lightTopB = new THREE.PointLight(0x8b5cf6, 1.6, 100, 1.8);
  lightTopB.position.set(10, 28, 14);
  lightTopB.name = 'AmbientTopPurpleB';
  scene.add(lightTopB);

  // Luz azul lejana, por debajo del plano
  const lightBottom = new THREE.PointLight(0x3b82f6, 2.2, 120, 1.6);
  lightBottom.position.set(4, -24, 6);
  lightBottom.name = 'AmbientBottomBlue';
  scene.add(lightBottom);

  const lightBottomB = new THREE.PointLight(0x60a5fa, 1.4, 100, 1.8);
  lightBottomB.position.set(-12, -20, -4);
  lightBottomB.name = 'AmbientBottomBlueB';
  scene.add(lightBottomB);

  // Relleno muy suave para no dejar negros absolutos
  const fill = new THREE.AmbientLight(0x1a1428, 0.18);
  fill.name = 'AmbientFill';
  scene.add(fill);

  // Fondo 3D: degradado por dirección de vista (morado arriba → azul abajo)
  scene.background = null;
  scene.backgroundNode = Fn(() => {
    const y = positionWorldDirection.y;
    const t = smoothstep(float(-0.85), float(0.9), y);

    const bottom = color('#143a8c'); // azul inferior
    const mid = color('#08060f');
    const top = color('#6b3fa0'); // morado superior

    const lower = mix(bottom, mid, smoothstep(float(-0.85), float(0.05), y));
    const upper = mix(mid, top, smoothstep(float(0.05), float(0.9), y));
    const col = mix(lower, upper, t);

    // Intensidad del ambiente (uniforme del LAB)
    const lit = col.mul(params.ambientIntensity.mul(0.55).add(0.45));
    return vec4(lit, 1.0);
  })();

  const syncIntensity = () => {
    const i = params.ambientIntensity.value;
    hemi.intensity = 0.35 + i * 0.45;
    lightTop.intensity = 1.2 + i * 2.0;
    lightTopB.intensity = 0.8 + i * 1.4;
    lightBottom.intensity = 1.1 + i * 1.8;
    lightBottomB.intensity = 0.7 + i * 1.2;
    fill.intensity = 0.1 + i * 0.15;
  };
  syncIntensity();

  return {
    hemi,
    lightTop,
    lightBottom,
    syncIntensity,
    dispose() {
      scene.remove(hemi, lightTop, lightTopB, lightBottom, lightBottomB, fill);
      hemi.dispose?.();
      lightTop.dispose?.();
      lightTopB.dispose?.();
      lightBottom.dispose?.();
      lightBottomB.dispose?.();
      fill.dispose?.();
      scene.backgroundNode = null;
      scene.background = new THREE.Color('#04060a');
    }
  };
}

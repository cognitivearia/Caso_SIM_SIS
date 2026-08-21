import * as THREE from 'three/webgpu';
import { Fn, color, float, mix, positionWorldDirection, smoothstep, vec4 } from 'three/tsl';

/**
 * Ambiente lejano al plano de partículas:
 * morado arriba · azul abajo (más intenso).
 */
export function createAmbientEnvironment(scene, params) {
  const hemi = new THREE.HemisphereLight(0xb794f6, 0x3b82f6, 1.15);
  hemi.name = 'AmbientHemi';
  scene.add(hemi);

  const lightTop = new THREE.PointLight(0xd8b4fe, 5.5, 140, 1.35);
  lightTop.position.set(-6, 32, -8);
  lightTop.name = 'AmbientTopPurple';
  scene.add(lightTop);

  const lightTopB = new THREE.PointLight(0xa78bfa, 4.2, 120, 1.45);
  lightTopB.position.set(10, 28, 14);
  lightTopB.name = 'AmbientTopPurpleB';
  scene.add(lightTopB);

  const lightBottom = new THREE.PointLight(0x60a5fa, 5.0, 140, 1.35);
  lightBottom.position.set(4, -24, 6);
  lightBottom.name = 'AmbientBottomBlue';
  scene.add(lightBottom);

  const lightBottomB = new THREE.PointLight(0x38bdf8, 3.8, 120, 1.45);
  lightBottomB.position.set(-12, -20, -4);
  lightBottomB.name = 'AmbientBottomBlueB';
  scene.add(lightBottomB);

  const fill = new THREE.AmbientLight(0x2a1a48, 0.42);
  fill.name = 'AmbientFill';
  scene.add(fill);

  scene.background = null;
  scene.backgroundNode = Fn(() => {
    const y = positionWorldDirection.y;
    const t = smoothstep(float(-0.85), float(0.9), y);

    const bottom = color('#1d4ed8');
    const mid = color('#0a0614');
    const top = color('#7c3aed');

    const lower = mix(bottom, mid, smoothstep(float(-0.85), float(0.05), y));
    const upper = mix(mid, top, smoothstep(float(0.05), float(0.9), y));
    const col = mix(lower, upper, t);

    // Más saturado / visible
    const lit = col.mul(params.ambientIntensity.mul(0.9).add(0.65));
    return vec4(lit, 1.0);
  })();

  const syncIntensity = () => {
    const i = params.ambientIntensity.value;
    hemi.intensity = 0.7 + i * 0.9;
    lightTop.intensity = 2.8 + i * 4.5;
    lightTopB.intensity = 2.0 + i * 3.5;
    lightBottom.intensity = 2.6 + i * 4.2;
    lightBottomB.intensity = 1.8 + i * 3.2;
    fill.intensity = 0.25 + i * 0.35;
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

import * as THREE from 'three/webgpu';
import { Fn, color, float, mix, positionWorldDirection, smoothstep, vec3, vec4 } from 'three/tsl';

/**
 * Ambiente lejano: morado arriba · azul abajo, sin zonas negras.
 */
export function createAmbientEnvironment(scene, params) {
  const hemi = new THREE.HemisphereLight(0xc4b5fd, 0x60a5fa, 1.4);
  hemi.name = 'AmbientHemi';
  scene.add(hemi);

  const lightTop = new THREE.PointLight(0xe9d5ff, 6.5, 160, 1.2);
  lightTop.position.set(-6, 32, -8);
  lightTop.name = 'AmbientTopPurple';
  scene.add(lightTop);

  const lightTopB = new THREE.PointLight(0xc084fc, 5.0, 140, 1.3);
  lightTopB.position.set(10, 28, 14);
  lightTopB.name = 'AmbientTopPurpleB';
  scene.add(lightTopB);

  // Extra fill superior (evita el “techo negro”)
  const lightTopC = new THREE.DirectionalLight(0xd8b4fe, 1.35);
  lightTopC.position.set(0, 20, 2);
  lightTopC.name = 'AmbientTopDir';
  scene.add(lightTopC);

  const lightBottom = new THREE.PointLight(0x93c5fd, 6.0, 160, 1.2);
  lightBottom.position.set(4, -24, 6);
  lightBottom.name = 'AmbientBottomBlue';
  scene.add(lightBottom);

  const lightBottomB = new THREE.PointLight(0x38bdf8, 4.5, 140, 1.3);
  lightBottomB.position.set(-12, -20, -4);
  lightBottomB.name = 'AmbientBottomBlueB';
  scene.add(lightBottomB);

  const fill = new THREE.AmbientLight(0x5b4a8a, 0.75);
  fill.name = 'AmbientFill';
  scene.add(fill);

  scene.background = null;
  scene.backgroundNode = Fn(() => {
    const y = positionWorldDirection.y;
    // Degradado continuo azul → morado, sin paso por negro
    const t = smoothstep(float(-0.75), float(0.85), y);
    const bottom = color('#3b82f6');
    const top = color('#a78bfa');
    const col = mix(bottom, top, t);

    // Piso de luminancia: nunca cae a negro aunque ambient esté bajo
    const floorCol = color('#4a3d78');
    const lifted = mix(floorCol, col, float(0.72));
    const lit = lifted.mul(params.ambientIntensity.mul(0.55).add(0.7));
    // Relleno violeta suave en todo el espacio
    const wash = vec3(0.14, 0.1, 0.22).mul(params.ambientIntensity.mul(0.25).add(0.55));
    return vec4(lit.add(wash), 1.0);
  })();

  const syncIntensity = () => {
    const i = params.ambientIntensity.value;
    hemi.intensity = 1.0 + i * 1.0;
    lightTop.intensity = 3.5 + i * 5.0;
    lightTopB.intensity = 2.5 + i * 4.0;
    lightTopC.intensity = 0.8 + i * 1.2;
    lightBottom.intensity = 3.2 + i * 4.8;
    lightBottomB.intensity = 2.2 + i * 3.8;
    fill.intensity = 0.5 + i * 0.55;
  };
  syncIntensity();

  return {
    hemi,
    lightTop,
    lightBottom,
    syncIntensity,
    dispose() {
      scene.remove(hemi, lightTop, lightTopB, lightTopC, lightBottom, lightBottomB, fill);
      hemi.dispose?.();
      lightTop.dispose?.();
      lightTopB.dispose?.();
      lightTopC.dispose?.();
      lightBottom.dispose?.();
      lightBottomB.dispose?.();
      fill.dispose?.();
      scene.backgroundNode = null;
      scene.background = new THREE.Color('#4a3d78');
    }
  };
}

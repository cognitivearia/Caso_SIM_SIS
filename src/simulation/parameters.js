import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    time: uniform(0.0),
    maxSpeed: uniform(7.0),
    particleSize: uniform(0.012),

    // Plano base (dunas / olas)
    planeSpring: uniform(6.5),
    waveAmp: uniform(0.28),
    waveFreqX: uniform(1.1),
    waveFreqZ: uniform(0.85),
    waveSpeed: uniform(1.35),
    dragCoefficient: uniform(0.32),

    // Capa 1 · dos vórtices de atracción (esquinas del canvas)
    layer1Enabled: uniform(0.0),
    layer1Attract: uniform(5.5),
    layer1Vortex: uniform(3.8),
    layer1Softening: uniform(0.45),
    // Superior-derecha e inferior-izquierda (vista de cámara por defecto)
    vortexTR: uniform(new THREE.Vector3(4.6, 3.1, 2.8)),
    vortexBL: uniform(new THREE.Vector3(-4.6, 0.2, 5.2))
  };
}

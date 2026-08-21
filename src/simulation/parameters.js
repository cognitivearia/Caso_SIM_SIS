import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    time: uniform(0.0),
    maxSpeed: uniform(6.0),
    particleSize: uniform(0.028),

    // Plano base (dunas / olas)
    planeSpring: uniform(6.5),
    waveAmp: uniform(0.28),
    waveFreqX: uniform(1.1),
    waveFreqZ: uniform(0.85),
    waveSpeed: uniform(1.35),
    dragCoefficient: uniform(0.35),

    // Capa 1 · orbes laterales
    layer1Enabled: uniform(0.0),
    // 0 = formación (atrae laterales), 1 = pulso (ya no atrae del suelo)
    layer1Mode: uniform(0.0),
    layer1Attract: uniform(7.5),
    layer1OrbRadius: uniform(0.55),
    layer1PulseAmp: uniform(0.22),
    layer1PulseSpeed: uniform(1.4),
    layer1LateralBand: uniform(2.4),
    orbLeft: uniform(new THREE.Vector3(-3.6, 1.15, 1.5)),
    orbRight: uniform(new THREE.Vector3(3.6, 1.15, 1.5))
  };
}

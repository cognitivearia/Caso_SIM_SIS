import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    time: uniform(0.0),
    maxSpeed: uniform(6.0),
    particleSize: uniform(0.032),

    // Orbe central
    orbRadius: uniform(2.2),
    orbSpringStrength: uniform(10.0),
    orbThickness: uniform(0.06),

    dragEnabled: uniform(1.0),
    dragCoefficient: uniform(0.18),

    // Actor 1 · Maza (picos en el exterior)
    maceEnabled: uniform(0.0),
    maceStrength: uniform(14.0),
    maceSpikeCount: uniform(8.0),
    maceSharpness: uniform(2.5),

    // Actor 2 · Ondas en X desde el centro
    waveEnabled: uniform(0.0),
    waveStrength: uniform(3.0),
    waveFrequency: uniform(2.8),
    waveSpeed: uniform(4.0)
  };
}

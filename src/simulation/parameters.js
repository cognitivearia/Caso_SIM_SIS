import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    time: uniform(0.0),
    maxSpeed: uniform(10.0),
    particleSize: uniform(0.032),

    // Orbe central — resorte fuerte para volver siempre a la esfera
    orbRadius: uniform(2.2),
    orbSpringStrength: uniform(28.0),
    orbThickness: uniform(0.04),
    recoveryBoost: uniform(1.0),

    dragEnabled: uniform(1.0),
    dragCoefficient: uniform(0.55),

    // Actor 1 · Maza — offset radial temporal (no fuerza persistente)
    macePulse: uniform(0.0),
    maceStrength: uniform(0.85),
    maceSpikeCount: uniform(10.0),
    maceSharpness: uniform(10.0),

    // Actor 2 · Ondas anulares en X — mismo look, también via target temporal
    wavePulse: uniform(0.0),
    waveOriginTime: uniform(0.0),
    waveStrength: uniform(0.55),
    waveFrequency: uniform(4.5),
    waveSpeed: uniform(5.5),
    waveWidth: uniform(0.55)
  };
}

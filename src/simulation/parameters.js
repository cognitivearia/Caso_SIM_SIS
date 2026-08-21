import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    time: uniform(0.0),
    maxSpeed: uniform(8.0),
    particleSize: uniform(0.032),

    // Orbe central
    orbRadius: uniform(2.2),
    orbSpringStrength: uniform(12.0),
    orbThickness: uniform(0.05),

    dragEnabled: uniform(1.0),
    dragCoefficient: uniform(0.22),

    // Actor 1 · Maza (picos afilados) — macePulse es la envolvente 0..1
    macePulse: uniform(0.0),
    maceStrength: uniform(28.0),
    maceSpikeCount: uniform(10.0),
    maceSharpness: uniform(10.0),

    // Actor 2 · Ondas anulares en X — wavePulse es la envolvente 0..1
    wavePulse: uniform(0.0),
    waveOriginTime: uniform(0.0),
    waveStrength: uniform(1.35),
    waveFrequency: uniform(4.5),
    waveSpeed: uniform(5.5),
    waveWidth: uniform(0.55)
  };
}

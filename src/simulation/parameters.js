import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    time: uniform(0.0),
    maxSpeed: uniform(9.0),
    particleSize: uniform(0.018),

    // Plano base (dunas / olas)
    planeSpring: uniform(5.5),
    waveAmp: uniform(0.28),
    waveFreqX: uniform(1.1),
    waveFreqZ: uniform(0.85),
    waveSpeed: uniform(1.35),
    dragCoefficient: uniform(0.22),
    // Qué tanto se deforman unas capas con otras (0 = solo coexisten, 1 = cruce fuerte)
    layerCrossTalk: uniform(0.65),

    // Look · estelas / bloom / glow
    trailStretch: uniform(2.8),
    trailDamp: uniform(0.9),
    glowFalloff: uniform(7.5),
    bloomStrength: uniform(0.18),
    bloomRadius: uniform(0.35),
    bloomThreshold: uniform(0.45),

    // Ambiente lejano · morado arriba / azul abajo
    ambientIntensity: uniform(1.35),
    ambientMix: uniform(0.22),

    // Glitch (0 = limpio · 1 = fuerte)
    glitchAmount: uniform(0.35),

    // Capa 1 · vórtices
    layer1Enabled: uniform(0.0),
    layer1Attract: uniform(8.5),
    layer1Vortex: uniform(5.5),
    layer1Flow: uniform(3.2),
    layer1Chaos: uniform(2.4),
    layer1Softening: uniform(0.55),
    vortexTR: uniform(new THREE.Vector3(5.4, 0.65, 0.2)),
    vortexBL: uniform(new THREE.Vector3(-5.4, 0.45, 9.0)),

    // Capa 2 · redes neuronales (filamentos definidos)
    layer2Enabled: uniform(0.0),
    layer2Spring: uniform(16.0),
    layer2Pulse: uniform(0.05),
    layer2BranchLen: uniform(3.8),
    layer2Organic: uniform(0.55),
    layer2Thickness: uniform(0.09),

    // Capa 3 · líneas paralelas con onda de sierra armónica
    layer3Enabled: uniform(0.0),
    layer3Spring: uniform(14.0),
    // 0 = pocas líneas gruesas · 1 = muchas líneas delgadas
    layer3Density: uniform(0.45),
    layer3Amplitude: uniform(0.55),
    layer3Frequency: uniform(0.55),
    layer3Speed: uniform(0.85),
    // Separación total en Z (más bajo = líneas más juntas)
    layer3Span: uniform(6.2),

    // Capa 4 · torbellino con camino (bucles) y cola hacia −Z
    layer4Enabled: uniform(0.0),
    layer4Spring: uniform(15.0),
    layer4Radius: uniform(1.15),
    layer4Depth: uniform(7.5),
    layer4Turns: uniform(4.5),
    layer4Spin: uniform(2.1),
    layer4Pull: uniform(0.55),
    layer4Streak: uniform(0.28),
    layer4PathSpeed: uniform(0.12)
  };
}

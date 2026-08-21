import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  atan,
  cameraViewMatrix,
  color,
  cos,
  exp,
  float,
  floor,
  fract,
  hash,
  instanceIndex,
  instancedArray,
  max,
  min,
  mix,
  mod,
  sin,
  smoothstep,
  sqrt,
  step,
  uint,
  uv,
  vec2,
  vec3,
  vec4
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 524288 }) {
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');
  const homeBuffer = instancedArray(count, 'vec3');

  const initParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);
    const home = homeBuffer.element(i);

    const r1 = hash(i.add(uint(11)));
    const r2 = hash(i.add(uint(23)));
    const r3 = hash(i.add(uint(37)));

    const x = r1.sub(0.5).mul(12.0);
    const z = r2.mul(14.0).sub(2.0);
    const y = r3.sub(0.5).mul(0.04);

    home.assign(vec3(x, y, z));
    p.assign(vec3(x, y, z));
    v.assign(vec3(0.0, 0.0, 0.0));
  })().compute(count).setName('Initialize Horizon Plane');

  const updateParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);
    const home = homeBuffer.element(i);

    const dt = params.dt.mul(params.timeScale);
    const force = vec3(0.0).toVar();

    const hx = home.x;
    const hy = home.y;
    const hz = home.z;

    // --- BASE: plano que ondula ---
    const wave = sin(hx.mul(params.waveFreqX).add(params.time.mul(params.waveSpeed)))
      .mul(params.waveAmp)
      .add(
        sin(hz.mul(params.waveFreqZ).sub(params.time.mul(params.waveSpeed.mul(0.7))))
          .mul(params.waveAmp.mul(0.65))
      )
      .add(
        sin(hx.add(hz).mul(0.55).add(params.time.mul(0.9)))
          .mul(params.waveAmp.mul(0.35))
      );

    const baseTarget = vec3(hx, hy.add(wave), hz).toVar();
    const target = baseTarget.toVar();
    const springK = params.planeSpring.toVar();

    // --- CAPA 1: vórtices TR / BL ---
    const diag = hx.mul(0.65).sub(hz.sub(4.5).mul(0.55));
    const wTR = smoothstep(float(-0.35), float(1.1), diag).mul(params.layer1Enabled);
    const wBL = smoothstep(float(-0.35), float(1.1), diag.mul(-1.0)).mul(params.layer1Enabled);
    const seam = max(float(1.0).sub(abs(diag).mul(0.55)), float(0.0)).mul(params.layer1Enabled);

    const toTR = params.vortexTR.sub(p);
    const toBL = params.vortexBL.sub(p);
    const dTR = max(toTR.length(), params.layer1Softening);
    const dBL = max(toBL.length(), params.layer1Softening);
    const dirTR = toTR.div(dTR);
    const dirBL = toBL.div(dBL);

    const flowTR = vec3(0.80, 0.16, -0.58);
    const flowBL = vec3(-0.78, 0.10, 0.62);

    const pullTR = dirTR.mul(params.layer1Attract).div(dTR.add(0.5))
      .add(flowTR.mul(params.layer1Flow).mul(smoothstep(float(0.0), float(5.0), dTR)));
    const pullBL = dirBL.mul(params.layer1Attract).div(dBL.add(0.5))
      .add(flowBL.mul(params.layer1Flow).mul(smoothstep(float(0.0), float(5.0), dBL)));

    const swirlPhase = sin(params.time.mul(1.7)).mul(0.25).add(1.0);
    const spinTR = vec3(0.0, 1.0, 0.0).cross(dirTR)
      .mul(params.layer1Vortex).div(dTR.add(0.35)).mul(swirlPhase);
    const spinBL = vec3(0.0, 1.0, 0.0).cross(dirBL)
      .mul(params.layer1Vortex.mul(-1.15)).div(dBL.add(0.35))
      .mul(sin(params.time.mul(1.3)).mul(0.3).add(1.0));

    const n1 = hash(i.add(uint(101))).sub(0.5);
    const n2 = hash(i.add(uint(207))).sub(0.5);
    const n3 = hash(i.add(uint(313))).sub(0.5);
    const wobble = vec3(
      sin(p.z.mul(1.8).add(params.time.mul(2.4)).add(n1.mul(6.28))),
      cos(p.x.mul(1.3).add(params.time.mul(1.9)).add(n2.mul(6.28))).mul(0.55),
      sin(p.x.mul(1.1).sub(p.z.mul(0.9)).add(params.time.mul(2.1)).add(n3.mul(6.28)))
    ).mul(params.layer1Chaos);

    force.addAssign(pullTR.add(spinTR).mul(wTR));
    force.addAssign(pullBL.add(spinBL).mul(wBL));
    force.addAssign(wobble.mul(wTR.add(wBL).mul(0.5).add(seam.mul(0.35))));

    const influence1 = max(wTR, wBL).mul(0.9).add(seam.mul(0.2)).clamp(0.0, 0.92);

    // --- CAPA 2: esqueleto neuronal = tubos finos (filamentos legibles) ---
    const a = hash(i.add(uint(17)));
    const b = hash(i.add(uint(41)));
    const c = hash(i.add(uint(67)));
    const d = hash(i.add(uint(97)));
    const e = hash(i.add(uint(131)));
    const f = hash(i.add(uint(163)));
    const g = hash(i.add(uint(193)));
    const h = hash(i.add(uint(227)));

    const h0 = vec3(-2.3, 1.55, 3.1);
    const h1 = vec3(2.5, 2.25, 1.9);
    const h2 = vec3(0.15, 2.95, 4.9);
    const h3 = vec3(-3.15, 1.05, 6.3);
    const h4 = vec3(3.05, 1.4, 4.1);
    const h5 = vec3(0.55, 3.25, 1.15);
    const h6 = vec3(-1.35, 2.35, 2.35);
    const h7 = vec3(1.85, 1.15, 5.55);

    const hubSel = floor(a.mul(7.999));
    const hub = mix(h0, h1, step(0.5, hubSel)).toVar();
    hub.assign(mix(hub, h2, step(1.5, hubSel)));
    hub.assign(mix(hub, h3, step(2.5, hubSel)));
    hub.assign(mix(hub, h4, step(3.5, hubSel)));
    hub.assign(mix(hub, h5, step(4.5, hubSel)));
    hub.assign(mix(hub, h6, step(5.5, hubSel)));
    hub.assign(mix(hub, h7, step(6.5, hubSel)));

    // Soma compacto (~7%)
    const onSoma = step(b, 0.07);
    const somaR = mix(0.12, 0.28, c);
    const somaTheta = d.mul(6.28318530718);
    const somaCos = e.mul(2.0).sub(1.0);
    const somaSin = sqrt(max(float(1.0).sub(somaCos.mul(somaCos)), 0.02));
    const pulse = sin(params.time.mul(0.85).add(a.mul(6.28))).mul(params.layer2Pulse);
    const somaPos = hub.add(
      vec3(somaSin.mul(cos(somaTheta)), somaCos, somaSin.mul(sin(somaTheta)))
        .mul(somaR.mul(float(1.0).add(pulse)))
    );

    // Ramas primarias discretas (18 por hub) → filamentos claros, no nube
    const branchCount = float(18.0);
    const branchId = floor(c.mul(branchCount));
    const theta = branchId.add(d.sub(0.5).mul(0.22)).div(branchCount).mul(6.28318530718);
    const elev = mix(-0.35, 0.95, e.add(f).mul(0.5));
    const elevLen = sqrt(max(float(1.0).sub(elev.mul(elev)), 0.05));
    const mainDir = vec3(elevLen.mul(cos(theta)), elev, elevLen.mul(sin(theta)));

    // t a lo largo de la rama (un poco más densidad cerca del hub)
    const t = g.pow(1.15).mul(0.98).add(0.01);
    const len = params.layer2BranchLen.mul(mix(0.75, 1.2, h));

    const up = vec3(0.0, 1.0, 0.0);
    const sideA = up.cross(mainDir);
    const side = sideA.div(max(sideA.length(), 0.05));
    const binormal = mainDir.cross(side);

    // Curva suave controlada (organic bajo = filamento legible)
    const bendAmt = params.layer2Organic.mul(0.22).mul(t).mul(t);
    const centerline = hub
      .add(mainDir.mul(t.mul(len)))
      .add(side.mul(sin(t.mul(3.6).add(a.mul(6.28))).mul(bendAmt)))
      .add(binormal.mul(cos(t.mul(2.8).add(b.mul(4.0))).mul(bendAmt.mul(0.65))));

    // Grosor del tubo: grueso en hub, muy fino en punta
    const tubeR = params.layer2Thickness
      .mul(mix(1.15, 0.12, t.pow(0.75)))
      .mul(mix(0.85, 1.15, f));
    const tubeAng = h.mul(6.28318530718);
    const tubeOff = side.mul(cos(tubeAng)).add(binormal.mul(sin(tubeAng))).mul(tubeR.mul(e));
    const primaryPos = centerline.add(tubeOff);

    // --- Fork nivel 1: nueva rama fina que nace a ~40% ---
    const onFork1 = step(0.55, b).mul(step(0.35, f));
    const fork1StartT = mix(0.32, 0.48, c);
    const fork1Origin = hub
      .add(mainDir.mul(fork1StartT.mul(len)))
      .add(side.mul(sin(fork1StartT.mul(3.6).add(a.mul(6.28))).mul(params.layer2Organic.mul(0.08))));
    const fork1Yaw = a.add(f).mul(6.28318530718);
    const fork1Dir = side.mul(cos(fork1Yaw)).add(binormal.mul(sin(fork1Yaw))).add(mainDir.mul(0.55));
    const fork1DirN = fork1Dir.div(max(fork1Dir.length(), 0.05));
    const t1 = max(t.sub(fork1StartT), 0.0).div(max(float(1.0).sub(fork1StartT), 0.05));
    const fork1Len = len.mul(mix(0.35, 0.7, g));
    const fork1Side = up.cross(fork1DirN).div(max(up.cross(fork1DirN).length(), 0.05));
    const fork1R = params.layer2Thickness.mul(mix(0.55, 0.08, t1.pow(0.7)));
    const fork1Ang = d.mul(6.28318530718);
    const fork1Pos = fork1Origin
      .add(fork1DirN.mul(t1.mul(fork1Len)))
      .add(fork1Side.mul(cos(fork1Ang)).mul(fork1R.mul(e)))
      .add(fork1DirN.cross(fork1Side).mul(sin(fork1Ang)).mul(fork1R.mul(e)));

    // --- Fork nivel 2: ramita terminal ---
    const onFork2 = step(0.7, c).mul(step(0.5, g)).mul(onFork1);
    const fork2StartT = mix(0.55, 0.72, d);
    const fork2Origin = fork1Origin.add(fork1DirN.mul(fork2StartT.mul(fork1Len)));
    const fork2Yaw = e.add(h).mul(6.28318530718);
    const fork2Dir = fork1Side.mul(cos(fork2Yaw)).add(fork1DirN.mul(0.4)).add(binormal.mul(sin(fork2Yaw).mul(0.6)));
    const fork2DirN = fork2Dir.div(max(fork2Dir.length(), 0.05));
    const t2 = max(t1.sub(0.35), 0.0);
    const fork2Len = fork1Len.mul(mix(0.3, 0.55, a));
    const fork2R = params.layer2Thickness.mul(mix(0.28, 0.05, t2.clamp(0.0, 1.0)));
    const fork2Pos = fork2Origin
      .add(fork2DirN.mul(t2.mul(fork2Len)))
      .add(fork1Side.mul(sin(f.mul(6.28))).mul(fork2R));

    // --- Puentes finos entre hubs ---
    const otherSel = floor(mod(f.mul(7.999).add(1.0), 8.0));
    const other = mix(h0, h1, step(0.5, otherSel)).toVar();
    other.assign(mix(other, h2, step(1.5, otherSel)));
    other.assign(mix(other, h3, step(2.5, otherSel)));
    other.assign(mix(other, h4, step(3.5, otherSel)));
    other.assign(mix(other, h5, step(4.5, otherSel)));
    other.assign(mix(other, h6, step(5.5, otherSel)));
    other.assign(mix(other, h7, step(6.5, otherSel)));
    const bridgeT = t;
    const bridgeDir = other.sub(hub);
    const bridgeN = bridgeDir.div(max(bridgeDir.length(), 0.05));
    const bridgeSide = up.cross(bridgeN).div(max(up.cross(bridgeN).length(), 0.05));
    const bridgeBend = bridgeSide.mul(sin(bridgeT.mul(3.14159)).mul(0.28).mul(params.layer2Organic));
    const bridgeR = params.layer2Thickness.mul(mix(0.35, 0.07, abs(bridgeT.sub(0.5)).mul(2.0)));
    const bridgePos = mix(hub, other, bridgeT)
      .add(bridgeBend)
      .add(bridgeSide.mul(cos(h.mul(6.28))).mul(bridgeR.mul(e)));
    const onBridge = step(0.9, b);

    const filament = mix(primaryPos, mix(fork1Pos, fork2Pos, onFork2), onFork1);
    const neuralTarget = mix(mix(filament, somaPos, onSoma), bridgePos, onBridge);

    // --- CAPA 3: líneas paralelas + onda de sierra armónica ---
    const s1 = hash(i.add(uint(307)));
    const s2 = hash(i.add(uint(353)));
    const s3 = hash(i.add(uint(401)));

    // Densidad → cantidad de líneas (pocas↔muchas)
    const density = params.layer3Density.clamp(0.0, 1.0);
    const lineCount = max(mix(5.0, 38.0, density), 2.0);
    const lineId = floor(s1.mul(lineCount));

    // Grosor inverso a la densidad: menos líneas = más gruesas
    const thickScale = mix(2.4, 0.35, density);
    const lineThick = s3.sub(0.5).mul(0.045).mul(thickScale);

    // Posición a lo largo de la línea (eje X)
    const along = s2.sub(0.5).mul(11.5);
    // Span más corto → menor distancia entre líneas
    const lineZ = lineId.add(0.5).div(lineCount).mul(params.layer3Span).add(
      float(4.2).sub(params.layer3Span.mul(0.5))
    );

    // Armónicos: línea n vibra a frecuencia (n+1) · f0, desfasada
    const harmonic = lineId.add(1.0);
    const sawPhase = along.mul(params.layer3Frequency).mul(harmonic.mul(0.12).add(0.55))
      .add(params.time.mul(params.layer3Speed).mul(harmonic.mul(0.35).add(0.65)))
      .add(lineId.mul(0.37));
    const saw = fract(sawPhase);
    const sawY = saw.mul(params.layer3Amplitude).mul(mix(0.75, 1.2, s3));

    const sawLinesTarget = vec3(along, sawY.add(0.15), lineZ.add(lineThick));

    // --- CAPA 4: torbellino con personalidad (camino del boceto) ---
    // izquierda → arco arriba → loop grande (arriba-der) → cruce → loop chico → salida +X
    // Cola / profundidad hacia −Z
    const m1 = hash(i.add(uint(457)));
    const m2 = hash(i.add(uint(509)));
    const m3 = hash(i.add(uint(563)));
    const m4 = hash(i.add(uint(617)));

    const sPath = fract(m1.mul(0.92).add(0.04).add(params.time.mul(params.layer4PathSpeed).mul(0.15)));
    const twopi = float(6.28318530718);
    const zNear = float(6.2);
    const zFar = zNear.sub(params.layer4Depth.mul(0.55));

    // Waypoints del boceto (Z más negativo = más profundo / cola)
    const pStart = vec3(-4.4, 1.65, zNear);
    const pClimb = vec3(-0.35, 3.35, mix(zNear, zFar, 0.35));
    const cBig = vec3(2.55, 3.55, mix(zNear, zFar, 0.72));
    const pCross = vec3(0.15, 2.35, mix(zNear, zFar, 0.48));
    const cSmall = vec3(-1.55, 1.95, mix(zNear, zFar, 0.28));
    const pEnd = vec3(4.6, 0.28, mix(zNear, zFar, 0.12));

    // Radios de loops (elipse aplastada como en el dibujo)
    const bigRx = float(1.55);
    const bigRy = float(1.05);
    const bigRz = float(0.7);
    const smallRx = float(0.9);
    const smallRy = float(0.7);
    const smallRz = float(0.42);

    // Puntos de empalme continuo entre tramos
    const bigEntry = cBig.add(vec3(bigRx, 0.0, bigRz.mul(-0.2)));
    const bigExit = cBig.add(vec3(bigRx.mul(-0.15), bigRy.mul(-0.85), bigRz.mul(0.35)));
    const smallEntry = cSmall.add(vec3(smallRx.mul(0.85), smallRy.mul(0.2), smallRz.mul(-0.15)));
    const smallExit = cSmall.add(vec3(smallRx.mul(0.55), smallRy.mul(-0.75), smallRz.mul(0.25)));

    const inClimb = step(sPath, 0.26);
    const inBig = step(0.26, sPath).mul(float(1.0).sub(step(0.5, sPath)));
    const inBridge = step(0.5, sPath).mul(float(1.0).sub(step(0.64, sPath)));
    const inSmall = step(0.64, sPath).mul(float(1.0).sub(step(0.82, sPath)));
    const inExit = step(0.82, sPath);

    const tClimb = sPath.div(0.26).clamp(0.0, 1.0);
    const tBig = sPath.sub(0.26).div(0.24).clamp(0.0, 1.0);
    const tBridge = sPath.sub(0.5).div(0.14).clamp(0.0, 1.0);
    const tSmall = sPath.sub(0.64).div(0.18).clamp(0.0, 1.0);
    const tExit = sPath.sub(0.82).div(0.18).clamp(0.0, 1.0);

    // Ease suave (smoothstep cúbico)
    const tClimbS = tClimb.mul(tClimb).mul(float(3.0).sub(tClimb.mul(2.0)));
    const tBridgeS = tBridge.mul(tBridge).mul(float(3.0).sub(tBridge.mul(2.0)));
    const tExitS = tExit.mul(tExit).mul(float(3.0).sub(tExit.mul(2.0)));

    // 1) Arco de subida (izquierda → arriba-derecha, llega a entrada del loop grande)
    const climbMid = mix(pStart, pClimb, float(0.55)).add(vec3(0.4, 0.55, -0.35));
    const climbPos = mix(mix(pStart, climbMid, tClimbS), mix(climbMid, bigEntry, tClimbS), tClimbS);

    // 2) Loop grande: elipse con eje vertical (línea punteada del boceto) + −Z
    const bigAng = tBig.mul(twopi);
    const bigPos = cBig.add(vec3(
      cos(bigAng).mul(bigRx),
      sin(bigAng).mul(bigRy),
      cos(bigAng).mul(bigRz.mul(-0.25)).add(sin(bigAng).mul(bigRz.mul(-0.55)))
    ));

    // 3) Puente: baja cruzando el trazo anterior hacia el loop chico
    const pathBridge = mix(
      mix(bigExit, pCross, tBridgeS),
      mix(pCross, smallEntry, tBridgeS),
      tBridgeS
    );

    // 4) Loop chico (centro-izquierda)
    const smallAng = tSmall.mul(twopi);
    const smallPos = cSmall.add(vec3(
      cos(smallAng).mul(smallRx),
      sin(smallAng).mul(smallRy),
      sin(smallAng).mul(smallRz.mul(-0.65))
    ));

    // 5) Salida: barrido hacia +X (flecha del boceto)
    const exitPos = mix(smallExit, pEnd, tExitS).add(
      vec3(0.0, sin(tExitS.mul(3.14159)).mul(-0.25), 0.0)
    );

    const pathCenter = climbPos.mul(inClimb)
      .add(bigPos.mul(inBig))
      .add(pathBridge.mul(inBridge))
      .add(smallPos.mul(inSmall))
      .add(exitPos.mul(inExit));

    // Tangentes por tramo (orientan el remolino a lo largo del camino)
    const climbTan = mix(vec3(1.1, 0.85, -0.55), vec3(1.2, 0.15, -0.7), tClimbS);
    const bigTan = vec3(
      sin(bigAng).mul(bigRx).mul(-1.0),
      cos(bigAng).mul(bigRy),
      sin(bigAng).mul(bigRz.mul(0.25)).add(cos(bigAng).mul(bigRz.mul(-0.55)))
    );
    const bridgeTan = mix(vec3(-1.1, -0.7, 0.55), vec3(-0.85, -0.35, 0.25), tBridgeS);
    const smallTan = vec3(
      sin(smallAng).mul(smallRx).mul(-1.0),
      cos(smallAng).mul(smallRy),
      cos(smallAng).mul(smallRz.mul(-0.65))
    );
    const exitTan = vec3(1.25, -0.35, 0.2);

    const pathFwd = climbTan.mul(inClimb)
      .add(bigTan.mul(inBig))
      .add(bridgeTan.mul(inBridge))
      .add(smallTan.mul(inSmall))
      .add(exitTan.mul(inExit));
    const pathTangent = pathFwd.div(max(pathFwd.length(), 0.05));
    const upHint = vec3(0.0, 1.0, 0.0);
    const pathSide = upHint.cross(pathTangent);
    const pathSideN = pathSide.div(max(pathSide.length(), 0.05));
    const pathNormal = pathTangent.cross(pathSideN);

    // Tubo más grueso en los loops; se afila en la salida (cola)
    const inLoop = max(inBig, inSmall);
    const whirlR = params.layer4Radius
      .mul(mix(0.5, 1.35, inLoop))
      .mul(mix(1.0, 0.32, inExit))
      .mul(mix(0.85, 1.2, m2));

    const swirl = m3.mul(twopi)
      .add(sPath.mul(params.layer4Turns).mul(twopi))
      .add(params.time.mul(params.layer4Spin));

    const orb = pathSideN.mul(cos(swirl)).add(pathNormal.mul(sin(swirl))).mul(whirlR);
    // Cola hacia −Z (más marcada al avanzar por el camino)
    const tail = vec3(0.0, -0.08, -1.0).mul(
      params.layer4Pull.mul(mix(0.2, 0.7, sPath)).mul(whirlR.mul(0.4))
    );

    const streakDir = pathSideN.mul(sin(swirl).mul(-1.0)).add(pathNormal.mul(cos(swirl))).add(pathTangent.mul(0.45));
    const streakN = streakDir.div(max(streakDir.length(), 0.05));
    const streak = streakN.mul(params.layer4Streak).mul(mix(0.3, 1.35, m4)).mul(mix(1.15, 0.4, sPath));

    const jitter = vec3(m1.sub(0.5), m2.sub(0.5).mul(0.7), m3.sub(0.5).mul(0.5)).mul(0.06);
    const maelstromTarget = pathCenter.add(orb).add(tail).add(streak.mul(m4.sub(0.5).mul(2.0))).add(jitter);

    // --- Cruce entre capas ---
    // 1) Cada estructura se deforma con las otras activas (no se pisan).
    // 2) Las partículas se reparten entre capas encendidas (siguen siendo legibles).
    const xt = params.layerCrossTalk;
    const e1 = params.layer1Enabled;
    const e2 = params.layer2Enabled;
    const e3 = params.layer3Enabled;
    const e4 = params.layer4Enabled;

    const vToTR = params.vortexTR.sub(p);
    const vToBL = params.vortexBL.sub(p);
    const vDTR = max(vToTR.length(), float(0.6));
    const vDBL = max(vToBL.length(), float(0.6));
    const vortexTwist = vec3(0.0, 1.0, 0.0).cross(vToTR.div(vDTR)).mul(e1.mul(xt).mul(0.55).div(vDTR.add(0.4)))
      .add(vec3(0.0, 1.0, 0.0).cross(vToBL.div(vDBL)).mul(e1.mul(xt).mul(-0.6).div(vDBL.add(0.4))));

    const sawRipple = vec3(
      0.0,
      sawY.mul(e3.mul(xt).mul(0.55)),
      sin(hx.mul(params.layer3Frequency).add(params.time.mul(params.layer3Speed))).mul(e3.mul(xt).mul(0.2))
    );

    const neuralPull = hub.sub(p).mul(e2.mul(xt).mul(0.12));
    const neuralLift = vec3(0.0, e2.mul(xt).mul(0.18).mul(smoothstep(float(0.8), float(2.4), hub.y)), 0.0);

    const toPath = pathCenter.sub(p);
    const pathDist = max(toPath.length(), float(0.35));
    const maelPull = toPath.mul(e4.mul(xt).mul(0.14).div(pathDist.add(0.5)));
    const maelTwist = pathTangent.cross(toPath).mul(e4.mul(xt).mul(0.08).div(pathDist.add(0.35)));

    // Cada capa recibe influencia de las demás (no de sí misma)
    const neuralX = neuralTarget
      .add(vortexTwist.mul(1.1))
      .add(sawRipple)
      .add(maelPull)
      .add(maelTwist.mul(0.65));

    const sawX = sawLinesTarget
      .add(vortexTwist)
      .add(neuralPull)
      .add(neuralLift)
      .add(maelPull.mul(1.15))
      .add(maelTwist);

    const maelX = maelstromTarget
      .add(vortexTwist.mul(0.85))
      .add(neuralPull.mul(0.7))
      .add(sawRipple.mul(0.8))
      .add(vec3(
        sin(params.time.mul(1.1).add(hub.x)).mul(e2.mul(xt).mul(0.12)),
        cos(params.time.mul(0.9).add(hub.z)).mul(e2.mul(xt).mul(0.1)),
        0.0
      ));

    // Reparto de partículas entre capas estructurales activas
    const structSum = e2.add(e3).add(e4);
    const role = hash(i.add(uint(701)));
    const edge2 = e2.div(max(structSum, 0.001));
    const edge3 = e2.add(e3).div(max(structSum, 0.001));
    const belong2 = e2.mul(float(1.0).sub(step(edge2, role)));
    const belong3 = e3.mul(step(edge2, role)).mul(float(1.0).sub(step(edge3, role)));
    const belong4 = e4.mul(step(edge3, role));
    // Si no hay capa estructural, belong* = 0 → queda el plano base

    const structTarget = neuralX.mul(belong2).add(sawX.mul(belong3)).add(maelX.mul(belong4));
    const structOn = min(structSum, float(1.0));
    target.assign(mix(baseTarget, structTarget, structOn.mul(0.94)));

    // Resortes: promedio ponderado de las capas a las que pertenece la partícula
    const springStruct = params.layer2Spring.mul(belong2)
      .add(params.layer3Spring.mul(belong3))
      .add(params.layer4Spring.mul(belong4));
    const springBase = params.planeSpring.mul(float(1.0).sub(influence1));
    springK.assign(mix(springBase, springStruct, structOn));

    // Fuerzas cruzadas suaves (todas las capas empujan un poco, no solo la “dueña”)
    force.addAssign(neuralTarget.sub(p).mul(e2.mul(xt).mul(0.9)).mul(float(1.0).sub(belong2)));
    force.addAssign(sawLinesTarget.sub(p).mul(e3.mul(xt).mul(0.75)).mul(float(1.0).sub(belong3)));
    force.addAssign(maelstromTarget.sub(p).mul(e4.mul(xt).mul(0.85)).mul(float(1.0).sub(belong4)));

    force.addAssign(wobble.mul(e2.mul(0.035).add(e3.mul(0.03)).add(e4.mul(0.045))));

    force.addAssign(target.sub(p).mul(springK));
    const layerDrag = max(e2, max(e3, e4));
    const drag = params.dragCoefficient.mul(mix(1.0, 2.6, layerDrag));
    force.addAssign(v.mul(drag).mul(-1.0));

    v.addAssign(force.mul(dt));

    const speed = v.length();
    If(speed.greaterThan(params.maxSpeed), () => {
      v.assign(v.normalize().mul(params.maxSpeed));
    });

    p.addAssign(v.mul(dt));
  })().compute(count).setName('Update Horizon Layers');

  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  });

  material.positionNode = positionBuffer.toAttribute();

  // Tamaño base + estela: se alarga con la velocidad (look de trazo de luz)
  material.scaleNode = Fn(() => {
    const pos = positionBuffer.toAttribute();
    const vel = velocityBuffer.toAttribute();
    const speedT = vel.length().div(params.maxSpeed).clamp(0.0, 1.0);

    const hubGlow = smoothstep(float(1.0), float(2.6), pos.y);
    const neuralScale = mix(0.45, 1.55, hubGlow);
    const sawScale = mix(1.35, 0.5, params.layer3Density);
    const maelScale = mix(1.05, 0.55, pos.x.mul(0.08).add(0.5).clamp(0.0, 1.0));
    const e2s = params.layer2Enabled;
    const e3s = params.layer3Enabled;
    const e4s = params.layer4Enabled;
    const sSum = max(e2s.add(e3s).add(e4s), 0.001);
    const structScale = neuralScale.mul(e2s).add(sawScale.mul(e3s)).add(maelScale.mul(e4s)).div(sSum);
    const size = params.particleSize.mul(mix(float(1.0), structScale, min(e2s.add(e3s).add(e4s), float(1.0))));

    const stretch = mix(float(1.0), params.trailStretch, speedT.mul(speedT));
    const thin = mix(float(1.0), float(0.42), speedT);
    return vec2(size.mul(stretch), size.mul(thin));
  })();

  // Orientar la estela en espacio de vista (dirección del movimiento en pantalla)
  material.rotationNode = Fn(() => {
    const vel = velocityBuffer.toAttribute();
    const viewVel = cameraViewMatrix.mul(vec4(vel, 0.0)).xy;
    return atan(viewVel.y, viewVel.x);
  })();

  // Paleta armónica compartida: ámbar cálido + teal fresco + marfil + tinta
  material.colorNode = Fn(() => {
    const pos = positionBuffer.toAttribute();
    const speed = velocityBuffer.toAttribute().length();
    const heightT = pos.y.mul(0.45).add(0.25).clamp(0.0, 1.0);
    const speedT = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    const depthT = pos.z.div(8.0).clamp(0.0, 1.0);

    const amber = color('#e6a46c');
    const teal = color('#6eb8c4');
    const ivory = color('#f2ebe0');
    const ink = color('#0c1016');

    // Base · dunas cálidas → espuma teal
    const dune = color('#c9a078');
    const foam = mix(teal, ivory, 0.35);
    const planeCol = mix(dune, foam, heightT);

    // Neuronas · cobre / rosa-tierra → marfil en somas (misma familia cálida)
    const deep = color('#2a2220');
    const axon = color('#7a5a52');
    const flesh = color('#a87862');
    const neuralBase = mix(deep, mix(axon, flesh, heightT), float(1.0).sub(depthT.mul(0.3)));
    const nearHub = smoothstep(float(1.15), float(2.85), pos.y);
    const neuralCol = mix(neuralBase, mix(ivory, amber, 0.35), nearHub.mul(0.95));

    // Sierra · teal → marfil frío (complemento del ámbar)
    const sawCold = mix(teal, color('#4a9aaa'), 0.35);
    const sawWarm = mix(ivory, teal, 0.2);
    const sawCol = mix(sawCold, sawWarm, heightT);

    // Torbellino · marfil → gris cálido → tinta (misma curva tonal)
    const funnelT = float(6.2).sub(pos.z).div(4.5).clamp(0.0, 1.0);
    const warmGrey = color('#6e675f');
    const maelCol = mix(ivory, mix(warmGrey, ink, funnelT), funnelT.mul(0.78));

    const e2c = params.layer2Enabled;
    const e3c = params.layer3Enabled;
    const e4c = params.layer4Enabled;
    const cSum = max(e2c.add(e3c).add(e4c), 0.001);
    const structCol = neuralCol.mul(e2c).add(sawCol.mul(e3c)).add(maelCol.mul(e4c)).div(cSum);
    const base = mix(planeCol, structCol, min(e2c.add(e3c).add(e4c), float(1.0)));

    // Destello de velocidad (ámbar compartido) + boost para que el bloom lo recoja
    const lit = mix(base, amber, speedT.mul(0.22));

    // Lavado ambiental lejano: morado arriba · azul abajo (según altura de la partícula)
    const ambT = smoothstep(float(-0.4), float(3.2), pos.y);
    const ambPurple = color('#b794f6');
    const ambBlue = color('#60a5fa');
    const ambWash = mix(ambBlue, ambPurple, ambT).mul(params.ambientMix).mul(params.ambientIntensity);
    const litAmb = lit.add(ambWash);

    // Glitch en partícula: saltos de canal y destellos irregulares
    const gAmt = params.glitchAmount;
    const gNoise = fract(sin(pos.x.mul(17.3).add(pos.z.mul(9.1)).add(params.time.mul(11.0))).mul(43758.5453));
    const gKick = step(float(0.94).sub(gAmt.mul(0.2)), gNoise);
    const chanSnap = mix(
      litAmb,
      vec3(litAmb.b, litAmb.r, litAmb.g).mul(1.25),
      gKick.mul(gAmt)
    );
    const tearFlash = mix(float(1.0), float(1.55), gKick.mul(gAmt).mul(
      step(float(0.5), fract(sin(params.time.mul(23.0).add(pos.y.mul(5.0))).mul(991.0)))
    ));

    const bloomBoost = float(1.0).add(speedT.mul(0.28));
    return vec4(chanSnap.mul(bloomBoost).mul(tearFlash), 1.0);
  })();

  // Glow suave + micro-jitter UV cuando hay glitch
  material.opacityNode = Fn(() => {
    const g = params.glitchAmount;
    const jitter = vec2(
      sin(params.time.mul(37.0).add(uv().y.mul(70.0))).mul(g.mul(0.03)),
      cos(params.time.mul(29.0).add(uv().x.mul(50.0))).mul(g.mul(0.015))
    );
    const d = uv().add(jitter).sub(0.5).length();
    return exp(d.mul(d).mul(params.glowFalloff.mul(-1.0))).mul(0.95);
  })();

  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function reset() {
    renderer.compute(initParticles);
  }

  function stepSimulation() {
    renderer.compute(updateParticles);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
  }

  return {
    count,
    positionBuffer,
    velocityBuffer,
    homeBuffer,
    reset,
    stepSimulation,
    dispose
  };
}

import * as THREE from 'three/webgpu';
import {
  Fn,
  convertToTexture,
  float,
  floor,
  fract,
  mix,
  pass,
  sin,
  step,
  uv,
  vec2,
  vec3,
  vec4
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';

/**
 * Cadena post: estelas → bloom suave → glitch (RGB split + cortes horizontales).
 */
export function createPostFx({ renderer, scene, camera, params }) {
  const renderPipeline = new THREE.RenderPipeline(renderer);

  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');

  const trailPass = afterImage(sceneColor, params.trailDamp);
  const trailColor = trailPass.getTextureNode();

  const bloomPass = bloom(
    trailColor,
    params.bloomStrength,
    params.bloomRadius,
    params.bloomThreshold
  );

  const beauty = convertToTexture(trailColor.add(bloomPass));

  const glitched = Fn(() => {
    const uv0 = uv().toVar();
    const t = params.time;
    const g = params.glitchAmount;

    // Bandas horizontales que “saltan” (look glitch / VHS)
    const band = floor(uv0.y.mul(28.0));
    const bandNoise = fract(sin(band.mul(12.9898).add(t.mul(2.3))).mul(43758.5453));
    const tear = step(float(0.88).sub(g.mul(0.35)), bandNoise);
    const slide = bandNoise.sub(0.5).mul(g).mul(0.11).mul(tear);

    // Micro-jitter vertical ocasional
    const rowKick = step(float(0.96).sub(g.mul(0.2)), fract(sin(t.mul(7.1)).mul(43758.5453)));
    const yJitter = rowKick.mul(g).mul(0.012).mul(sin(t.mul(40.0)));

    const baseUv = uv0.add(vec2(slide, yJitter));

    // Separación RGB (más fuerte en las bandas rotas)
    const rgbAmt = g.mul(0.0035).add(tear.mul(g).mul(0.014));
    const uvR = baseUv.add(vec2(rgbAmt, 0.0));
    const uvG = baseUv;
    const uvB = baseUv.sub(vec2(rgbAmt, rgbAmt.mul(0.35)));

    const cr = beauty.sample(uvR);
    const cga = beauty.sample(uvG);
    const cb = beauty.sample(uvB);

    let col = vec3(cr.r, cga.g, cb.b).toVar();

    // Scanlines + ruido digital
    const scan = sin(uv0.y.mul(920.0).add(t.mul(18.0))).mul(0.5).add(0.5);
    const grain = fract(sin(uv0.x.mul(120.0).add(uv0.y.mul(80.0)).add(t.mul(30.0))).mul(43758.5453));
    col.assign(col.mul(mix(float(1.0), scan.mul(0.1).add(0.9), g.mul(0.55))));
    col.assign(col.add(grain.sub(0.5).mul(g).mul(0.08)));

    // Destello cian/magenta en cortes (acento glitch)
    const accent = mix(vec3(1.0), vec3(1.15, 0.85, 1.25), tear.mul(g));
    col.assign(col.mul(accent));

    // Bloque “freeze”: a veces apaga franjas
    const drop = step(float(0.985).sub(g.mul(0.08)), fract(sin(band.mul(7.1).add(t.mul(1.9))).mul(937.0)));
    col.assign(mix(col, col.mul(0.15), drop.mul(g)));

    return vec4(col, cga.a);
  })();

  renderPipeline.outputNode = glitched;

  return {
    renderPipeline,
    render() {
      renderPipeline.render();
    },
    dispose() {
      trailPass.dispose?.();
      bloomPass.dispose?.();
    }
  };
}

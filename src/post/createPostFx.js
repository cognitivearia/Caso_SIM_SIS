import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';

/**
 * Cadena post: escena → estelas (afterimage) → bloom ligero.
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

  renderPipeline.outputNode = trailColor.add(bloomPass);

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

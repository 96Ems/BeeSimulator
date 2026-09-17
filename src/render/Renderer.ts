import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from "three";

/**
 * Create the WebGL renderer with the colour pipeline configured.
 *
 * This looks like boilerplate, but two of these lines carry most of the visual quality:
 * ACES filmic tone mapping and the sRGB output colour space. Without them the scene renders
 * flat and washed out no matter how good the models are (ARCHITECTURE §6.2).
 */
export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });

  // Cap the pixel ratio: a 4K display at devicePixelRatio 2 renders 4x the pixels for
  // almost no visible gain, and this is the easiest way to lose the frame budget.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  return renderer;
}

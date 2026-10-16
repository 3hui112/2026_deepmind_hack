import * as THREE from 'three';

/**
 * Standard thermal color scale according to specification:
 * - < 22°C: Blue (#38bdf8)
 * - 22 ~ 25°C: Green (#34d399)
 * - 25 ~ 27°C: Yellow (#facc15)
 * - 27 ~ 30°C: Orange (#fb923c)
 * - >= 30°C: Red (#ef4444)
 */
export function getThermalColorRgba(
  temp: number,
  alpha: number = 220
): [number, number, number, number] {
  if (temp < 22.0) {
    return [56, 189, 248, alpha]; // Sky blue
  } else if (temp < 25.0) {
    return [52, 211, 153, alpha]; // Green
  } else if (temp < 27.0) {
    return [250, 204, 21, alpha]; // Yellow
  } else if (temp < 30.0) {
    return [251, 146, 60, alpha]; // Orange
  } else {
    return [239, 68, 68, alpha]; // Red
  }
}

export function getThermalColorHex(temp: number): number {
  if (temp < 22.0) return 0x38bdf8;
  if (temp < 25.0) return 0x34d399;
  if (temp < 27.0) return 0xfacc15;
  if (temp < 30.0) return 0xfb923c;
  return 0xef4444;
}

export function getThermalColorCss(temp: number): string {
  if (temp < 22.0) return '#38bdf8';
  if (temp < 25.0) return '#34d399';
  if (temp < 27.0) return '#facc15';
  if (temp < 30.0) return '#fb923c';
  return '#ef4444';
}

/**
 * Converts a Float32Array temperatureGrid into a Three.js DataTexture.
 * Note: Caller is responsible for disposing previous textures to prevent leaks.
 */
export function createThermalDataTexture(
  temperatureGrid: Float32Array,
  gridWidth: number,
  gridDepth: number
): THREE.DataTexture {
  const size = gridWidth * gridDepth;
  const rgbaData = new Uint8Array(4 * size);

  for (let i = 0; i < size; i++) {
    const temp = temperatureGrid[i];
    const [r, g, b, a] = getThermalColorRgba(temp, 225);
    const offset = i * 4;
    rgbaData[offset] = r;
    rgbaData[offset + 1] = g;
    rgbaData[offset + 2] = b;
    rgbaData[offset + 3] = a;
  }

  const texture = new THREE.DataTexture(
    rgbaData,
    gridWidth,
    gridDepth,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );

  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Creates an offscreen Canvas with the thermal heatmap for 2D software rendering.
 */
export function createThermalCanvas2D(
  temperatureGrid: Float32Array,
  gridWidth: number,
  gridDepth: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = gridWidth;
  canvas.height = gridDepth;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(gridWidth, gridDepth);
  const data = imgData.data;

  for (let i = 0; i < temperatureGrid.length; i++) {
    const temp = temperatureGrid[i];
    const [r, g, b, a] = getThermalColorRgba(temp, 210);
    const offset = i * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

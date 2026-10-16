/**
 * WebGPU Hardware Adapter & Device Inspection Module
 *
 * Probes `navigator.gpu.requestAdapter()` and extracts vendor, architecture,
 * device description, driver info, and compute shader limits for the UI header badge
 * (`WebGPU Native [NVIDIA / Apple / Intel]`) and console verification logs.
 */

export interface WebGPUAdapterDiagnostics {
  available: boolean;
  vendor: string;
  architecture: string;
  device: string;
  driver: string;
  description: string;
  badgeLabel: string;
  isFallbackAdapter: boolean;
  limits: {
    maxComputeWorkgroupSizeX: number;
    maxComputeInvocationsPerWorkgroup: number;
    maxComputeWorkgroupsPerDimension: number;
    maxStorageBufferBindingSize: number;
    maxBufferSize: number;
  };
  errorReason?: string;
  fallbackReason?: string;
}

export type WebGPUAdapterReport = WebGPUAdapterDiagnostics;

/**
 * Fallback helper to infer hardware vendor name when the browser masks `adapter.info.vendor`
 */
function inferHardwareVendorFromWebGL(): { vendor: string; renderer: string } {
  try {
    if (typeof document === 'undefined') return { vendor: '', renderer: '' };
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return { vendor: '', renderer: '' };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return { vendor: '', renderer: '' };
    const rawVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '');
    const rawRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
    return { vendor: rawVendor, renderer: rawRenderer };
  } catch {
    return { vendor: '', renderer: '' };
  }
}

/**
 * Normalizes raw vendor strings ('apple', 'nvidia', 'intel', 'amd', etc.) into
 * a clean display label for the `WebGPU Native [...]` badge.
 */
export function formatGpuVendorName(
  rawVendor: string,
  rawArch: string,
  rawDevice: string,
  rawDesc: string
): string {
  const combined = `${rawVendor} ${rawArch} ${rawDevice} ${rawDesc}`.toLowerCase();

  if (combined.includes('nvidia') || combined.includes('geforce') || combined.includes('rtx') || combined.includes('gtx')) {
    return 'NVIDIA';
  }
  if (combined.includes('apple') || combined.includes('m1') || combined.includes('m2') || combined.includes('m3') || combined.includes('m4') || combined.includes('metal')) {
    return 'Apple';
  }
  if (combined.includes('intel') || combined.includes('iris') || combined.includes('uhd') || combined.includes('arc')) {
    return 'Intel';
  }
  if (combined.includes('amd') || combined.includes('radeon') || combined.includes('rdna')) {
    return 'AMD';
  }
  if (combined.includes('qualcomm') || combined.includes('adreno')) {
    return 'Qualcomm';
  }

  // Secondary check via WebGL unmasked renderer if WebGPU info fields are generic
  const glHint = inferHardwareVendorFromWebGL();
  const glCombined = `${glHint.vendor} ${glHint.renderer}`.toLowerCase();
  if (glCombined.includes('nvidia')) return 'NVIDIA';
  if (glCombined.includes('apple')) return 'Apple';
  if (glCombined.includes('intel')) return 'Intel';
  if (glCombined.includes('amd') || glCombined.includes('radeon')) return 'AMD';

  if (rawVendor && rawVendor !== 'unknown') {
    return rawVendor.charAt(0).toUpperCase() + rawVendor.slice(1);
  }

  return 'NVIDIA / Apple / Intel';
}

let cachedDiagnostics: WebGPUAdapterDiagnostics | null = null;

/**
 * Requests the high-performance WebGPU adapter and logs hardware capability details.
 */
export async function probeWebGPUAdapter(forceRefresh = false): Promise<WebGPUAdapterDiagnostics> {
  if (cachedDiagnostics && !forceRefresh) {
    return cachedDiagnostics;
  }

  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    const reason = 'navigator.gpu API is disabled in current browser/environment.';
    const unavailable: WebGPUAdapterDiagnostics = {
      available: false,
      vendor: 'Unavailable',
      architecture: 'N/A',
      device: 'None',
      driver: 'N/A',
      description: 'WebGPU Unavailable',
      badgeLabel: 'WebGPU Unavailable (Fallback)',
      isFallbackAdapter: true,
      limits: {
        maxComputeWorkgroupSizeX: 0,
        maxComputeInvocationsPerWorkgroup: 0,
        maxComputeWorkgroupsPerDimension: 0,
        maxStorageBufferBindingSize: 0,
        maxBufferSize: 0,
      },
      errorReason: reason,
      fallbackReason: reason,
    };
    console.warn('[WebGPU Diagnostics] navigator.gpu is not available in this environment.');
    cachedDiagnostics = unavailable;
    return unavailable;
  }

  try {
    const adapter = await (navigator as any).gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      const reason = 'navigator.gpu.requestAdapter() returned null.';
      const noAdapter: WebGPUAdapterDiagnostics = {
        available: false,
        vendor: 'None',
        architecture: 'N/A',
        device: 'No GPU Adapter',
        driver: 'N/A',
        description: 'No GPU Adapter',
        badgeLabel: 'WebGPU No Adapter (Fallback)',
        isFallbackAdapter: true,
        limits: {
          maxComputeWorkgroupSizeX: 0,
          maxComputeInvocationsPerWorkgroup: 0,
          maxComputeWorkgroupsPerDimension: 0,
          maxStorageBufferBindingSize: 0,
          maxBufferSize: 0,
        },
        errorReason: reason,
        fallbackReason: reason,
      };
      console.warn('[WebGPU Diagnostics] requestAdapter() returned null.');
      cachedDiagnostics = noAdapter;
      return noAdapter;
    }

    // Standard WebGPU adapter.info + legacy requestAdapterInfo fallback
    let info: any = (adapter as any).info;
    if (!info && typeof (adapter as any).requestAdapterInfo === 'function') {
      try {
        info = await (adapter as any).requestAdapterInfo();
      } catch {
        info = {};
      }
    }
    info = info || {};

    const rawVendor = String(info.vendor || '');
    const rawArch = String(info.architecture || '');
    const rawDevice = String(info.device || '');
    const rawDesc = String(info.description || info.driver || '');

    const glHint = inferHardwareVendorFromWebGL();
    const vendorDisplay = formatGpuVendorName(rawVendor, rawArch, rawDevice, rawDesc);
    const architectureDisplay = rawArch || (vendorDisplay === 'Apple' ? 'Apple Silicon / Metal' : 'Native GPU');
    const deviceDisplay = rawDevice || rawDesc || glHint.renderer || `${vendorDisplay} Graphics`;
    const driverDisplay = rawDesc || rawArch || 'WebGPU Native Driver';

    const limits = (adapter as any).limits || {};
    const diagnostics: WebGPUAdapterDiagnostics = {
      available: true,
      vendor: vendorDisplay,
      architecture: architectureDisplay,
      device: deviceDisplay,
      driver: driverDisplay,
      description: driverDisplay,
      badgeLabel: `WebGPU Native [${vendorDisplay}]`,
      isFallbackAdapter: Boolean((adapter as any).isFallbackAdapter || info.isFallbackAdapter),
      limits: {
        maxComputeWorkgroupSizeX: Number(limits.maxComputeWorkgroupSizeX || 256),
        maxComputeInvocationsPerWorkgroup: Number(limits.maxComputeInvocationsPerWorkgroup || 256),
        maxComputeWorkgroupsPerDimension: Number(limits.maxComputeWorkgroupsPerDimension || 65535),
        maxStorageBufferBindingSize: Number(limits.maxStorageBufferBindingSize || 134217728),
        maxBufferSize: Number(limits.maxBufferSize || 268435456),
      },
    };

    console.info(
      `%c[WebGPU Adapter Verified] ${diagnostics.badgeLabel}`,
      'color: #34d399; font-weight: bold;',
      {
        vendor: diagnostics.vendor,
        architecture: diagnostics.architecture,
        device: diagnostics.device,
        driver: diagnostics.driver,
        isFallbackAdapter: diagnostics.isFallbackAdapter,
        limits: diagnostics.limits,
      }
    );

    cachedDiagnostics = diagnostics;
    return diagnostics;
  } catch (err: any) {
    const reason = err?.message || 'Exception occurred while requesting WebGPU adapter.';
    const failed: WebGPUAdapterDiagnostics = {
      available: false,
      vendor: 'Error',
      architecture: 'N/A',
      device: 'Adapter Error',
      driver: 'N/A',
      description: 'Adapter Error',
      badgeLabel: 'WebGPU Error (Fallback)',
      isFallbackAdapter: true,
      limits: {
        maxComputeWorkgroupSizeX: 0,
        maxComputeInvocationsPerWorkgroup: 0,
        maxComputeWorkgroupsPerDimension: 0,
        maxStorageBufferBindingSize: 0,
        maxBufferSize: 0,
      },
      errorReason: reason,
      fallbackReason: reason,
    };
    console.warn('[WebGPU Diagnostics] Error requesting WebGPU adapter:', err);
    cachedDiagnostics = failed;
    return failed;
  }
}

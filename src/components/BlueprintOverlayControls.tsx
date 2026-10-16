import React, { useRef } from 'react';
import type { RoomDimensions } from '../domain/scenario';
import type { BlueprintOverlayConfig } from '../domain/rackSlots';
import {
  FileText,
  Upload,
  Maximize2,
  Sliders,
  CheckCircle2,
  Grid,
  Layers,
  RotateCcw,
} from 'lucide-react';

interface BlueprintOverlayControlsProps {
  room: RoomDimensions;
  onUpdateRoom: (room: RoomDimensions) => void;
  config: BlueprintOverlayConfig;
  onUpdateConfig: (config: BlueprintOverlayConfig) => void;
}

export const BlueprintOverlayControls: React.FC<BlueprintOverlayControlsProps> = ({
  room,
  onUpdateRoom,
  config,
  onUpdateConfig,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pyeong calculation: widthM * depthM / 3.305785
  const areaPyeong = ((room.widthM * room.depthM) / 3.305785).toFixed(1);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onUpdateConfig({
          ...config,
          enabled: true,
          imageUrl: event.target?.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 text-slate-100 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-950 text-sky-400 border border-sky-800">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              Server Room Custom Dimensions &amp; CAD Blueprint Overlay
            </h2>
            <p className="text-xs text-slate-400">
              Configure room dimensions (Pyeong/m) and custom CAD architectural floorplan overlays.
            </p>
          </div>
        </div>

        {/* Toggle Blueprint Overlay */}
        <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-semibold">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onUpdateConfig({ ...config, enabled: e.target.checked })}
            className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
          />
          <span className={config.enabled ? 'text-sky-300' : 'text-slate-400'}>
            Blueprint Layer {config.enabled ? 'ON' : 'OFF'}
          </span>
        </label>
      </div>

      {/* Grid Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Room Dimensions & Area in Pyeong */}
        <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
          <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>Room Area &amp; Height</span>
            <span className="text-sky-400 font-mono font-semibold">{areaPyeong} Pyeong</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Width (W)</label>
              <input
                type="number"
                min={8}
                max={40}
                step={0.5}
                value={room.widthM}
                onChange={(e) =>
                  onUpdateRoom({ ...room, widthM: Math.max(8, Number(e.target.value)) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Depth (D)</label>
              <input
                type="number"
                min={6}
                max={30}
                step={0.5}
                value={room.depthM}
                onChange={(e) =>
                  onUpdateRoom({ ...room, depthM: Math.max(6, Number(e.target.value)) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Height (H)</label>
              <input
                type="number"
                min={2.8}
                max={4.5}
                step={0.1}
                value={room.heightM}
                onChange={(e) =>
                  onUpdateRoom({ ...room, heightM: Math.max(2.8, Number(e.target.value)) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Blueprint File Upload */}
        <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
          <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>CAD Blueprint Upload</span>
            <span className="text-xs text-slate-400">PNG / JPG / SVG</span>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Blueprint Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/svg+xml"
              onChange={handleImageUpload}
              className="hidden"
            />
            {config.imageUrl ? (
              <div className="flex items-center justify-between bg-slate-900 p-1.5 rounded border border-slate-800 text-xs">
                <span className="text-sky-300 font-mono truncate max-w-[150px]">
                  ✓ Blueprint Applied
                </span>
                <button
                  onClick={() => onUpdateConfig({ ...config, imageUrl: '' })}
                  title="Reset to default CAD vector floorplan"
                  className="flex items-center gap-1 text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px]"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">
                Uploaded blueprint image will render on the 3D twin floor.
              </p>
            )}
          </div>
        </div>

        {/* Opacity & Scale Sliders */}
        <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
          <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>Blueprint Opacity &amp; Scale</span>
            <span className="text-sky-400 font-mono font-semibold">
              {Math.round(config.opacity * 100)}% / {Math.round(config.scale * 100)}%
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-12 shrink-0">Opacity</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.opacity}
                onChange={(e) => onUpdateConfig({ ...config, opacity: Number(e.target.value) })}
                className="w-full accent-sky-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 w-12 shrink-0">Scale</span>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={config.scale}
                onChange={(e) => onUpdateConfig({ ...config, scale: Number(e.target.value) })}
                className="w-full accent-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Alignment & Grid Snap Controls */}
        <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2 flex flex-col justify-between">
          <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>Grid Auto-Alignment</span>
            <span className="inline-flex items-center gap-1 text-emerald-400 font-mono">
              <CheckCircle2 className="w-3 h-3" />
              Aligned
            </span>
          </div>
          <button
            onClick={() =>
              onUpdateConfig({
                ...config,
                scale: 1.0,
                offsetXM: 0,
                offsetYM: 0,
                autoAligned: true,
              })
            }
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
          >
            <Grid className="w-3.5 h-3.5 text-sky-400" />
            Auto-Fit to 0.6m Grid
          </button>
        </div>
      </div>
    </div>
  );
};

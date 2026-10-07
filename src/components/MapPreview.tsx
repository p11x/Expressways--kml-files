import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Eye,
  EyeOff,
  Navigation,
  Info,
} from 'lucide-react';
import { CATEGORY_COLORS } from '../data/indianStates';
import { RoadCategory, StitchedRoad } from '../types';

interface MapPreviewProps {
  roads: StitchedRoad[];
  removedOverlapGeometries?: [number, number][][];
}

// Rough simplified coordinates for India outline for geographic context
const INDIA_OUTLINE: [number, number][] = [
  [74.0, 37.0], [77.0, 35.5], [78.5, 32.5], [80.5, 30.5], [81.0, 30.0],
  [88.0, 27.8], [89.0, 27.0], [92.0, 27.8], [97.0, 28.0], [95.5, 26.5],
  [93.5, 23.5], [92.0, 24.0], [89.0, 21.8], [87.0, 21.5], [85.0, 19.5],
  [80.0, 13.0], [77.5, 8.1], [76.5, 9.0], [74.5, 15.0], [72.8, 19.0],
  [70.0, 21.0], [68.5, 23.5], [71.0, 25.0], [74.0, 30.0], [74.0, 37.0],
];

export const MapPreview: React.FC<MapPreviewProps> = ({
  roads,
  removedOverlapGeometries = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Category visibility toggles
  const [visibleCategories, setVisibleCategories] = useState<
    Record<RoadCategory, boolean>
  >({
    motorway: true,
    expressway: true,
    link: true,
    construction: true,
    proposed: true,
  });

  const [showRemovedOverlaps, setShowRemovedOverlaps] = useState(false);

  // Viewport Transform State: center Lon/Lat & Zoom scale
  const [transform, setTransform] = useState({
    centerLon: 79.0,
    centerLat: 22.5,
    zoom: 1.0,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [hoveredRoad, setHoveredRoad] = useState<StitchedRoad | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Compute bounding box of all roads
  const dataBbox = useMemo(() => {
    if (roads.length === 0) {
      return { south: 8.0, west: 68.0, north: 37.0, east: 97.5 };
    }
    let south = 90,
      north = -90,
      west = 180,
      east = -180;
    for (const r of roads) {
      for (const line of r.geometries) {
        for (const [lon, lat] of line) {
          if (lat < south) south = lat;
          if (lat > north) north = lat;
          if (lon < west) west = lon;
          if (lon > east) east = lon;
        }
      }
    }
    return { south, west, north, east };
  }, [roads]);

  // Fit view to data bounds
  const fitToData = () => {
    const lonSpan = Math.max(2, dataBbox.east - dataBbox.west);
    const latSpan = Math.max(2, dataBbox.north - dataBbox.south);
    const maxSpan = Math.max(lonSpan, latSpan * 1.2);
    const zoom = Math.max(0.6, Math.min(15, 25 / maxSpan));

    setTransform({
      centerLon: (dataBbox.west + dataBbox.east) / 2,
      centerLat: (dataBbox.south + dataBbox.north) / 2,
      zoom,
    });
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setTransform((prev) => ({ ...prev, zoom: Math.min(30, prev.zoom * 1.35) }));
  };

  const handleZoomOut = () => {
    setTransform((prev) => ({ ...prev, zoom: Math.max(0.4, prev.zoom / 1.35) }));
  };

  const toggleCategory = (cat: RoadCategory) => {
    setVisibleCategories((prev) => ({ ...prev, [cat]: !prev [cat] }));
  };

  // Canvas drawing effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, width, height);

    // Map projection helper (Equirectangular Mercator-like)
    const baseScale = Math.min(width, height) / 30;
    const scale = baseScale * transform.zoom;

    const lonToX = (lon: number) => {
      return width / 2 + (lon - transform.centerLon) * scale;
    };
    const latToY = (lat: number) => {
      return height / 2 - (lat - transform.centerLat) * scale * 1.08;
    };

    // Draw Grid
    ctx.strokeStyle = '#1e293b'; // slate-800
    ctx.lineWidth = 0.5;
    const step = 5;
    for (let lon = 60; lon <= 100; lon += step) {
      const x = lonToX(lon);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let lat = 5; lat <= 40; lat += step) {
      const y = latToY(lat);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw India Context Outline
    ctx.beginPath();
    for (let i = 0; i < INDIA_OUTLINE.length; i++) {
      const [lon, lat] = INDIA_OUTLINE[i];
      const x = lonToX(lon);
      const y = latToY(lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
    ctx.fill();

    // Draw Removed Overlaps (in bright Red) if enabled
    if (showRemovedOverlaps && removedOverlapGeometries.length > 0) {
      ctx.strokeStyle = '#ef4444'; // Red
      ctx.lineWidth = 3.5;
      ctx.setLineDash([4, 4]);

      for (const line of removedOverlapGeometries) {
        if (line.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < line.length; i++) {
          const x = lonToX(line[i][0]);
          const y = latToY(line[i][1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Draw Roads
    for (const road of roads) {
      if (!visibleCategories[road.category]) continue;

      const colorMeta = CATEGORY_COLORS[road.category];
      const isHovered = hoveredRoad?.id === road.id;

      ctx.strokeStyle = isHovered ? '#ffffff' : colorMeta.hex;
      ctx.lineWidth = isHovered ? (colorMeta.width || 2) + 2 : (colorMeta.width || 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Slight glow for motorway / expressway
      if (road.category === 'motorway' || road.category === 'expressway' || isHovered) {
        ctx.shadowColor = isHovered ? '#ffffff' : colorMeta.hex;
        ctx.shadowBlur = isHovered ? 8 : 4;
      } else {
        ctx.shadowBlur = 0;
      }

      for (const line of road.geometries) {
        if (line.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < line.length; i++) {
          const x = lonToX(line[i][0]);
          const y = latToY(line[i][1]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0; // reset
  }, [
    roads,
    transform,
    visibleCategories,
    hoveredRoad,
    showRemovedOverlaps,
    removedOverlapGeometries,
  ]);

  // Mouse interaction handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    setMousePos({ x: mouseX, y: mouseY });

    if (isDragging && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const baseScale = Math.min(canvas.clientWidth, canvas.clientHeight) / 30;
      const scale = baseScale * transform.zoom;

      setTransform((prev) => ({
        ...prev,
        centerLon: prev.centerLon - dx / scale,
        centerLat: prev.centerLat + dy / (scale * 1.08),
      }));

      setDragStart({ x: e.clientX, y: e.clientY });
    } else {
      // Find hovered road (hit test within 8 pixels)
      const baseScale = Math.min(canvas.clientWidth, canvas.clientHeight) / 30;
      const scale = baseScale * transform.zoom;

      let foundRoad: StitchedRoad | null = null;
      for (const road of roads) {
        if (!visibleCategories[road.category]) continue;
        let match = false;
        for (const line of road.geometries) {
          for (let i = 0; i < line.length - 1; i++) {
            const x1 = canvas.clientWidth / 2 + (line[i][0] - transform.centerLon) * scale;
            const y1 = canvas.clientHeight / 2 - (line[i][1] - transform.centerLat) * scale * 1.08;
            const x2 = canvas.clientWidth / 2 + (line[i + 1][0] - transform.centerLon) * scale;
            const y2 = canvas.clientHeight / 2 - (line[i + 1][1] - transform.centerLat) * scale * 1.08;

            // Distance from point to segment in pixels
            const d = distToSegment({ x: mouseX, y: mouseY }, { x: x1, y: y1 }, { x: x2, y: y2 });
            if (d < 8) {
              match = true;
              break;
            }
          }
          if (match) break;
        }
        if (match) {
          foundRoad = road;
          break;
        }
      }
      setHoveredRoad(foundRoad);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setTransform((prev) => ({
      ...prev,
      zoom: Math.max(0.4, Math.min(30, prev.zoom * factor)),
    }));
  };

  // Calculate totals for legend
  const statsByCategory = useMemo(() => {
    const stats: Record<RoadCategory, { count: number; km: number }> = {
      motorway: { count: 0, km: 0 },
      expressway: { count: 0, km: 0 },
      link: { count: 0, km: 0 },
      construction: { count: 0, km: 0 },
      proposed: { count: 0, km: 0 },
    };

    for (const r of roads) {
      if (stats[r.category]) {
        stats[r.category].count++;
        stats[r.category].km += r.lengthKm;
      }
    }
    return stats;
  }, [roads]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
      {/* Map Header Toolbar */}
      <div className="p-3 sm:p-4 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">
            2D Canvas Interactive Map Preview
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            ({roads.length} roads loaded)
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {removedOverlapGeometries.length > 0 && (
            <button
              onClick={() => setShowRemovedOverlaps((p) => !p)}
              className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                showRemovedOverlaps
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Show trimmed overlapping lower-priority lines in dashed red"
            >
              Show Removed Overlaps ({removedOverlapGeometries.length})
            </button>
          )}

          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={fitToData}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors cursor-pointer"
              title="Fit to Data Extents"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="relative w-full h-[460px] bg-slate-950 select-none overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />

        {/* Empty state hint */}
        {roads.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
              <Layers className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-300">
              No Road Data Loaded Yet
            </p>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Select states and click &quot;Fetch Selected&quot; to download real OSM motorways and expressways.
            </p>
          </div>
        )}

        {/* Hovered Road Tooltip Card */}
        {hoveredRoad && mousePos && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900/95 border border-slate-700 p-3 rounded-lg shadow-2xl backdrop-blur-md text-xs max-w-xs transition-all"
            style={{
              left: Math.min(window.innerWidth - 300, mousePos.x + 15),
              top: Math.max(10, mousePos.y - 40),
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    CATEGORY_COLORS[hoveredRoad.category]?.hex || '#fff',
                }}
              />
              <span className="font-bold text-white truncate">
                {hoveredRoad.ref || hoveredRoad.name || 'Unnamed Road'}
              </span>
            </div>
            <div className="text-[11px] text-slate-300 space-y-0.5 mt-1 border-t border-slate-800 pt-1">
              <div>
                <span className="text-slate-500">Category:</span>{' '}
                <strong className="text-emerald-300">
                  {CATEGORY_COLORS[hoveredRoad.category]?.name}
                </strong>
              </div>
              {hoveredRoad.name && hoveredRoad.ref && (
                <div>
                  <span className="text-slate-500">Name:</span> {hoveredRoad.name}
                </div>
              )}
              <div>
                <span className="text-slate-500">Length:</span>{' '}
                {hoveredRoad.lengthKm.toFixed(2)} km
              </div>
              <div>
                <span className="text-slate-500">OSM Way IDs:</span>{' '}
                <span className="font-mono text-[10px]">
                  {hoveredRoad.originalWayIds.slice(0, 4).join(', ')}
                  {hoveredRoad.originalWayIds.length > 4 ? '...' : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Layer Category Filter Legend */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 shadow-xl backdrop-blur-md max-w-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
            <span>Road Categories</span>
            <span className="text-[9px] text-slate-500">Click to toggle</span>
          </div>

          <div className="space-y-1 text-xs">
            {(Object.keys(CATEGORY_COLORS) as RoadCategory[]).map((cat) => {
              const meta = CATEGORY_COLORS[cat];
              const isVis = visibleCategories[cat];
              const stat = statsByCategory[cat];

              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-slate-800 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm border shrink-0 transition-transform"
                      style={{
                        backgroundColor: isVis ? meta.hex : 'transparent',
                        borderColor: meta.hex,
                      }}
                    />
                    <span
                      className={`text-xs ${
                        isVis ? 'text-slate-200' : 'text-slate-500 line-through'
                      }`}
                    >
                      {meta.name}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {stat.count > 0 ? `${stat.km.toFixed(0)} km` : '0'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper: Distance from point P to segment AB in screen coordinates
function distToSegment(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): number {
  const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

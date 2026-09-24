import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  Ship,
  Port,
  RestrictedZone,
  WeatherCell,
  Role,
} from '../types.ts';
import { FleetInterpolator, InterpolatedShipState } from '../utils/interpolation.ts';
import { Plus, X, Layers, Trash2, AlertTriangle } from 'lucide-react';
import { getCargoInfo, CARGO_MAP } from '../utils/cargoTheme.ts';

interface TacticalMapProps {
  fleet: Ship[];
  ports: Port[];
  zones: RestrictedZone[];
  weatherGrid: WeatherCell[];
  navigableWater: [number, number][];
  selectedShipId: string | null;
  onSelectShip: (shipId: string) => void;
  serverTime: number;
  role: Role;
  onCreateZone: (zone: Omit<RestrictedZone, 'id' | 'createdAt'>) => void;
  onDeleteZone: (zoneId: string) => void;
  historicalPositions?: Array<{ shipId: string; position: [number, number]; heading: number; status: string }>;
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  fleet,
  ports,
  zones,
  weatherGrid,
  navigableWater,
  selectedShipId,
  onSelectShip,
  serverTime,
  role,
  onCreateZone,
  onDeleteZone,
  historicalPositions,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Basemap tile layers
  const oceanBaseLayerRef = useRef<L.TileLayer | null>(null);
  const oceanRefLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const [basemapType, setBasemapType] = useState<'ocean' | 'satellite'>('ocean');

  // Layer groups
  const waterLayerRef = useRef<L.Polygon | null>(null);
  const portsLayerRef = useRef<L.LayerGroup | null>(null);
  const weatherLayerRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const shipMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const selectedRouteLineRef = useRef<L.Polyline | null>(null);
  const selectedRouteTrailRef = useRef<L.Polyline | null>(null);
  const hoveredRouteLineRef = useRef<L.Polyline | null>(null);
  const selectedProximityCircleRef = useRef<L.Circle | null>(null);
  const drawingLayerRef = useRef<L.LayerGroup | null>(null);

  // Map state
  const [currentZoom, setCurrentZoom] = useState<number>(7);
  const [hoveredShipId, setHoveredShipId] = useState<string | null>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneReason, setNewZoneReason] = useState('');
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [showZoneManager, setShowZoneManager] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);
  const zoneManagerRef = useRef<HTMLDivElement>(null);

  // Interpolator
  const interpolatorRef = useRef<FleetInterpolator>(new FleetInterpolator());
  const animFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const interpolatedPositionsRef = useRef<Map<string, InterpolatedShipState>>(new Map());
  const hasFittedBoundsRef = useRef(false);
  const prevSelectedShipIdRef = useRef<string | null>(null);

  // Close legend popover on outside click or Esc
  useEffect(() => {
    if (!legendOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLegendOpen(false);
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) {
        setLegendOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [legendOpen]);

  useEffect(() => {
    if (!showZoneManager) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowZoneManager(false);
    };
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (zoneManagerRef.current && !zoneManagerRef.current.contains(e.target as Node)) {
        setShowZoneManager(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [showZoneManager]);

  // 1. Initialize Map with keyless Esri tiles & attribution
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [26.3, 55.2],
      zoom: 7,
      minZoom: 5,
      maxZoom: 14,
      zoomControl: false,
      attributionControl: true,
    });

    // Esri World Ocean Base
    const oceanBase = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 14,
        attribution:
          'Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri',
      }
    );

    // Esri World Ocean Reference (bathymetry labels, sea boundaries)
    const oceanRef = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 14,
        pane: 'overlayPane',
      }
    );

    // Esri World Imagery (Satellite)
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 17,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      }
    );

    oceanBase.addTo(map);
    oceanRef.addTo(map);

    oceanBaseLayerRef.current = oceanBase;
    oceanRefLayerRef.current = oceanRef;
    satelliteLayerRef.current = satellite;

    // Zoom control at bottom right (placed nicely)
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Track zoom level for label visibility rules
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    portsLayerRef.current = L.layerGroup().addTo(map);
    weatherLayerRef.current = L.layerGroup().addTo(map);
    zonesLayerRef.current = L.layerGroup().addTo(map);
    drawingLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Basemap Switcher effect
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !oceanBaseLayerRef.current || !oceanRefLayerRef.current || !satelliteLayerRef.current) return;

    if (basemapType === 'ocean') {
      satelliteLayerRef.current.remove();
      if (!map.hasLayer(oceanBaseLayerRef.current)) {
        oceanBaseLayerRef.current.addTo(map);
      }
      if (!map.hasLayer(oceanRefLayerRef.current)) {
        oceanRefLayerRef.current.addTo(map);
      }
    } else {
      oceanBaseLayerRef.current.remove();
      oceanRefLayerRef.current.remove();
      if (!map.hasLayer(satelliteLayerRef.current)) {
        satelliteLayerRef.current.addTo(map);
      }
    }
  }, [basemapType]);

  // Fit map to fleet bounding box on load so all 15 ships are visible
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasFittedBoundsRef.current || !fleet || fleet.length === 0) return;

    const validPositions = fleet
      .map((s) => s.position)
      .filter((p) => p && typeof p[0] === 'number' && typeof p[1] === 'number');

    if (validPositions.length >= 2) {
      const bounds = L.latLngBounds(validPositions);
      map.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 8,
      });
      hasFittedBoundsRef.current = true;
    }
  }, [fleet]);

  // Navigable water corridor (soft boundary)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigableWater || navigableWater.length < 3) return;

    if (waterLayerRef.current) {
      waterLayerRef.current.remove();
    }

    waterLayerRef.current = L.polygon(navigableWater, {
      color: '#0284c7',
      weight: 1.5,
      opacity: 0.25,
      fillColor: '#38bdf8',
      fillOpacity: 0.03,
      dashArray: '4, 6',
      interactive: false,
    }).addTo(map);
  }, [navigableWater]);

  // Ports: Small, lighter anchor pins so ships remain the prominent focus
  useEffect(() => {
    const layer = portsLayerRef.current;
    if (!layer || !ports) return;
    layer.clearLayers();

    const showLabels = currentZoom >= 8;

    for (const port of ports) {
      const portHtml = `
        <div class="flex items-center space-x-1 pointer-events-none select-none">
          <div class="w-3.5 h-3.5 rounded-full bg-slate-500/70 text-white flex items-center justify-center border border-white/80 shadow-xs">
            <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="5" r="3"></circle>
              <line x1="12" y1="22" x2="12" y2="8"></line>
              <path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>
            </svg>
          </div>
          ${
            showLabels
              ? `<span class="bg-white/90 text-slate-500 font-medium text-[9px] px-1 py-0.2 rounded border border-slate-200/80 whitespace-nowrap shadow-xs">
                  ${port.name}
                </span>`
              : ''
          }
        </div>
      `;

      const icon = L.divIcon({
        html: portHtml,
        className: 'custom-port-marker',
        iconSize: [showLabels ? 90 : 14, 14],
        iconAnchor: [7, 7],
      });

      L.marker([port.position[0], port.position[1]], { icon, interactive: false }).addTo(layer);
    }
  }, [ports, currentZoom]);

  // Weather cells: soft translucent purple/grey hatched areas with badges
  useEffect(() => {
    const layer = weatherLayerRef.current;
    if (!layer || !weatherGrid) return;
    layer.clearLayers();

    for (const w of weatherGrid) {
      const isAdv = w.isAdverse;
      const circle = L.circle([w.lat, w.lng], {
        radius: 34000,
        color: isAdv ? '#8b5cf6' : '#94a3b8',
        weight: 1.5,
        dashArray: isAdv ? '3, 4' : '2, 5',
        opacity: isAdv ? 0.6 : 0.25,
        fillColor: isAdv ? '#a78bfa' : '#cbd5e1',
        fillOpacity: isAdv ? 0.12 : 0.04,
        interactive: false,
      });

      if (isAdv) {
        const badgeHtml = `
          <div class="px-1.5 py-0.5 bg-purple-950/85 text-purple-200 rounded text-[9px] font-mono border border-purple-400/40 shadow-sm pointer-events-none whitespace-nowrap">
            Waves: ${w.waveHeight}m · Wind: ${w.windSpeed}kn
          </div>
        `;
        const icon = L.divIcon({
          html: badgeHtml,
          className: 'weather-marker-badge',
          iconSize: [90, 16],
          iconAnchor: [45, 8],
        });
        L.marker([w.lat, w.lng], { icon, interactive: false }).addTo(layer);
      }

      circle.addTo(layer);
    }
  }, [weatherGrid]);

  // Restricted Zones: Red 2px border with 15% red fill
  useEffect(() => {
    const layer = zonesLayerRef.current;
    if (!layer || !zones) return;
    layer.clearLayers();

    for (const zone of zones) {
      if (!zone.active || zone.polygon.length < 3) continue;

      const poly = L.polygon(zone.polygon, {
        color: '#dc2626',
        weight: 2,
        dashArray: '5, 4',
        opacity: 0.95,
        fillColor: '#dc2626',
        fillOpacity: 0.15,
      });

      poly.bindTooltip(
        `<div class="p-1">
           <div class="font-bold text-red-600 text-xs flex items-center gap-1">
             <span>⚠ RESTRICTED:</span> <span>${zone.name}</span>
           </div>
           <div class="text-[11px] text-slate-600">${zone.reason || 'Military Hazard Zone'}</div>
         </div>`,
        { sticky: true, className: 'leaflet-custom-zone-tooltip' }
      );

      poly.addTo(layer);
    }
  }, [zones]);

  // Feed targets into FleetInterpolator
  useEffect(() => {
    if (historicalPositions && historicalPositions.length > 0) return;
    interpolatorRef.current.updateTargets(
      fleet.map((s) => ({ shipId: s.shipId, position: s.position, heading: s.heading })),
      serverTime
    );
  }, [fleet, serverTime, historicalPositions]);

  // Continuous animation loop for vessel motion interpolation
  // Ship icons: 22px with white 1.5px outline
  const animate = useCallback((timestamp: number) => {
    const dtSeconds = Math.min((timestamp - lastFrameTimeRef.current) / 1000, 0.1);
    lastFrameTimeRef.current = timestamp;

    const map = mapRef.current;
    if (map) {
      const showLabels = currentZoom >= 8;

      if (historicalPositions && historicalPositions.length > 0) {
        for (const h of historicalPositions) {
          let marker = shipMarkersRef.current.get(h.shipId);
          const shipMeta = fleet.find((s) => s.shipId === h.shipId);
          const cargo = getCargoInfo(shipMeta?.cargo || '');
          const isSelected = selectedShipId === h.shipId;
          const isHovered = hoveredShipId === h.shipId;
          const isDistressed = h.status === 'distressed';
          const isStopped = h.status === 'no_fuel' || h.status === 'stranded';
          const isRerouting = h.status === 'rerouting';

          const markerColor = isDistressed ? '#dc2626' : isStopped ? '#94a3b8' : cargo.color;
          const showLabel = isSelected || isHovered || showLabels;

          const shipSvg = `
            <div class="relative flex flex-col items-center cursor-pointer select-none">
              ${
                isSelected
                  ? '<div class="absolute -top-1.5 -left-1.5 w-9 h-9 rounded-full ring-2 ring-amber-500 bg-amber-400/25 pointer-events-none"></div>'
                  : ''
              }
              ${
                isDistressed
                  ? '<div class="absolute -top-2 -left-2 w-10 h-10 rounded-full border-2 border-red-600 distressed-ring-pulse pointer-events-none"></div>'
                  : ''
              }
              ${
                isRerouting && !isSelected
                  ? '<div class="absolute -top-1 -left-1 w-8 h-8 rounded-full border border-dashed border-amber-500 pointer-events-none"></div>'
                  : ''
              }
              <div class="w-6 h-6 flex items-center justify-center filter drop-shadow-sm" style="transform: rotate(${h.heading}deg);">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="${markerColor}" stroke="#ffffff" stroke-width="1.5">
                  <polygon points="12,1 21,21 12,17 3,21" />
                </svg>
              </div>
              ${
                showLabel
                  ? `<div class="px-1.5 py-0.2 bg-white/95 rounded shadow-sm border ${
                      isSelected ? 'border-amber-500 font-bold text-slate-900 ring-1 ring-amber-400' : 'border-slate-200 text-slate-700 font-medium'
                    } text-[10px] whitespace-nowrap mt-0.5">
                      ${shipMeta?.name || h.shipId}
                    </div>`
                  : ''
              }
            </div>
          `;

          const icon = L.divIcon({
            html: shipSvg,
            className: 'marine-vessel-marker',
            iconSize: [54, 40],
            iconAnchor: [27, 11],
          });

          if (!marker) {
            marker = L.marker([h.position[0], h.position[1]], { icon });
            marker.on('click', () => onSelectShip(h.shipId));
            marker.on('mouseover', () => setHoveredShipId(h.shipId));
            marker.on('mouseout', () => setHoveredShipId(null));
            marker.addTo(map);
            shipMarkersRef.current.set(h.shipId, marker);
          } else {
            marker.setLatLng([h.position[0], h.position[1]]);
            marker.setIcon(icon);
          }
        }
      } else {
        const interpolated = interpolatorRef.current.step(dtSeconds);
        interpolatedPositionsRef.current = interpolated;

        for (const ship of fleet) {
          const state = interpolated.get(ship.shipId);
          const lat = state ? state.lat : ship.position[0];
          const lng = state ? state.lng : ship.position[1];
          const heading = state ? state.heading : ship.heading;
          const cargo = getCargoInfo(ship.cargo);
          const isSelected = selectedShipId === ship.shipId;
          const isHovered = hoveredShipId === ship.shipId;
          const isDistressed = ship.status === 'distressed';
          const isStopped = ship.status === 'no_fuel' || ship.status === 'stranded';
          const isRerouting = ship.status === 'rerouting';

          const markerColor = isDistressed ? '#dc2626' : isStopped ? '#94a3b8' : cargo.color;
          const showLabel = isSelected || isHovered || showLabels;

          const shipSvg = `
            <div class="relative flex flex-col items-center cursor-pointer select-none">
              ${
                isSelected
                  ? '<div class="absolute -top-1.5 -left-1.5 w-9 h-9 rounded-full ring-2 ring-amber-500 bg-amber-400/25 pointer-events-none"></div>'
                  : ''
              }
              ${
                isDistressed
                  ? '<div class="absolute -top-2 -left-2 w-10 h-10 rounded-full border-2 border-red-600 distressed-ring-pulse pointer-events-none"></div>'
                  : ''
              }
              ${
                isRerouting && !isSelected
                  ? '<div class="absolute -top-1 -left-1 w-8 h-8 rounded-full border border-dashed border-amber-500 pointer-events-none"></div>'
                  : ''
              }
              <div class="w-6 h-6 flex items-center justify-center filter drop-shadow-sm transition-transform duration-75" style="transform: rotate(${heading}deg);">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="${markerColor}" stroke="#ffffff" stroke-width="1.5">
                  <polygon points="12,1 21,21 12,17 3,21" />
                </svg>
              </div>
              ${
                showLabel
                  ? `<div class="px-1.5 py-0.2 bg-white/95 rounded shadow-sm border ${
                      isSelected ? 'border-amber-500 font-bold text-slate-900 ring-1 ring-amber-400' : 'border-slate-200 text-slate-800 font-medium'
                    } text-[10px] whitespace-nowrap mt-0.5 pointer-events-none">
                      ${ship.name}
                    </div>`
                  : ''
              }
            </div>
          `;

          const icon = L.divIcon({
            html: shipSvg,
            className: 'marine-vessel-marker',
            iconSize: [54, 40],
            iconAnchor: [27, 11],
          });

          let marker = shipMarkersRef.current.get(ship.shipId);
          if (!marker) {
            marker = L.marker([lat, lng], { icon });
            marker.on('click', () => onSelectShip(ship.shipId));
            marker.on('mouseover', () => setHoveredShipId(ship.shipId));
            marker.on('mouseout', () => setHoveredShipId(null));
            marker.addTo(map);
            shipMarkersRef.current.set(ship.shipId, marker);
          } else {
            marker.setLatLng([lat, lng]);
            marker.setIcon(icon);
          }
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, [fleet, selectedShipId, hoveredShipId, currentZoom, onSelectShip, historicalPositions]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [animate]);

  // Selected Ship Route: Solid amber line (#f59e0b) plus faded trail behind it.
  // 2 km Proximity Ring: Thin dashed line on selected ship only.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedRouteLineRef.current) {
      selectedRouteLineRef.current.remove();
      selectedRouteLineRef.current = null;
    }
    if (selectedRouteTrailRef.current) {
      selectedRouteTrailRef.current.remove();
      selectedRouteTrailRef.current = null;
    }
    if (selectedProximityCircleRef.current) {
      selectedProximityCircleRef.current.remove();
      selectedProximityCircleRef.current = null;
    }

    if (!selectedShipId) {
      prevSelectedShipIdRef.current = null;
      return;
    }
    const selectedShip = fleet.find((s) => s.shipId === selectedShipId);
    if (!selectedShip) return;

    // Pan map to selected ship on selection change
    if (selectedShipId !== prevSelectedShipIdRef.current) {
      prevSelectedShipIdRef.current = selectedShipId;
      map.panTo(selectedShip.position, { animate: true, duration: 0.6 });
    }

    // 2 km proximity ring on selected ship
    selectedProximityCircleRef.current = L.circle(selectedShip.position, {
      radius: 2000,
      color: '#0f172a',
      weight: 1.5,
      dashArray: '3, 4',
      opacity: 0.6,
      fillColor: '#f59e0b',
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(map);

    // Selected ship route: Solid amber line + faded trail
    if (selectedShip.route && selectedShip.route.length > 0) {
      const remainingWaypoints: [number, number][] = [
        selectedShip.position,
        ...selectedShip.route.slice(selectedShip.routeIndex),
      ];

      // Solid amber line ahead
      selectedRouteLineRef.current = L.polyline(remainingWaypoints, {
        color: '#f59e0b',
        weight: 3,
        opacity: 0.9,
      }).addTo(map);

      // Faded trail behind
      const pastWaypoints: [number, number][] = [
        ...selectedShip.route.slice(0, selectedShip.routeIndex),
        selectedShip.position,
      ];
      if (pastWaypoints.length >= 2) {
        selectedRouteTrailRef.current = L.polyline(pastWaypoints, {
          color: '#f59e0b',
          weight: 2,
          opacity: 0.35,
          dashArray: '4, 4',
        }).addTo(map);
      }
    }
  }, [selectedShipId, fleet]);

  // Hovered ship route
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (hoveredRouteLineRef.current) {
      hoveredRouteLineRef.current.remove();
      hoveredRouteLineRef.current = null;
    }

    if (!hoveredShipId || hoveredShipId === selectedShipId) return;

    const hoveredShip = fleet.find((s) => s.shipId === hoveredShipId);
    if (!hoveredShip || !hoveredShip.route) return;

    const remainingWaypoints: [number, number][] = [
      hoveredShip.position,
      ...hoveredShip.route.slice(hoveredShip.routeIndex),
    ];

    hoveredRouteLineRef.current = L.polyline(remainingWaypoints, {
      color: '#94a3b8',
      weight: 2,
      dashArray: '3, 3',
      opacity: 0.65,
    }).addTo(map);
  }, [hoveredShipId, selectedShipId, fleet]);

  // Polygon Drawing for Command
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layer = drawingLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!isDrawing) return;

    if (drawingPoints.length > 0) {
      L.polyline(drawingPoints, {
        color: '#dc2626',
        weight: 2,
        dashArray: '4, 4',
      }).addTo(layer);

      for (const p of drawingPoints) {
        L.circleMarker(p, {
          radius: 4,
          color: '#dc2626',
          fillColor: '#ffffff',
          fillOpacity: 1,
        }).addTo(layer);
      }
    }

    const handleClick = (e: L.LeafletMouseEvent) => {
      const newPt: [number, number] = [
        Number(e.latlng.lat.toFixed(4)),
        Number(e.latlng.lng.toFixed(4)),
      ];
      setDrawingPoints((prev) => [...prev, newPt]);
    };

    const handleDblClick = (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault();
      if (drawingPoints.length >= 3) {
        setShowZoneModal(true);
      }
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);

    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
    };
  }, [isDrawing, drawingPoints]);

  const handleFinishZone = () => {
    if (drawingPoints.length < 3) return;
    const name = newZoneName.trim() || `Zone ${zones.length + 1}`;
    onCreateZone({
      name,
      polygon: drawingPoints,
      createdBy: 'Command',
      active: true,
      reason: newZoneReason.trim() || 'Restricted Zone',
    });
    setIsDrawing(false);
    setDrawingPoints([]);
    setNewZoneName('');
    setNewZoneReason('');
    setShowZoneModal(false);
  };

  const handleCancelDrawing = () => {
    setIsDrawing(false);
    setDrawingPoints([]);
    setShowZoneModal(false);
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Basemap Switcher (Ocean vs Satellite) positioned respecting right reserved offset */}
      <div
        style={{ right: 'calc(var(--right-reserved-width, 0px) + 16px)' }}
        className="absolute top-3 z-[1000] flex items-center bg-white rounded-md shadow-md border border-[#e3e7ec] p-1 space-x-1 text-xs font-semibold transition-all duration-150"
      >
        <button
          onClick={() => setBasemapType('ocean')}
          className={`px-2.5 py-1 rounded transition-editorial cursor-pointer flex items-center space-x-1.5 ${
            basemapType === 'ocean'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers size={13} />
          <span>Ocean Base</span>
        </button>
        <button
          onClick={() => setBasemapType('satellite')}
          className={`px-2.5 py-1 rounded transition-editorial cursor-pointer flex items-center space-x-1.5 ${
            basemapType === 'satellite'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers size={13} />
          <span>Satellite</span>
        </button>
      </div>

      {/* Command Floating Zone Drawing Toolbar positioned past the left rail */}
      {role === 'command' && (
        <div
          ref={zoneManagerRef}
          style={{ left: 'calc(var(--current-rail-width, 300px) + 16px)' }}
          className="absolute top-3 z-[1000] flex items-center space-x-2 transition-all duration-150"
        >
          {!isDrawing ? (
            <div className="bg-white border border-[#e3e7ec] rounded-md shadow-md p-1 flex items-center space-x-1">
              <button
                onClick={() => {
                  setIsDrawing(true);
                  setDrawingPoints([]);
                }}
                className="h-8 flex items-center space-x-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded transition-editorial cursor-pointer shadow-xs"
              >
                <Plus size={13} />
                <span>Draw Zone</span>
              </button>

              <button
                onClick={() => setShowZoneManager((prev) => !prev)}
                className="h-8 flex items-center space-x-1 px-2.5 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-medium rounded transition-editorial cursor-pointer"
                title="Manage active exclusion zones"
              >
                <AlertTriangle size={13} className="text-red-500" />
                <span>Zones ({zones.length})</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-white border border-red-300 rounded-md shadow-lg p-1.5">
              <span className="text-xs text-slate-700 px-2 font-medium">
                Click map vertices · Double-click to close ({drawingPoints.length} pts)
              </span>
              <button
                disabled={drawingPoints.length < 3}
                onClick={() => setShowZoneModal(true)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded disabled:opacity-40 cursor-pointer transition-editorial shadow-xs"
              >
                Finish Zone
              </button>
              <button
                onClick={handleCancelDrawing}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer rounded"
                title="Cancel drawing"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Quick Zone Manager Dropdown */}
          {showZoneManager && !isDrawing && (
            <div className="absolute top-full mt-2 left-0 w-[280px] bg-white border border-slate-200 rounded-lg shadow-xl p-3 z-[1100] space-y-2">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <span className="text-[12px] font-semibold text-slate-800">Restricted zones ({zones.length})</span>
                <button
                  onClick={() => setShowZoneManager(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X size={13} />
                </button>
              </div>

              {zones.length === 0 ? (
                <p className="text-[12px] text-slate-500 py-2 text-center">No zones yet. Use Draw Zone to add one.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {zones.map((z) => (
                    <div
                      key={z.id}
                      className="flex items-center justify-between p-1.5 bg-slate-50 hover:bg-red-50/50 rounded border border-slate-100 text-xs"
                    >
                      <div className="truncate pr-1">
                        <div className="font-medium text-slate-900 truncate">{z.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">{z.polygon.length} vertices</div>
                      </div>
                      <button
                        onClick={() => onDeleteZone(z.id)}
                        className="text-slate-400 hover:text-red-600 p-1"
                        title="Delete zone"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Map Legend: Small collapsed "Legend" button at bottom-left (offset past left rail: left = rail width + 16px) */}
      {/* Opens compact popover (max 260px wide, max-height 60vh, scrollable) fully inside viewport, above timeline bar */}
      <div
        ref={legendRef}
        style={{
          left: 'calc(var(--current-rail-width, 300px) + 16px)',
          bottom: 'calc(var(--timeline-height, 48px) + var(--timeline-bottom-offset, 14px) + 12px)',
        }}
        className="absolute z-[1000] transition-all duration-150 select-none"
      >
        {/* Compact Popover positioned above the button */}
        {legendOpen && (
          <div className="mb-2 w-[260px] max-w-[260px] max-h-[60vh] overflow-y-auto bg-white border border-[#e3e7ec] rounded-lg shadow-xl p-3 text-xs space-y-2.5 text-slate-700">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="section-label text-slate-900">Legend & Symbology</span>
              <button
                onClick={() => setLegendOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                title="Close legend"
              >
                <X size={13} />
              </button>
            </div>

            {/* Cargo Color Chips */}
            <div>
              <span className="section-label block mb-1">
                Cargo Classification
              </span>
              <div className="grid grid-cols-1 gap-1 text-[11px]">
                {Object.entries(CARGO_MAP).map(([key, val]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: val.color }}
                    />
                    <span className="truncate">{val.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status indicators */}
            <div className="border-t border-slate-100 pt-2 space-y-1.5 text-[11px]">
              <span className="section-label block mb-1">
                Status & Features
              </span>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse shrink-0" />
                <span>Distressed Vessel</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full ring-2 ring-amber-500 bg-amber-400 shrink-0" />
                <span>Selected Vessel</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-4 h-0.5 bg-amber-500 shrink-0" />
                <span>Planned Route</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-4 h-1 border border-dashed border-red-600 bg-red-600/15 shrink-0" />
                <span>Restricted Zone</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full border border-dashed border-slate-700 shrink-0" />
                <span>2 km Proximity Ring</span>
              </div>
            </div>
          </div>
        )}

        {/* Small collapsed "Legend" trigger button */}
        <button
          onClick={() => setLegendOpen((prev) => !prev)}
          className={`px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-[#e3e7ec] rounded-md shadow-md text-xs font-semibold transition-editorial cursor-pointer flex items-center space-x-1.5 ${
            legendOpen ? 'ring-2 ring-amber-500 border-amber-500' : ''
          }`}
        >
          <Layers size={13} className="text-amber-500" />
          <span>Legend</span>
        </button>
      </div>

      {/* Zone Creation Modal */}
      {showZoneModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xl p-5 max-w-md w-full space-y-4 text-xs text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <span className="font-bold text-slate-900 text-sm">
                Enforce Restricted Exclusion Zone
              </span>
              <button onClick={handleCancelDrawing} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              Enclosing {drawingPoints.length} vertices across the Strait of Hormuz corridor. Commercial vessels intersecting this polygon will trigger emergency rerouting orders.
            </p>

            <div className="space-y-3">
              <div>
                <label className="section-label block mb-1 text-slate-700">
                  Zone Designation
                </label>
                <input
                  type="text"
                  placeholder="e.g. Strait Narrows Exclusion Alpha"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-red-500 rounded-md px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-editorial"
                />
              </div>

              <div>
                <label className="section-label block mb-1 text-slate-700">
                  Threat Rationale / Operational Advisory
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hostile missile patrol, mine hazard, naval skirmish"
                  value={newZoneReason}
                  onChange={(e) => setNewZoneReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-red-500 rounded-md px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-editorial"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={handleCancelDrawing}
                className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-md transition-editorial cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleFinishZone}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-md uppercase tracking-wider transition-editorial cursor-pointer shadow-sm"
              >
                Enforce Zone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

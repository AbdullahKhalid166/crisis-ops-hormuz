import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import {
  Ship,
  Port,
  RestrictedZone,
  WeatherCell,
  Role,
} from '../types.ts';
import { FleetInterpolator, InterpolatedShipState } from '../utils/interpolation.ts';
import { Plus, X, Layers, Trash2, AlertTriangle, ChevronDown } from 'lucide-react';
import { getCargoInfo, CARGO_MAP } from '../utils/cargoTheme.ts';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Badge } from './ui/badge.tsx';
import { Card } from './ui/card.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx';

export interface MapboxTacticalMapProps {
  mapboxToken: string;
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
  onAuthError?: () => void;
}

// Generate geodesic circle polygon in [lng, lat]
function createGeoJSONCircle(centerLngLat: [number, number], radiusInKm: number, points = 64): GeoJSON.Polygon {
  const [lng, lat] = centerLngLat;
  const coords: [number, number][] = [];
  const distanceX = radiusInKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusInKm / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([lng + x, lat + y]);
  }
  coords.push(coords[0]);
  return {
    type: 'Polygon',
    coordinates: [coords],
  };
}

export const MapboxTacticalMap: React.FC<MapboxTacticalMapProps> = ({
  mapboxToken,
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
  onAuthError,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const terrainSetRef = useRef(false);

  // Basemap style switcher
  // Ocean Base: light/ocean styled vector map; Satellite: high-res satellite streets with terrain
  const [basemapType, setBasemapType] = useState<'ocean' | 'satellite'>('ocean');
  const oceanStyle = 'mapbox://styles/mapbox/outdoors-v12';
  const satelliteStyle = 'mapbox://styles/mapbox/satellite-streets-v12';

  // Map state
  const [currentZoom, setCurrentZoom] = useState<number>(7);
  const [hoveredShipId, setHoveredShipId] = useState<string | null>(null);

  // Ship HTML markers
  const shipMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const weatherBadgesRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const portMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneReason, setNewZoneReason] = useState('');
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [showZoneManager, setShowZoneManager] = useState(false);

  // Interpolator
  const interpolatorRef = useRef<FleetInterpolator>(new FleetInterpolator());
  const animFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const hasFittedBoundsRef = useRef(false);
  const prevSelectedShipIdRef = useRef<string | null>(null);

  // Initialize Mapbox map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: basemapType === 'ocean' ? oceanStyle : satelliteStyle,
        center: [55.2, 26.3], // [lng, lat]
        zoom: 7,
        pitch: 50, // default pitch ~50 degrees for 3D elevation
        bearing: 0,
        minZoom: 5,
        maxZoom: 17,
        attributionControl: false,
      });
    } catch (err) {
      console.warn('[MapboxTacticalMap] Failed to initialize Mapbox GL instance:', err);
      onAuthError?.();
      return;
    }

    // Handle token authorization error event
    map.on('error', (e) => {
      const errMessage = (e.error?.message || '').toLowerCase();
      const status = (e as any)?.status;
      if (
        status === 401 ||
        status === 403 ||
        errMessage.includes('unauthorized') ||
        errMessage.includes('forbidden') ||
        errMessage.includes('access token')
      ) {
        console.warn('[MapboxTacticalMap] Mapbox GL authentication failed:', e.error);
        onAuthError?.();
      }
    });

    // Add navigation controls (zoom + compass/pitch) to bottom-right
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
    // Add compact attribution control to bottom-right
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    // Add MapboxDraw for Command role
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select',
      styles: [
        {
          id: 'gl-draw-polygon-fill',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': '#dc2626',
            'fill-outline-color': '#dc2626',
            'fill-opacity': 0.15,
          },
        },
        {
          id: 'gl-draw-polygon-stroke',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#dc2626',
            'line-dasharray': [2, 2],
            'line-width': 2,
          },
        },
        {
          id: 'gl-draw-polygon-midpoint',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
          paint: {
            'circle-radius': 3,
            'circle-color': '#f59e0b',
          },
        },
        {
          id: 'gl-draw-polygon-and-line-vertex-active',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 5,
            'circle-color': '#ffffff',
            'circle-stroke-color': '#dc2626',
            'circle-stroke-width': 2,
          },
        },
        {
          id: 'gl-draw-polygon-and-line-vertex-inactive',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 4,
            'circle-color': '#ffffff',
            'circle-stroke-color': '#dc2626',
            'circle-stroke-width': 1.5,
          },
        },
      ],
    });

    map.addControl(draw);
    drawRef.current = draw;

    // Track zoom
    map.on('zoom', () => {
      setCurrentZoom(map.getZoom());
    });

    // Configure terrain and camera once, after the initial style has loaded.
    map.on('load', () => {
      if (terrainSetRef.current) return;

      terrainSetRef.current = true;
      try {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
        }
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
        map.setPitch(50);
        map.setBearing(-10);
      } catch (err) {
        console.warn('[MapboxTacticalMap] Error setting initial terrain on load:', err);
      }
    });

    // Handle completed polygon drawing
    map.on('draw.create', (e: any) => {
      const feature = e.features?.[0];
      if (feature && feature.geometry && feature.geometry.type === 'Polygon') {
        const ring = feature.geometry.coordinates[0];
        // Convert [lng, lat] back to [lat, lng]
        const pts: [number, number][] = ring
          .slice(0, -1)
          .map(([lng, lat]: [number, number]) => [Number(lat.toFixed(4)), Number(lng.toFixed(4))]);

        if (pts.length >= 3) {
          setDrawingPoints(pts);
          setShowZoneModal(true);
        }
        draw.delete(feature.id);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Configure vector sources whenever the style loads or changes.
  const setupLayersAndTerrain = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Navigable water source & layers
    if (!map.getSource('navigable-water')) {
      const waterCoords = navigableWater.length >= 3
        ? [[...navigableWater.map(([lat, lng]) => [lng, lat] as [number, number]), [navigableWater[0][1], navigableWater[0][0]] as [number, number]]]
        : [];

      map.addSource('navigable-water', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: waterCoords,
          },
          properties: {},
        },
      });

      map.addLayer({
        id: 'navigable-water-fill',
        type: 'fill',
        source: 'navigable-water',
        paint: {
          'fill-color': '#38bdf8',
          'fill-opacity': 0.03,
        },
      });

      map.addLayer({
        id: 'navigable-water-line',
        type: 'line',
        source: 'navigable-water',
        paint: {
          'line-color': '#0284c7',
          'line-width': 1.5,
          'line-dasharray': [4, 6],
          'line-opacity': 0.25,
        },
      });
    }

    // 3. Weather cells source & layers
    if (!map.getSource('weather-cells')) {
      map.addSource('weather-cells', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.addLayer({
        id: 'weather-cells-fill',
        type: 'fill',
        source: 'weather-cells',
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': ['get', 'fillOpacity'],
        },
      });

      map.addLayer({
        id: 'weather-cells-line',
        type: 'line',
        source: 'weather-cells',
        paint: {
          'line-color': ['get', 'lineColor'],
          'line-width': 1.5,
          'line-dasharray': [3, 4],
          'line-opacity': ['get', 'lineOpacity'],
        },
      });
    }

    // 4. Restricted zones source & layers
    if (!map.getSource('restricted-zones')) {
      map.addSource('restricted-zones', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.addLayer({
        id: 'restricted-zones-fill',
        type: 'fill',
        source: 'restricted-zones',
        paint: {
          'fill-color': '#dc2626',
          'fill-opacity': 0.15,
        },
      });

      map.addLayer({
        id: 'restricted-zones-line',
        type: 'line',
        source: 'restricted-zones',
        paint: {
          'line-color': '#dc2626',
          'line-width': 2,
          'line-dasharray': [5, 4],
          'line-opacity': 0.95,
        },
      });

      // Hover popup on restricted zone
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'mapbox-zone-tooltip',
      });

      map.on('mouseenter', 'restricted-zones-fill', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features?.[0]?.properties;
        if (props) {
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="p-1.5 text-xs text-slate-800">
                <div class="font-bold text-red-600 flex items-center space-x-1">
                  <span>⚠ RESTRICTED:</span> <span>${props.name || 'Hazard Zone'}</span>
                </div>
                <div class="text-[11px] text-slate-600 mt-0.5">${props.reason || 'Military Exclusion Zone'}</div>
              </div>`
            )
            .addTo(map);
        }
      });

      map.on('mouseleave', 'restricted-zones-fill', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });
    }

    // 5. Selected ship route (ahead + trail)
    if (!map.getSource('selected-ship-route')) {
      map.addSource('selected-ship-route', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.addLayer({
        id: 'selected-ship-route-trail',
        type: 'line',
        source: 'selected-ship-route',
        filter: ['==', 'type', 'trail'],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2,
          'line-dasharray': [4, 4],
          'line-opacity': 0.35,
        },
      });

      map.addLayer({
        id: 'selected-ship-route-ahead',
        type: 'line',
        source: 'selected-ship-route',
        filter: ['==', 'type', 'ahead'],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      });
    }

    // 6. Hovered ship route
    if (!map.getSource('hovered-ship-route')) {
      map.addSource('hovered-ship-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });

      map.addLayer({
        id: 'hovered-ship-route-line',
        type: 'line',
        source: 'hovered-ship-route',
        paint: {
          'line-color': '#94a3b8',
          'line-width': 2,
          'line-dasharray': [3, 3],
          'line-opacity': 0.65,
        },
      });
    }

    // 7. 2km proximity ring on selected ship
    if (!map.getSource('selected-proximity-ring')) {
      map.addSource('selected-proximity-ring', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: {},
        },
      });

      map.addLayer({
        id: 'selected-proximity-ring-fill',
        type: 'fill',
        source: 'selected-proximity-ring',
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': 0.05,
        },
      });

      map.addLayer({
        id: 'selected-proximity-ring-line',
        type: 'line',
        source: 'selected-proximity-ring',
        paint: {
          'line-color': '#0f172a',
          'line-width': 1.5,
          'line-dasharray': [3, 4],
          'line-opacity': 0.6,
        },
      });
    }
  }, [navigableWater]);

  // Listen to style.load to re-add vector sources on basemap switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleStyleLoad = () => {
      setupLayersAndTerrain();
    };

    map.on('style.load', handleStyleLoad);
    if (map.isStyleLoaded()) {
      setupLayersAndTerrain();
    }

    return () => {
      map.off('style.load', handleStyleLoad);
    };
  }, [setupLayersAndTerrain]);

  // Basemap style switcher handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const targetStyle = basemapType === 'ocean' ? oceanStyle : satelliteStyle;
    map.setStyle(targetStyle);
  }, [basemapType]);

  // Fit bounds on first load
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasFittedBoundsRef.current || !fleet || fleet.length === 0) return;

    const validPositions = fleet
      .map((s) => s.position)
      .filter((p) => p && typeof p[0] === 'number' && typeof p[1] === 'number');

    if (validPositions.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds();
      validPositions.forEach(([lat, lng]) => bounds.extend([lng, lat]));

      map.fitBounds(bounds, {
        padding: 60,
        maxZoom: 8,
        pitch: 50,
        bearing: -10,
      });
      hasFittedBoundsRef.current = true;
    }
  }, [fleet]);

  // Update Weather Cells source data & badges
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('weather-cells') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const features: GeoJSON.Feature[] = weatherGrid.map((w) => {
      const circlePoly = createGeoJSONCircle([w.lng, w.lat], 34);
      return {
        type: 'Feature',
        geometry: circlePoly,
        properties: {
          isAdv: w.isAdverse,
          fillColor: w.isAdverse ? '#a78bfa' : '#cbd5e1',
          fillOpacity: w.isAdverse ? 0.12 : 0.04,
          lineColor: w.isAdverse ? '#8b5cf6' : '#94a3b8',
          lineOpacity: w.isAdverse ? 0.6 : 0.25,
          waveHeight: w.waveHeight,
          windSpeed: w.windSpeed,
        },
      };
    });

    source.setData({
      type: 'FeatureCollection',
      features,
    });

    // Adverse weather badges (HTML markers)
    const activeKeys = new Set<string>();
    weatherGrid.filter((w) => w.isAdverse).forEach((w) => {
      const key = `${w.lat}-${w.lng}`;
      activeKeys.add(key);

      if (!weatherBadgesRef.current.has(key)) {
        const el = document.createElement('div');
        el.className = 'px-1.5 py-0.5 bg-purple-950/85 text-purple-200 rounded text-[9px] font-mono border border-purple-400/40 shadow-sm pointer-events-none whitespace-nowrap';
        el.textContent = `Waves: ${w.waveHeight}m · Wind: ${w.windSpeed}kn`;

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([w.lng, w.lat])
          .addTo(map);

        weatherBadgesRef.current.set(key, marker);
      }
    });

    // Remove obsolete badges
    for (const [key, marker] of weatherBadgesRef.current.entries()) {
      if (!activeKeys.has(key)) {
        marker.remove();
        weatherBadgesRef.current.delete(key);
      }
    }
  }, [weatherGrid]);

  // Update Restricted Zones source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('restricted-zones') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const features: GeoJSON.Feature[] = zones
      .filter((z) => z.active && z.polygon.length >= 3)
      .map((z) => {
        const ring = z.polygon.map(([lat, lng]) => [lng, lat] as [number, number]);
        ring.push([z.polygon[0][1], z.polygon[0][0]]);
        return {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [ring],
          },
          properties: {
            id: z.id,
            name: z.name,
            reason: z.reason || 'Military Hazard Zone',
          },
        };
      });

    source.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [zones]);

  // Ports: Render pins & labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const showLabels = currentZoom >= 8;

    ports.forEach((port) => {
      let marker = portMarkersRef.current.get(port.id);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'flex items-center space-x-1 pointer-events-none select-none';
        el.innerHTML = `
          <div class="w-3.5 h-3.5 rounded-full bg-slate-500/70 text-white flex items-center justify-center border border-white/80 shadow-xs">
            <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="5" r="3"></circle>
              <line x1="12" y1="22" x2="12" y2="8"></line>
              <path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>
            </svg>
          </div>
          <span class="port-label ${showLabels ? '' : 'hidden'} bg-white/90 text-slate-500 font-medium text-[9px] px-1 py-0.2 rounded border border-slate-200/80 whitespace-nowrap shadow-xs">
            ${port.name}
          </span>
        `;
        marker = new mapboxgl.Marker({ element: el })
          .setLngLat([port.position[1], port.position[0]])
          .addTo(map);
        portMarkersRef.current.set(port.id, marker);
      } else {
        const labelEl = marker.getElement().querySelector('.port-label');
        if (labelEl) {
          if (showLabels) {
            labelEl.classList.remove('hidden');
          } else {
            labelEl.classList.add('hidden');
          }
        }
      }
    });
  }, [ports, currentZoom]);

  // Update selected ship route & 2km proximity ring
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const routeSource = map.getSource('selected-ship-route') as mapboxgl.GeoJSONSource | undefined;
    const proximitySource = map.getSource('selected-proximity-ring') as mapboxgl.GeoJSONSource | undefined;

    if (!selectedShipId) {
      routeSource?.setData({ type: 'FeatureCollection', features: [] });
      proximitySource?.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} });
      prevSelectedShipIdRef.current = null;
      return;
    }

    const selectedShip = fleet.find((s) => s.shipId === selectedShipId);
    if (!selectedShip) return;

    // Pan map to selected ship on change
    if (selectedShipId !== prevSelectedShipIdRef.current) {
      prevSelectedShipIdRef.current = selectedShipId;
      map.easeTo({
        center: [selectedShip.position[1], selectedShip.position[0]],
        duration: 800,
        pitch: 50,
      });
    }

    // 2km proximity ring
    if (proximitySource) {
      const ringPoly = createGeoJSONCircle([selectedShip.position[1], selectedShip.position[0]], 2);
      proximitySource.setData({
        type: 'Feature',
        geometry: ringPoly,
        properties: {},
      });
    }

    // Selected ship route
    if (routeSource && selectedShip.route && selectedShip.route.length > 0) {
      const remainingWaypoints: [number, number][] = [
        [selectedShip.position[1], selectedShip.position[0]],
        ...selectedShip.route.slice(selectedShip.routeIndex).map(([lat, lng]) => [lng, lat] as [number, number]),
      ];

      const pastWaypoints: [number, number][] = [
        ...selectedShip.route.slice(0, selectedShip.routeIndex).map(([lat, lng]) => [lng, lat] as [number, number]),
        [selectedShip.position[1], selectedShip.position[0]],
      ];

      const features: GeoJSON.Feature[] = [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: remainingWaypoints,
          },
          properties: { type: 'ahead' },
        },
      ];

      if (pastWaypoints.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: pastWaypoints,
          },
          properties: { type: 'trail' },
        });
      }

      routeSource.setData({
        type: 'FeatureCollection',
        features,
      });
    } else {
      routeSource?.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [selectedShipId, fleet]);

  // Update hovered ship route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('hovered-ship-route') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    if (!hoveredShipId || hoveredShipId === selectedShipId) {
      source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
      return;
    }

    const hoveredShip = fleet.find((s) => s.shipId === hoveredShipId);
    if (!hoveredShip || !hoveredShip.route) {
      source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
      return;
    }

    const waypoints: [number, number][] = [
      [hoveredShip.position[1], hoveredShip.position[0]],
      ...hoveredShip.route.slice(hoveredShip.routeIndex).map(([lat, lng]) => [lng, lat] as [number, number]),
    ];

    source.setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: waypoints,
      },
      properties: {},
    });
  }, [hoveredShipId, selectedShipId, fleet]);

  // Feed targets into FleetInterpolator
  useEffect(() => {
    if (historicalPositions && historicalPositions.length > 0) return;
    interpolatorRef.current.updateTargets(
      fleet.map((s) => ({ shipId: s.shipId, position: s.position, heading: s.heading })),
      serverTime
    );
  }, [fleet, serverTime, historicalPositions]);

  // Continuous animation loop for vessel motion interpolation
  const animate = useCallback((timestamp: number) => {
    const dtSeconds = Math.min((timestamp - lastFrameTimeRef.current) / 1000, 0.1);
    lastFrameTimeRef.current = timestamp;

    const map = mapRef.current;
    if (map) {
      const showLabels = currentZoom >= 8;

      if (historicalPositions && historicalPositions.length > 0) {
        for (const h of historicalPositions) {
          const shipMeta = fleet.find((s) => s.shipId === h.shipId);
          const cargo = getCargoInfo(shipMeta?.cargo || '');
          const isSelected = selectedShipId === h.shipId;
          const isHovered = hoveredShipId === h.shipId;
          const isDistressed = h.status === 'distressed';
          const isStopped = h.status === 'no_fuel' || h.status === 'stranded';
          const isRerouting = h.status === 'rerouting';
          const markerColor = isDistressed ? '#dc2626' : isStopped ? '#94a3b8' : cargo.color;
          const showLabel = isSelected || isHovered || showLabels;

          let marker = shipMarkersRef.current.get(h.shipId);
          if (!marker) {
            const el = document.createElement('div');
            el.className = 'marine-vessel-marker cursor-pointer select-none';
            marker = new mapboxgl.Marker({ element: el })
              .setLngLat([h.position[1], h.position[0]])
              .addTo(map);

            el.addEventListener('click', () => onSelectShip(h.shipId));
            el.addEventListener('mouseenter', () => setHoveredShipId(h.shipId));
            el.addEventListener('mouseleave', () => setHoveredShipId(null));
            shipMarkersRef.current.set(h.shipId, marker);
          } else {
            marker.setLngLat([h.position[1], h.position[0]]);
          }

          const el = marker.getElement();
          el.innerHTML = `
            <div class="relative flex flex-col items-center">
              ${isSelected ? '<div class="absolute -top-1.5 -left-1.5 w-9 h-9 rounded-full ring-2 ring-amber-500 bg-amber-400/25 pointer-events-none"></div>' : ''}
              ${isDistressed ? '<div class="absolute -top-2 -left-2 w-10 h-10 rounded-full border-2 border-red-600 distressed-ring-pulse pointer-events-none"></div>' : ''}
              ${isRerouting && !isSelected ? '<div class="absolute -top-1 -left-1 w-8 h-8 rounded-full border border-dashed border-amber-500 pointer-events-none"></div>' : ''}
              <div class="w-6 h-6 flex items-center justify-center filter drop-shadow-sm" style="transform: rotate(${h.heading}deg);">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="${markerColor}" stroke="#ffffff" stroke-width="1.5">
                  <polygon points="12,1 21,21 12,17 3,21" />
                </svg>
              </div>
              ${showLabel ? `<div class="px-1.5 py-0.2 bg-white/95 rounded shadow-sm border ${isSelected ? 'border-amber-500 font-bold text-slate-900 ring-1 ring-amber-400' : 'border-slate-200 text-slate-700 font-medium'} text-[10px] whitespace-nowrap mt-0.5 pointer-events-none">${shipMeta?.name || h.shipId}</div>` : ''}
            </div>
          `;
        }
      } else {
        const interpolated = interpolatorRef.current.step(dtSeconds);

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

          let marker = shipMarkersRef.current.get(ship.shipId);
          if (!marker) {
            const el = document.createElement('div');
            el.className = 'marine-vessel-marker cursor-pointer select-none';
            marker = new mapboxgl.Marker({ element: el })
              .setLngLat([lng, lat])
              .addTo(map);

            el.addEventListener('click', () => onSelectShip(ship.shipId));
            el.addEventListener('mouseenter', () => setHoveredShipId(ship.shipId));
            el.addEventListener('mouseleave', () => setHoveredShipId(null));
            shipMarkersRef.current.set(ship.shipId, marker);
          } else {
            marker.setLngLat([lng, lat]);
          }

          const el = marker.getElement();
          el.innerHTML = `
            <div class="relative flex flex-col items-center">
              ${isSelected ? '<div class="absolute -top-1.5 -left-1.5 w-9 h-9 rounded-full ring-2 ring-amber-500 bg-amber-400/25 pointer-events-none"></div>' : ''}
              ${isDistressed ? '<div class="absolute -top-2 -left-2 w-10 h-10 rounded-full border-2 border-red-600 distressed-ring-pulse pointer-events-none"></div>' : ''}
              ${isRerouting && !isSelected ? '<div class="absolute -top-1 -left-1 w-8 h-8 rounded-full border border-dashed border-amber-500 pointer-events-none"></div>' : ''}
              <div class="w-6 h-6 flex items-center justify-center filter drop-shadow-sm transition-transform duration-75" style="transform: rotate(${heading}deg);">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="${markerColor}" stroke="#ffffff" stroke-width="1.5">
                  <polygon points="12,1 21,21 12,17 3,21" />
                </svg>
              </div>
              ${showLabel ? `<div class="px-1.5 py-0.2 bg-white/95 rounded shadow-sm border ${isSelected ? 'border-amber-500 font-bold text-slate-900 ring-1 ring-amber-400' : 'border-slate-200 text-slate-800 font-medium'} text-[10px] whitespace-nowrap mt-0.5 pointer-events-none">${ship.name}</div>` : ''}
            </div>
          `;
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

  // Zone drawing activation
  const handleStartDraw = () => {
    if (!drawRef.current) return;
    drawRef.current.deleteAll();
    drawRef.current.changeMode('draw_polygon');
    setIsDrawing(true);
    setDrawingPoints([]);
  };

  const handleCancelDrawing = () => {
    if (drawRef.current) {
      drawRef.current.deleteAll();
      drawRef.current.changeMode('simple_select');
    }
    setIsDrawing(false);
    setDrawingPoints([]);
    setShowZoneModal(false);
  };

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
    if (drawRef.current) {
      drawRef.current.deleteAll();
      drawRef.current.changeMode('simple_select');
    }
    setIsDrawing(false);
    setDrawingPoints([]);
    setNewZoneName('');
    setNewZoneReason('');
    setShowZoneModal(false);
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Basemap Switcher using shadcn DropdownMenu (always visible & unobstructed at top-right) */}
      <div
        style={{ right: 'calc(var(--right-reserved-width, 0px) + 16px)' }}
        className="absolute top-3 z-[35] flex items-center transition-all duration-150"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="bg-[#faf8f5]/95 backdrop-blur-xs border-[#ded9d2] text-[#1f1f1f] shadow-sm text-xs font-semibold space-x-1.5 h-8 px-2.5 hover:bg-[#f2ede6]"
            >
              <Layers size={14} className="text-[#c65d33]" />
              <span>Map: {basemapType === 'ocean' ? 'Ocean Base (3D)' : 'Satellite (3D)'}</span>
              <ChevronDown size={14} className="text-[#6b6660]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 bg-[#faf8f5] border-[#ded9d2] text-[#1f1f1f] z-50">
            <DropdownMenuRadioGroup
              value={basemapType}
              onValueChange={(val) => setBasemapType(val as 'ocean' | 'satellite')}
            >
              <DropdownMenuRadioItem value="ocean" className="text-xs cursor-pointer">
                Ocean Base (3D)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="satellite" className="text-xs cursor-pointer">
                Satellite (3D)
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Command Floating Zone Drawing Toolbar positioned past the left rail */}
      {role === 'command' && (
        <div
          style={{ left: 'calc(var(--current-rail-width, 300px) + 16px)' }}
          className="absolute top-3 z-[1000] flex items-center space-x-2 transition-all duration-150"
        >
          {!isDrawing ? (
            <div className="bg-white/95 backdrop-blur-xs border border-[#e3e7ec] rounded-md shadow-md p-1 flex items-center space-x-1">
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartDraw}
                className="h-7 px-2.5 text-xs font-bold space-x-1"
              >
                <Plus size={14} />
                <span>Draw Zone</span>
              </Button>

              <Popover open={showZoneManager} onOpenChange={setShowZoneManager}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 text-xs text-slate-700 hover:text-slate-900 space-x-1 font-medium"
                    title="Manage active exclusion zones"
                  >
                    <AlertTriangle size={14} className="text-red-500" />
                    <span>Zones ({zones.length})</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-2.5 space-y-2">
                  <div className="flex justify-between items-center pb-1 border-b border-slate-100">
                    <span className="section-label text-slate-800">Restricted Zones</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setShowZoneManager(false)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X size={13} />
                    </Button>
                  </div>

                  {zones.length === 0 ? (
                    <p className="text-[11px] text-slate-500 py-2 text-center">No zones created.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {zones.map((z) => (
                        <div
                          key={z.id}
                          className="flex items-center justify-between p-1.5 bg-slate-50 hover:bg-red-50/50 rounded border border-slate-100 text-xs"
                        >
                          <div className="truncate pr-1">
                            <div className="font-medium text-slate-900 truncate">{z.name}</div>
                            <div className="text-[10px] text-slate-500 truncate">{z.reason}</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onDeleteZone(z.id)}
                            className="text-slate-400 hover:text-red-600"
                            title="Delete zone"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-white/95 backdrop-blur-xs border border-red-300 rounded-md shadow-lg p-1.5">
              <span className="text-xs text-slate-700 px-2 font-medium">
                Click map vertices to outline zone. Double-click or click starting point to finish.
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCancelDrawing}
                className="text-slate-400 hover:text-slate-700"
                title="Cancel drawing"
              >
                <X size={15} />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Map Legend: collapsed "Legend" button at bottom-left using shadcn Popover */}
      <div
        style={{
          left: 'calc(var(--current-rail-width, 300px) + 16px)',
          bottom: 'calc(var(--timeline-height, 48px) + var(--timeline-bottom-offset, 14px) + 12px)',
        }}
        className="absolute z-[1000] transition-all duration-150 select-none"
      >
        <Popover open={legendOpen} onOpenChange={setLegendOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`bg-white/95 backdrop-blur-xs border-[#e3e7ec] shadow-md text-xs font-semibold space-x-1.5 h-8 px-3 ${
                legendOpen ? 'ring-2 ring-amber-500 border-amber-500' : ''
              }`}
            >
              <Layers size={14} className="text-amber-500" />
              <span>Legend</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className="w-[260px] max-w-[260px] max-h-[60vh] overflow-y-auto p-3 text-xs space-y-2.5 text-slate-700 shadow-xl border-[#e3e7ec]"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="section-label text-slate-900">Legend & Symbology</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setLegendOpen(false)}
                className="text-slate-400 hover:text-slate-700"
                title="Close legend"
              >
                <X size={13} />
              </Button>
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
          </PopoverContent>
        </Popover>
      </div>

      {/* Zone Creation Modal using shadcn Card & Input */}
      {showZoneModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-5 space-y-4 shadow-2xl border-slate-200 text-xs text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <span className="font-bold text-slate-900 text-sm">
                Enforce Restricted Exclusion Zone
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCancelDrawing}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </Button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              Enclosing {drawingPoints.length} vertices across the Strait of Hormuz corridor. Commercial vessels intersecting this polygon will trigger emergency rerouting orders.
            </p>

            <div className="space-y-3">
              <div>
                <label className="section-label block mb-1 text-slate-700">
                  Zone Designation
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Strait Narrows Exclusion Alpha"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  className="h-8 bg-slate-50 text-xs"
                />
              </div>

              <div>
                <label className="section-label block mb-1 text-slate-700">
                  Threat Rationale / Operational Advisory
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Hostile missile patrol, mine hazard, naval skirmish"
                  value={newZoneReason}
                  onChange={(e) => setNewZoneReason(e.target.value)}
                  className="h-8 bg-slate-50 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelDrawing}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleFinishZone}
                className="text-xs font-bold uppercase tracking-wider shadow-sm"
              >
                Enforce Zone
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

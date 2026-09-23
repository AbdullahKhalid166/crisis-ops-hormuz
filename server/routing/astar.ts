import {
  haversineMeters,
  haversineNauticalMiles,
  pointInPolygon,
  segmentIntersectsPolygon,
  segmentEntirelyInsidePolygon,
} from './geo.ts';
import { RestrictedZone, WeatherCell } from '../types.ts';

export interface GridPoint {
  lat: number;
  lng: number;
  r: number;
  c: number;
}

export class MaritimeRouter {
  private bounds = {
    north: 30.5,
    south: 22.0,
    east: 60.0,
    west: 47.5,
  };

  private step = 0.06; // ~3.6 nautical miles per cell
  private rows: number;
  private cols: number;
  private navigableWaterPolygon: [number, number][];
  private waterGrid: boolean[][]; // [r][c] true if in navigable water
  private waterCells: GridPoint[] = [];

  constructor(navigableWater: [number, number][]) {
    this.navigableWaterPolygon = navigableWater;
    this.rows = Math.ceil((this.bounds.north - this.bounds.south) / this.step) + 1;
    this.cols = Math.ceil((this.bounds.east - this.bounds.west) / this.step) + 1;
    this.waterGrid = Array.from({ length: this.rows }, () =>
      Array(this.cols).fill(false)
    );

    this.precomputeWaterGrid();
  }

  private precomputeWaterGrid() {
    for (let r = 0; r < this.rows; r++) {
      const lat = this.bounds.south + r * this.step;
      for (let c = 0; c < this.cols; c++) {
        const lng = this.bounds.west + c * this.step;
        if (pointInPolygon([lat, lng], this.navigableWaterPolygon)) {
          this.waterGrid[r][c] = true;
          this.waterCells.push({ lat, lng, r, c });
        }
      }
    }
  }

  public getNavigableWaterPolygon(): [number, number][] {
    return this.navigableWaterPolygon;
  }

  private latLngToGrid(lat: number, lng: number): { r: number; c: number } {
    const r = Math.round((lat - this.bounds.south) / this.step);
    const c = Math.round((lng - this.bounds.west) / this.step);
    return {
      r: Math.max(0, Math.min(this.rows - 1, r)),
      c: Math.max(0, Math.min(this.cols - 1, c)),
    };
  }

  private gridToLatLng(r: number, c: number): [number, number] {
    return [
      Number((this.bounds.south + r * this.step).toFixed(4)),
      Number((this.bounds.west + c * this.step).toFixed(4)),
    ];
  }

  /**
   * Snaps a coordinate to the nearest valid navigable water grid point
   * (e.g. if a coastal port is just outside the digitized polygon boundary)
   */
  public snapToWater(point: [number, number]): [number, number] {
    if (pointInPolygon(point, this.navigableWaterPolygon)) {
      return point;
    }

    let nearest = point;
    let minDist = Infinity;

    for (const cell of this.waterCells) {
      const dist = haversineMeters(point, [cell.lat, cell.lng]);
      if (dist < minDist) {
        minDist = dist;
        nearest = [cell.lat, cell.lng];
      }
    }
    return nearest;
  }

  /**
   * Finds optimal route using Grid A* avoiding restricted zones,
   * with extra cost penalties for adverse weather.
   */
  public findRoute(
    start: [number, number],
    goal: [number, number],
    zones: RestrictedZone[] = [],
    weatherGrid: WeatherCell[] = []
  ): [number, number][] | null {
    const activeZones = zones.filter((z) => z.active);

    const snappedStart = this.snapToWater(start);
    const snappedGoal = this.snapToWater(goal);

    // Identify if start is currently inside any active zone
    const zonesContainingStart = activeZones.filter((z) =>
      pointInPolygon(snappedStart, z.polygon)
    );

    // Fast check: if direct line of sight exists, is navigable, and no zones or severe weather intersect, use direct path
    if (
      zonesContainingStart.length === 0 &&
      activeZones.every((z) => !segmentIntersectsPolygon(snappedStart, snappedGoal, z.polygon)) &&
      segmentEntirelyInsidePolygon(snappedStart, snappedGoal, this.navigableWaterPolygon, 12)
    ) {
      // Check if direct line hits severe adverse weather
      let hitsSevereWeather = false;
      for (const w of weatherGrid) {
        if (w.isAdverse) {
          const dist = haversineMeters([(snappedStart[0] + snappedGoal[0]) / 2, (snappedStart[1] + snappedGoal[1]) / 2], [w.lat, w.lng]);
          if (dist < 30000) {
            hitsSevereWeather = true;
            break;
          }
        }
      }
      if (!hitsSevereWeather) {
        return [snappedStart, snappedGoal];
      }
    }

    const startCoord = this.latLngToGrid(snappedStart[0], snappedStart[1]);
    const goalCoord = this.latLngToGrid(snappedGoal[0], snappedGoal[1]);

    const startKey = `${startCoord.r},${startCoord.c}`;
    const goalKey = `${goalCoord.r},${goalCoord.c}`;

    if (startKey === goalKey) {
      return [snappedStart, snappedGoal];
    }

    // Helper for fast adverse weather check
    const adversePoints = weatherGrid.filter((w) => w.isAdverse);

    const openSet: Array<{ key: string; r: number; c: number; f: number; g: number }> = [];
    const openSetMap = new Map<string, number>();
    const cameFrom = new Map<string, { r: number; c: number }>();
    const gScore = new Map<string, number>();

    const heuristic = (r: number, c: number): number => {
      const dr = Math.abs(r - goalCoord.r);
      const dc = Math.abs(c - goalCoord.c);
      return Math.sqrt(dr * dr + dc * dc);
    };

    gScore.set(startKey, 0);
    const startF = heuristic(startCoord.r, startCoord.c);
    openSet.push({ key: startKey, r: startCoord.r, c: startCoord.c, f: startF, g: 0 });
    openSetMap.set(startKey, startF);

    const directions = [
      [-1, 0], [1, 0], [0, -1], [0, 1], // Cardinal
      [-1, -1], [-1, 1], [1, -1], [1, 1], // Diagonal
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 4000;

    while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
      iterations++;

      // Pop lowest f
      let minIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[minIdx].f) {
          minIdx = i;
        }
      }
      const current = openSet.splice(minIdx, 1)[0];
      openSetMap.delete(current.key);

      if (current.r === goalCoord.r && current.c === goalCoord.c) {
        // Path found! Reconstruct
        const pathCoords: [number, number][] = [snappedGoal];
        let curr = { r: current.r, c: current.c };
        let currKey = `${curr.r},${curr.c}`;

        while (cameFrom.has(currKey)) {
          const prev = cameFrom.get(currKey)!;
          pathCoords.unshift(this.gridToLatLng(prev.r, prev.c));
          curr = prev;
          currKey = `${curr.r},${curr.c}`;
        }
        pathCoords[0] = snappedStart;

        // Smooth path
        return this.smoothPath(pathCoords, activeZones, zonesContainingStart);
      }

      for (const [dr, dc] of directions) {
        const nr = current.r + dr;
        const nc = current.c + dc;

        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
        if (!this.waterGrid[nr][nc]) continue;

        const neighborPoint = this.gridToLatLng(nr, nc);

        // Check restricted zones
        let inOtherZone = false;
        let inStartZone = false;

        for (const zone of activeZones) {
          if (pointInPolygon(neighborPoint, zone.polygon)) {
            if (zonesContainingStart.some((sz) => sz.id === zone.id)) {
              inStartZone = true;
            } else {
              inOtherZone = true;
              break;
            }
          }
        }
        if (inOtherZone) continue; // Obstacle: cannot enter other restricted zones

        // Base step cost (1.0 for orthogonal, 1.414 for diagonal)
        let stepCost = dr !== 0 && dc !== 0 ? 1.414 : 1.0;

        // Penalty for remaining inside the current zone to urge fastest exit
        if (inStartZone) {
          stepCost += 3.5;
        }

        // Adverse weather penalty
        for (const w of adversePoints) {
          const dist = haversineMeters(neighborPoint, [w.lat, w.lng]);
          if (dist < 40000) {
            stepCost += 5.0; // Penalty to steer clear of adverse weather
            break;
          }
        }

        const neighborKey = `${nr},${nc}`;
        const tentativeG = current.g + stepCost;
        const currentG = gScore.get(neighborKey) ?? Infinity;

        if (tentativeG < currentG) {
          cameFrom.set(neighborKey, { r: current.r, c: current.c });
          gScore.set(neighborKey, tentativeG);
          const f = tentativeG + heuristic(nr, nc);

          if (!openSetMap.has(neighborKey)) {
            openSet.push({ key: neighborKey, r: nr, c: nc, f, g: tentativeG });
            openSetMap.set(neighborKey, f);
          } else {
            const existing = openSet.find((item) => item.key === neighborKey);
            if (existing) {
              existing.f = f;
              existing.g = tentativeG;
            }
          }
        }
      }
    }

    // No path found (e.g. completely surrounded by restricted zones)
    return null;
  }

  /**
   * Path smoothing algorithm:
   * Replaces sequences of grid steps with direct line-of-sight segments
   * provided the segment stays inside navigable water and does not enter restricted zones.
   */
  public smoothPath(
    rawPath: [number, number][],
    activeZones: RestrictedZone[],
    zonesContainingStart: RestrictedZone[] = []
  ): [number, number][] {
    if (rawPath.length <= 2) return rawPath;

    // Obstacle zones to completely avoid during smoothing
    const obstacleZones = activeZones.filter(
      (z) => !zonesContainingStart.some((sz) => sz.id === z.id)
    );

    const smoothed: [number, number][] = [rawPath[0]];
    let currentIndex = 0;

    while (currentIndex < rawPath.length - 1) {
      let furthest = currentIndex + 1;

      for (let next = rawPath.length - 1; next > currentIndex + 1; next--) {
        const p1 = rawPath[currentIndex];
        const p2 = rawPath[next];

        // Check no zone collision against obstacle zones
        const hitZone = obstacleZones.some((z) => segmentIntersectsPolygon(p1, p2, z.polygon));
        if (hitZone) continue;

        // Check remains in navigable water
        const inWater = segmentEntirelyInsidePolygon(p1, p2, this.navigableWaterPolygon, 8);
        if (inWater) {
          furthest = next;
          break;
        }
      }

      smoothed.push(rawPath[furthest]);
      currentIndex = furthest;
    }

    return smoothed;
  }

  /**
   * Total route distance in Nautical Miles
   */
  public static calculateRouteDistanceNM(route: [number, number][], fromIndex = 0): number {
    if (!route || route.length <= fromIndex + 1) return 0;
    let total = 0;
    for (let i = fromIndex; i < route.length - 1; i++) {
      total += haversineNauticalMiles(route[i], route[i + 1]);
    }
    return total;
  }
}

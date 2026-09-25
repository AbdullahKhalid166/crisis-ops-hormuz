import fs from 'fs';
import path from 'path';
import {
  Ship,
  Port,
  RestrictedZone,
  Directive,
  PlaybackHistory,
  PlaybackSnapshot,
  PlaybackEvent,
  ShipStatus,
  CaptainResponse,
  CompactShipState,
} from '../types.ts';
import {
  haversineMeters,
  haversineNauticalMiles,
  calculateBearing,
  destinationPoint,
  pointInPolygon,
  segmentIntersectsPolygon,
} from '../routing/geo.ts';
import { MaritimeRouter } from '../routing/astar.ts';
import { AlertManager } from '../alerts/alertManager.ts';
import { WeatherService } from '../weather/weatherService.ts';
import { DistressAnalyzer } from '../ai/distressAnalyzer.ts';

export class FleetSimulator {
  private fleetData: any;
  private ships: Map<string, Ship> = new Map();
  private ports: Map<string, Port> = new Map();
  private zones: Map<string, RestrictedZone> = new Map();
  private directives: Map<string, Directive> = new Map();
  private router: MaritimeRouter;
  private alertManager: AlertManager;
  private weatherService: WeatherService;
  private distressAnalyzer: DistressAnalyzer;

  private seq = 0;
  private timer: NodeJS.Timeout | null = null;
  private onTickCallbacks: Array<(data: { seq: number; serverTime: number; compactShips: CompactShipState[]; activeAlertCount: number }) => void> = [];
  private onEventBroadcast: Array<(type: string, payload: any) => void> = [];

  // Geofence hysteresis tracking (shipId:zoneId -> last timestamp inside)
  private lastInsideZoneTime: Map<string, number> = new Map();

  // Playback ring buffer (last 1 hour @ 30s intervals = max 120 snapshots)
  private playbackSnapshots: PlaybackSnapshot[] = [];
  private playbackEvents: PlaybackEvent[] = [];
  private lastPlaybackSnapshotTime = 0;

  constructor(
    alertManager: AlertManager,
    weatherService: WeatherService,
    distressAnalyzer: DistressAnalyzer
  ) {
    this.alertManager = alertManager;
    this.weatherService = weatherService;
    this.distressAnalyzer = distressAnalyzer;

    // Load fleet.json
    const fleetPath = path.resolve(process.cwd(), 'server/data/fleet.json');
    const rawData = fs.readFileSync(fleetPath, 'utf-8');
    this.fleetData = JSON.parse(rawData);

    // Initialize router
    this.router = new MaritimeRouter(this.fleetData.navigableWater);

    // Populate ports
    for (const p of this.fleetData.ports) {
      this.ports.set(p.id, {
        id: p.id,
        name: p.name,
        position: [p.position[0], p.position[1]],
      });
    }

    // Populate ships
    this.initShips();

    // Take initial snapshot
    this.recordPlaybackSnapshot(true);
  }

  private initShips() {
    for (const f of this.fleetData.fleet) {
      const destPort = this.ports.get(f.destination);
      const startPos: [number, number] = [f.position[0], f.position[1]];
      const destPos: [number, number] = destPort
        ? [destPort.position[0], destPort.position[1]]
        : startPos;

      // Compute initial route avoiding any default obstacles
      const route = this.router.findRoute(startPos, destPos) || [startPos, destPos];
      const initialDistNM = MaritimeRouter.calculateRouteDistanceNM(route);
      const fuelBurnRate = 0.25 * f.speed * f.speed; // tons/hr
      const hoursNeeded = f.speed > 0 ? initialDistNM / f.speed : 0;
      const fuelNeeded = Number((fuelBurnRate * hoursNeeded).toFixed(1));
      const canReachDestination = f.fuel >= fuelNeeded;

      let initialStatus: ShipStatus = f.status as ShipStatus;
      if (!canReachDestination && initialStatus === 'normal') {
        initialStatus = 'insufficient_fuel';
      }

      const ship: Ship = {
        shipId: f.shipId,
        name: f.name,
        position: startPos,
        speed: f.speed,
        heading: f.heading,
        destination: f.destination,
        destinationPortName: destPort?.name,
        fuel: f.fuel,
        cargo: f.cargo,
        status: initialStatus,
        route,
        routeIndex: 0,
        canReachDestination,
        fuelNeeded,
        etaSeconds: f.speed > 0 ? Math.round(hoursNeeded * 3600) : null,
      };

      this.ships.set(ship.shipId, ship);

      if (!canReachDestination) {
        this.alertManager.triggerAlert({
          type: 'INSUFFICIENT_FUEL',
          priority: 'MEDIUM',
          shipIds: [ship.shipId],
          message: `${ship.name} has insufficient fuel (${ship.fuel}t) for destination ${destPort?.name || ship.destination} (needs ${fuelNeeded}t).`,
          dedupeKey: `INSUFFICIENT_FUEL:${ship.shipId}`,
        });
      }
    }
  }

  public start() {
    if (this.timer) return;
    // 500 ms tick = 2 Hz
    this.timer = setInterval(() => {
      this.tick();
    }, 500);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public onTick(
    cb: (data: {
      seq: number;
      serverTime: number;
      compactShips: CompactShipState[];
      activeAlertCount: number;
    }) => void
  ) {
    this.onTickCallbacks.push(cb);
  }

  public onBroadcast(cb: (type: string, payload: any) => void) {
    this.onEventBroadcast.push(cb);
  }

  public getShips(): Ship[] {
    return Array.from(this.ships.values());
  }

  public getShip(shipId: string): Ship | undefined {
    return this.ships.get(shipId);
  }

  public getPorts(): Port[] {
    return Array.from(this.ports.values());
  }

  public getZones(): RestrictedZone[] {
    return Array.from(this.zones.values());
  }

  public getDirectives(): Directive[] {
    return Array.from(this.directives.values());
  }

  public getNavigableWater(): [number, number][] {
    return this.fleetData.navigableWater;
  }

  public getScenario(): any {
    return this.fleetData.scenario;
  }

  public getPlaybackHistory(): PlaybackHistory {
    return {
      snapshots: this.playbackSnapshots,
      events: this.playbackEvents,
    };
  }

  // Zone management (Command only)
  public createZone(zoneData: Omit<RestrictedZone, 'id' | 'createdAt'>): RestrictedZone {
    const id = `ZN-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const zone: RestrictedZone = {
      ...zoneData,
      id,
      createdAt: Date.now(),
      active: true,
    };
    this.zones.set(zone.id, zone);

    this.recordEvent({
      timestamp: Date.now(),
      type: 'ZONE',
      description: `Restricted Zone "${zone.name}" created by Command`,
      refId: zone.id,
      severity: 'HIGH',
    });

    // Check if new zone intersects any ship route or ship current position
    this.handleZoneChanges();

    this.broadcast('zone:update', { zones: this.getZones() });
    return zone;
  }

  public updateZone(zone: RestrictedZone): boolean {
    if (!this.zones.has(zone.id)) return false;
    this.zones.set(zone.id, zone);

    this.recordEvent({
      timestamp: Date.now(),
      type: 'ZONE',
      description: `Restricted Zone "${zone.name}" modified`,
      refId: zone.id,
    });

    this.handleZoneChanges();
    this.broadcast('zone:update', { zones: this.getZones() });
    return true;
  }

  public deleteZone(zoneId: string): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;
    this.zones.delete(zoneId);

    this.recordEvent({
      timestamp: Date.now(),
      type: 'ZONE',
      description: `Restricted Zone "${zone.name}" cleared by Command`,
      refId: zoneId,
    });

    // Clean up geofence breach alerts and hysteresis tracking for this zone
    let alertsUpdated = false;
    for (const ship of this.ships.values()) {
      const dedupeKey = `GEOFENCE_BREACH:${ship.shipId}:${zoneId}`;
      const trackingKey = `${ship.shipId}:${zoneId}`;
      if (this.alertManager.resolveByDedupeKey(dedupeKey)) {
        alertsUpdated = true;
      }
      this.lastInsideZoneTime.delete(trackingKey);
    }
    if (alertsUpdated) {
      this.broadcast('alert:update', { alerts: this.alertManager.getAlerts() });
    }

    this.handleZoneChanges();
    this.broadcast('zone:update', { zones: this.getZones() });
    return true;
  }

  // Directive management (Command sends, Captain responds)
  public sendDirective(directiveData: Omit<Directive, 'id' | 'issuedAt' | 'status'>): Directive {
    const id = `DIR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const directive: Directive = {
      ...directiveData,
      id,
      issuedAt: Date.now(),
      status: 'pending',
    };
    this.directives.set(directive.id, directive);

    const targetShip = this.ships.get(directive.shipId);
    this.recordEvent({
      timestamp: Date.now(),
      type: 'DIRECTIVE',
      description: `Command issued ${directive.type} to ${targetShip?.name || directive.shipId}`,
      refId: directive.id,
      severity: 'MEDIUM',
    });

    this.broadcast('directive:update', { directives: this.getDirectives() });
    return directive;
  }

  public async handleCaptainResponse(response: CaptainResponse): Promise<void> {
    const ship = this.ships.get(response.shipId);
    if (!ship) return;

    if (response.action === 'ACCEPT' && response.directiveId) {
      const directive = this.directives.get(response.directiveId);
      if (directive && directive.shipId === ship.shipId) {
        directive.status = 'accepted';

        this.recordEvent({
          timestamp: Date.now(),
          type: 'DIRECTIVE',
          description: `Captain on ${ship.name} ACCEPTED directive ${directive.type}`,
          refId: directive.id,
        });

        // Apply directive action immediately
        this.applyAcceptedDirective(ship, directive);

        this.broadcast('directive:update', { directives: this.getDirectives() });
      }
    } else if (response.action === 'ESCALATE_DISTRESS') {
      const distressText = response.distressText || 'Emergency distress beacon activated!';

      // Run NLP / Gemini analysis
      const analysis = await this.distressAnalyzer.analyzeDistressMessage(distressText, ship.name);
      response.analysis = analysis;
      ship.status = 'distressed';
      ship.distressInfo = analysis;

      this.recordEvent({
        timestamp: Date.now(),
        type: 'STATUS_CHANGE',
        description: `DISTRESS ESCALATION: ${ship.name} (${analysis.incidentType}) - ${analysis.summary}`,
        refId: ship.shipId,
        severity: analysis.severity,
      });

      // Trigger distress alert with AI/parser priority
      this.alertManager.triggerAlert({
        type: 'DISTRESS',
        priority: analysis.severity,
        shipIds: [ship.shipId],
        message: `DISTRESS on ${ship.name}: ${analysis.summary} [${analysis.incidentType}]`,
        dedupeKey: `DISTRESS:${ship.shipId}`,
        metadata: {
          distressInfo: analysis,
        },
      });

      this.broadcast('alert:update', { alerts: this.alertManager.getAlerts() });
    }

    // Broadcast captain response to all viewers immediately
    this.broadcast('captain:broadcast', {
      shipId: ship.shipId,
      action: response.action,
      distressText: response.distressText,
      timestamp: Date.now(),
      analysis: response.analysis,
    });
  }

  private applyAcceptedDirective(ship: Ship, directive: Directive) {
    if (directive.type === 'HOLD_POSITION') {
      ship.status = 'stopped';
      ship.speed = 0;
    } else if (directive.type === 'RESUME_ROUTE') {
      const orig = this.fleetData.fleet.find((f: any) => f.shipId === ship.shipId);
      ship.speed = orig?.speed || 15;
      if (ship.fuel <= 0) {
        ship.status = 'no_fuel';
        ship.speed = 0;
      } else {
        ship.status = 'normal';
        this.recomputeRoute(ship);
      }
    } else if (directive.type === 'REROUTE_PORT' && directive.targetPort) {
      ship.destination = directive.targetPort;
      const port = this.ports.get(directive.targetPort);
      if (port) ship.destinationPortName = port.name;
      ship.status = 'rerouting';
      this.recomputeRoute(ship);
    } else if (directive.type === 'DIVERT_WAYPOINT' && directive.waypoint) {
      // Divert directly to specified waypoint
      ship.status = 'rerouting';
      const activeZones = this.getZones().filter((z) => z.active);
      const weatherGrid = this.weatherService.getWeatherGrid();
      const newRoute = this.router.findRoute(ship.position, directive.waypoint, activeZones, weatherGrid);
      if (newRoute) {
        ship.route = newRoute;
        ship.routeIndex = 0;
        ship.status = 'normal';
      }
    }
  }

  private handleZoneChanges() {
    const activeZones = this.getZones().filter((z) => z.active);
    const weatherGrid = this.weatherService.getWeatherGrid();
    let newAlertCreated = false;

    for (const ship of this.ships.values()) {
      if (ship.status === 'arrived' || ship.status === 'no_fuel') continue;

      // Check if current position is inside any active zone
      let insideZone = false;
      for (const zone of activeZones) {
        if (pointInPolygon(ship.position, zone.polygon)) {
          insideZone = true;
          const trackingKey = `${ship.shipId}:${zone.id}`;
          const dedupeKey = `GEOFENCE_BREACH:${ship.shipId}:${zone.id}`;
          this.lastInsideZoneTime.set(trackingKey, Date.now());

          const alert = this.alertManager.triggerGeofenceAlert({
            dedupeKey,
            shipId: ship.shipId,
            shipName: ship.name,
            zoneId: zone.id,
            zoneName: zone.name,
          });
          if (alert) {
            newAlertCreated = true;
          }
        }
      }

      // Check if remaining route intersects any zone
      let routeIntersects = false;
      if (ship.route && ship.route.length > ship.routeIndex + 1) {
        for (let i = ship.routeIndex; i < ship.route.length - 1; i++) {
          const p1 = ship.route[i];
          const p2 = ship.route[i + 1];
          for (const zone of activeZones) {
            if (segmentIntersectsPolygon(p1, p2, zone.polygon)) {
              routeIntersects = true;
              break;
            }
          }
          if (routeIntersects) break;
        }
      }

      if (insideZone || routeIntersects) {
        ship.status = 'rerouting';
        this.recomputeRoute(ship);
      }
    }

    if (newAlertCreated) {
      this.broadcast('alert:update', { alerts: this.alertManager.getAlerts() });
    }
  }

  private recomputeRoute(ship: Ship) {
    const destPort = this.ports.get(ship.destination);
    const targetPos: [number, number] = destPort
      ? [destPort.position[0], destPort.position[1]]
      : ship.position;

    const activeZones = this.getZones().filter((z) => z.active);
    const weatherGrid = this.weatherService.getWeatherGrid();

    const newPath = this.router.findRoute(ship.position, targetPos, activeZones, weatherGrid);

    if (!newPath || newPath.length < 2) {
      // Use STRANDED only when the destination is truly unreachable
      ship.status = 'stranded';
      ship.speed = 0;
      this.alertManager.triggerAlert({
        type: 'STRANDED',
        priority: 'CRITICAL',
        shipIds: [ship.shipId],
        message: `Vessel ${ship.name} is STRANDED! Destination port is completely inaccessible or enclosed.`,
        dedupeKey: `STRANDED:${ship.shipId}`,
      });
      return;
    }

    ship.route = newPath;
    ship.routeIndex = 0;

    // Check if still currently inside a zone
    const isCurrentlyInside = activeZones.some((z) => pointInPolygon(ship.position, z.polygon));
    if (isCurrentlyInside) {
      ship.status = 'rerouting';
    } else if (ship.status === 'rerouting') {
      ship.status = 'normal';
    }

    // Resolve stranded alert if active
    this.alertManager.resolveByDedupeKey(`STRANDED:${ship.shipId}`);

    // Broadcast route update to all clients
    this.broadcast('route:update', {
      shipId: ship.shipId,
      route: ship.route,
      status: ship.status,
    });

    // Update fuel calculations
    const remainingNM = MaritimeRouter.calculateRouteDistanceNM(newPath, 0);
    const hours = ship.speed > 0 ? remainingNM / ship.speed : 0;
    const isAdverse = this.weatherService.isAdverseAt(ship.position[0], ship.position[1]);
    const burnRate = 0.25 * ship.speed * ship.speed * (isAdverse ? 1.3 : 1.0);
    ship.fuelNeeded = Number((burnRate * hours).toFixed(1));
    ship.canReachDestination = ship.fuel >= ship.fuelNeeded;
    ship.etaSeconds = ship.speed > 0 ? Math.round(hours * 3600) : null;

    if (!ship.canReachDestination && ship.fuel > 0 && ship.status !== 'distressed') {
      ship.status = 'insufficient_fuel';
      this.alertManager.triggerAlert({
        type: 'INSUFFICIENT_FUEL',
        priority: 'MEDIUM',
        shipIds: [ship.shipId],
        message: `${ship.name} route update: fuel needed (${ship.fuelNeeded}t) exceeds onboard fuel (${ship.fuel}t).`,
        dedupeKey: `INSUFFICIENT_FUEL:${ship.shipId}`,
      });
    }
  }

  // SIMULATOR TICK (every 500 ms = 2 Hz)
  private tick() {
    this.seq++;
    const now = Date.now();
    const dtSeconds = 0.5;
    const dtHours = dtSeconds / 3600;

    const activeZones = this.getZones().filter((z) => z.active);
    const shipList = Array.from(this.ships.values());

    for (const ship of shipList) {
      const isStopped =
        ship.status === 'stopped' ||
        ship.status === 'arrived' ||
        ship.status === 'no_fuel' ||
        ship.status === 'stranded';

      // Check adverse weather at ship position
      const inAdverse = this.weatherService.isAdverseAt(ship.position[0], ship.position[1]);
      ship.inAdverseWeather = inAdverse;

      if (!isStopped && ship.speed > 0) {
        // Calculate fuel burn = 0.25 * speed² tons/hour * dtHours * (1.3 if adverse)
        const weatherMultiplier = inAdverse ? 1.3 : 1.0;
        const burnRateTonsPerHour = 0.25 * (ship.speed * ship.speed) * weatherMultiplier;
        const burnedTons = burnRateTonsPerHour * dtHours;

        ship.fuel = Math.max(0, Number((ship.fuel - burnedTons).toFixed(3)));

        if (ship.fuel <= 0) {
          ship.fuel = 0;
          ship.speed = 0;
          ship.status = 'no_fuel';
          this.alertManager.triggerAlert({
            type: 'NO_FUEL',
            priority: 'CRITICAL',
            shipIds: [ship.shipId],
            message: `CRITICAL: ${ship.name} has run out of fuel! Propulsion lost completely.`,
            dedupeKey: `NO_FUEL:${ship.shipId}`,
          });
          continue;
        }

        // Advance along route
        this.advanceShip(ship, dtSeconds);
      }

      // Geofence check with 10s hysteresis
      for (const zone of activeZones) {
        const inside = pointInPolygon(ship.position, zone.polygon);
        const dedupeKey = `GEOFENCE_BREACH:${ship.shipId}:${zone.id}`;
        const trackingKey = `${ship.shipId}:${zone.id}`;

        if (inside) {
          // Inside restricted zone: update last inside timestamp and trigger/maintain breach alert
          this.lastInsideZoneTime.set(trackingKey, now);
          const newAlert = this.alertManager.triggerGeofenceAlert({
            dedupeKey,
            shipId: ship.shipId,
            shipName: ship.name,
            zoneId: zone.id,
            zoneName: zone.name,
          });
          if (newAlert) {
            this.broadcast('alert:update', { alerts: this.alertManager.getAlerts() });
          }
        } else {
          // Outside restricted zone: hysteresis timer requires ship to remain outside for at least 10 seconds
          const hasActiveAlert = this.alertManager.hasActiveAlert(dedupeKey);
          if (hasActiveAlert && !this.lastInsideZoneTime.has(trackingKey)) {
            this.lastInsideZoneTime.set(trackingKey, now);
          }

          const lastIn = this.lastInsideZoneTime.get(trackingKey);
          if (lastIn) {
            const outsideDurationMs = now - lastIn;
            if (outsideDurationMs >= 10000) {
              // Ship has maintained clear distance outside the zone for at least 10 seconds
              const resolved = this.alertManager.resolveByDedupeKey(dedupeKey);
              this.lastInsideZoneTime.delete(trackingKey);

              // If ship was in rerouting status, check if outside all active zones
              if (ship.status === 'rerouting') {
                const stillInAny = activeZones.some((z) => pointInPolygon(ship.position, z.polygon));
                if (!stillInAny) {
                  ship.status = 'normal';
                }
              }

              if (resolved) {
                this.broadcast('alert:update', { alerts: this.alertManager.getAlerts() });
              }
            }
          }
        }
      }
    }

    // Proximity check (< 2 km between any pair)
    for (let i = 0; i < shipList.length; i++) {
      for (let j = i + 1; j < shipList.length; j++) {
        const s1 = shipList[i];
        const s2 = shipList[j];
        const distMeters = haversineMeters(s1.position, s2.position);
        const pairKey = [s1.shipId, s2.shipId].sort().join(':');
        const dedupeKey = `PROXIMITY:${pairKey}`;

        if (distMeters < 2000) {
          this.alertManager.triggerAlert({
            type: 'PROXIMITY',
            priority: 'HIGH',
            shipIds: [s1.shipId, s2.shipId],
            message: `PROXIMITY ALERT: ${s1.name} and ${s2.name} are within ${(distMeters / 1000).toFixed(2)} km of each other!`,
            dedupeKey,
            metadata: {
              targetShipId: s2.shipId,
              distanceMeters: Math.round(distMeters),
            },
          });
        } else if (distMeters > 2500) {
          this.alertManager.resolveByDedupeKey(dedupeKey);
        }
      }
    }

    // Playback snapshot recording (every 30 seconds)
    if (now - this.lastPlaybackSnapshotTime >= 30000) {
      this.recordPlaybackSnapshot(false);
    }

    // Compact ship states (no heavy route coordinate arrays on every 500ms tick)
    const compactShips: CompactShipState[] = shipList.map((s) => ({
      shipId: s.shipId,
      position: [s.position[0], s.position[1]],
      speed: s.speed,
      heading: s.heading,
      fuel: s.fuel,
      status: s.status,
      routeIndex: s.routeIndex,
      canReachDestination: s.canReachDestination,
      fuelNeeded: s.fuelNeeded,
      etaSeconds: s.etaSeconds,
      inAdverseWeather: s.inAdverseWeather,
    }));

    // Broadcast tick to all listeners
    const activeCount = this.alertManager.getActiveCount();
    for (const cb of this.onTickCallbacks) {
      cb({
        seq: this.seq,
        serverTime: now,
        compactShips,
        activeAlertCount: activeCount,
      });
    }
  }

  private advanceShip(ship: Ship, dtSeconds: number) {
    if (!ship.route || ship.route.length === 0) return;

    // Distance to travel this tick in meters:
    // speed (knots) * 1852 meters / 3600 seconds * dtSeconds
    let distanceToTravelMeters = (ship.speed * 1852 * dtSeconds) / 3600;

    while (distanceToTravelMeters > 0 && ship.routeIndex < ship.route.length) {
      const targetWp = ship.route[ship.routeIndex];
      const distToTarget = haversineMeters(ship.position, targetWp);

      // If already at target waypoint or closer than 15 meters
      if (distToTarget <= Math.max(15, distanceToTravelMeters)) {
        ship.position = [targetWp[0], targetWp[1]];
        distanceToTravelMeters -= distToTarget;
        ship.routeIndex++;

        // If reached end of route
        if (ship.routeIndex >= ship.route.length) {
          ship.status = 'arrived';
          ship.speed = 0;
          ship.etaSeconds = 0;
          this.recordEvent({
            timestamp: Date.now(),
            type: 'STATUS_CHANGE',
            description: `${ship.name} arrived at destination port ${ship.destinationPortName || ship.destination}`,
            refId: ship.shipId,
          });
          break;
        }
      } else {
        // Move towards target waypoint
        const bearing = calculateBearing(ship.position, targetWp);
        ship.heading = Math.round(bearing);
        ship.position = destinationPoint(ship.position, distanceToTravelMeters, bearing);
        distanceToTravelMeters = 0;
      }
    }

    // Update remaining distance and ETA
    if (ship.routeIndex < ship.route.length && ship.speed > 0) {
      const distRemaining =
        haversineNauticalMiles(ship.position, ship.route[ship.routeIndex]) +
        MaritimeRouter.calculateRouteDistanceNM(ship.route, ship.routeIndex);
      const hoursRemaining = distRemaining / ship.speed;
      ship.etaSeconds = Math.round(hoursRemaining * 3600);
      const isAdverse = Boolean(ship.inAdverseWeather);
      const burnRate = 0.25 * ship.speed * ship.speed * (isAdverse ? 1.3 : 1.0);
      ship.fuelNeeded = Number((burnRate * hoursRemaining).toFixed(1));
      ship.canReachDestination = ship.fuel >= ship.fuelNeeded;
    }
  }

  private recordPlaybackSnapshot(force = false) {
    const now = Date.now();
    this.lastPlaybackSnapshotTime = now;

    const snapshot: PlaybackSnapshot = {
      timestamp: now,
      ships: Array.from(this.ships.values()).map((s) => ({
        shipId: s.shipId,
        position: [s.position[0], s.position[1]],
        speed: s.speed,
        heading: s.heading,
        fuel: s.fuel,
        status: s.status,
      })),
    };

    this.playbackSnapshots.push(snapshot);
    // Keep max 120 snapshots (1 hour @ 30s)
    if (this.playbackSnapshots.length > 120) {
      this.playbackSnapshots.shift();
    }
  }

  private recordEvent(event: PlaybackEvent) {
    this.playbackEvents.push(event);
    if (this.playbackEvents.length > 100) {
      this.playbackEvents.shift();
    }
  }

  private broadcast(type: string, payload: any) {
    for (const cb of this.onEventBroadcast) {
      cb(type, payload);
    }
  }
}

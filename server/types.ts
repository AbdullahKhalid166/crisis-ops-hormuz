export type ShipStatus =
  | 'normal'
  | 'rerouting'
  | 'distressed'
  | 'stopped'
  | 'stranded'
  | 'insufficient_fuel'
  | 'no_fuel'
  | 'arrived';

export type AlertType =
  | 'GEOFENCE_BREACH'
  | 'PROXIMITY'
  | 'DISTRESS'
  | 'STRANDED'
  | 'INSUFFICIENT_FUEL'
  | 'NO_FUEL';

export type AlertPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AlertState = 'active' | 'acknowledged' | 'resolved';

export interface DistressAnalysis {
  severity: AlertPriority;
  incidentType: string;
  summary: string;
  injuries: number;
  fatalities: number;
  missing: number;
  damageEstimate: string;
  cargoAtRisk: boolean;
  needsEvacuation: boolean;
  recommendedAction: string;
  confidence: number;
  source: 'ai' | 'fallback';
}

export interface Port {
  id: string;
  name: string;
  position: [number, number]; // [lat, lng]
}

export interface Ship {
  shipId: string;
  name: string;
  position: [number, number]; // [lat, lng]
  speed: number; // knots
  heading: number; // degrees 0-360
  destination: string; // port id
  destinationPortName?: string;
  fuel: number; // tons
  cargo: string;
  status: ShipStatus;
  route: [number, number][]; // list of [lat, lng]
  routeIndex: number;
  canReachDestination: boolean;
  fuelNeeded: number;
  etaSeconds: number | null;
  distressInfo?: DistressAnalysis;
  inAdverseWeather?: boolean;
}

export interface RestrictedZone {
  id: string;
  name: string;
  polygon: [number, number][]; // array of [lat, lng]
  createdAt: number;
  createdBy: string; // 'Command'
  active: boolean;
  reason?: string;
}

export interface WeatherCell {
  id: string;
  lat: number;
  lng: number;
  waveHeight: number; // meters
  windSpeed: number; // knots
  isAdverse: boolean;
  updatedAt: number;
}

export interface Alert {
  id: string;
  type: AlertType;
  priority: AlertPriority;
  shipIds: string[];
  message: string;
  createdAt: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
  state: AlertState;
  metadata?: {
    zoneId?: string;
    targetShipId?: string;
    distressInfo?: DistressAnalysis;
    distanceMeters?: number;
  };
}

export type DirectiveType =
  | 'REROUTE_PORT'
  | 'DIVERT_WAYPOINT'
  | 'HOLD_POSITION'
  | 'RESUME_ROUTE';

export interface Directive {
  id: string;
  shipId: string;
  type: DirectiveType;
  targetPort?: string;
  waypoint?: [number, number];
  issuedBy: string;
  issuedAt: number;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  note?: string;
}

export interface CaptainResponse {
  directiveId?: string;
  shipId: string;
  action: 'ACCEPT' | 'ESCALATE_DISTRESS';
  distressText?: string;
  timestamp: number;
  analysis?: DistressAnalysis;
}

export interface PlaybackSnapshot {
  timestamp: number;
  ships: Array<{
    shipId: string;
    position: [number, number];
    speed: number;
    heading: number;
    fuel: number;
    status: ShipStatus;
  }>;
}

export interface PlaybackEvent {
  timestamp: number;
  type: 'ALERT' | 'DIRECTIVE' | 'ZONE' | 'STATUS_CHANGE';
  description: string;
  refId?: string;
  severity?: AlertPriority;
}

export interface PlaybackHistory {
  snapshots: PlaybackSnapshot[];
  events: PlaybackEvent[];
}

export type Role = 'command' | 'captain';

// Client to Server
export type ClientMessage =
  | { type: 'auth'; role: Role; shipId?: string }
  | { type: 'zone:create'; zone: Omit<RestrictedZone, 'id' | 'createdAt'> }
  | { type: 'zone:update'; zone: RestrictedZone }
  | { type: 'zone:delete'; zoneId: string }
  | { type: 'directive:send'; directive: Omit<Directive, 'id' | 'issuedAt' | 'status'> }
  | { type: 'captain:respond'; action: 'ACCEPT' | 'ESCALATE_DISTRESS'; directiveId?: string; distressText?: string }
  | { type: 'alert:acknowledge'; alertId: string }
  | { type: 'alert:resolve'; alertId: string }
  | { type: 'playback:request' }
  | { type: 'ping'; t: number };

// Server to Client
export interface CompactShipState {
  shipId: string;
  position: [number, number];
  speed: number;
  heading: number;
  fuel: number;
  status: ShipStatus;
  routeIndex: number;
  canReachDestination: boolean;
  fuelNeeded: number;
  etaSeconds: number | null;
  inAdverseWeather?: boolean;
}

export type ServerMessage =
  | {
      type: 'init';
      role: Role;
      shipId?: string;
      scenario: any;
      fleet: Ship[];
      ports: Port[];
      zones: RestrictedZone[];
      alerts: Alert[];
      directives: Directive[];
      weatherGrid: WeatherCell[];
      navigableWater: [number, number][];
      seq: number;
      serverTime: number;
    }
  | {
      type: 'tick';
      seq: number;
      serverTime: number;
      ships: CompactShipState[];
      activeAlertCount: number;
    }
  | {
      type: 'route:update';
      shipId: string;
      route: [number, number][];
      status: ShipStatus;
    }
  | { type: 'zone:update'; zones: RestrictedZone[] }
  | { type: 'directive:update'; directives: Directive[] }
  | { type: 'alert:update'; alerts: Alert[] }
  | { type: 'weather:update'; weatherGrid: WeatherCell[] }
  | { type: 'playback:data'; playback: PlaybackHistory }
  | {
      type: 'captain:broadcast';
      shipId: string;
      action: 'ACCEPT' | 'ESCALATE_DISTRESS';
      distressText?: string;
      timestamp: number;
      analysis?: DistressAnalysis;
    }
  | { type: 'pong'; t: number; serverTime: number }
  | { type: 'error'; message: string };

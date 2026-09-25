import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Ship,
  Port,
  RestrictedZone,
  Alert,
  Directive,
  WeatherCell,
  PlaybackHistory,
  Role,
  ServerMessage,
  ClientMessage,
} from '../types.ts';

export function useTacticalWebSocket() {
  const [role, setRole] = useState<Role>('command');
  const [captainShipId, setCaptainShipId] = useState<string>('MV-1');
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastServerAlert, setLastServerAlert] = useState<string | null>(null);

  const [scenario, setScenario] = useState<any>(null);
  const [fleet, setFleet] = useState<Ship[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [zones, setZones] = useState<RestrictedZone[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [weatherGrid, setWeatherGrid] = useState<WeatherCell[]>([]);
  const [navigableWater, setNavigableWater] = useState<[number, number][]>([]);
  const [playbackData, setPlaybackData] = useState<PlaybackHistory | null>(null);
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [serverTime, setServerTime] = useState<number>(Date.now());
  const [lastSeq, setLastSeq] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef(false);
  const roleRef = useRef<Role>(role);
  const captainShipIdRef = useRef<string>(captainShipId);

  useEffect(() => {
    roleRef.current = role;
    captainShipIdRef.current = captainShipId;
  }, [role, captainShipId]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    console.info('[Tactical WebSocket] Connecting:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const sendPing = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', t: performance.now() }));
      }
    };

    ws.onopen = () => {
      setConnected(true);
      console.info('[Tactical WebSocket] Connected:', wsUrl);
      // Send auth for current role
      ws.send(
        JSON.stringify({
          type: 'auth',
          role: roleRef.current,
          shipId: roleRef.current === 'captain' ? captainShipIdRef.current : undefined,
        })
      );

      // Measure round-trip time immediately and every 1000ms
      sendPing();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(sendPing, 1000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        switch (msg.type) {
          case 'pong': {
            const rtt = Math.max(1, Math.round(performance.now() - msg.t));
            setLatencyMs(rtt);
            break;
          }

          case 'init': {
            console.info('[Tactical WebSocket] Fleet initialized:', msg.fleet.length, 'ships');
            setScenario(msg.scenario);
            setFleet(msg.fleet);
            setPorts(msg.ports);
            setZones(msg.zones);
            setAlerts(msg.alerts);
            setDirectives(msg.directives);
            setWeatherGrid(msg.weatherGrid);
            setNavigableWater(msg.navigableWater);
            setServerTime(msg.serverTime);
            setLastSeq(msg.seq);
            setActiveAlertCount(msg.alerts.filter((a) => a.state === 'active').length);
            break;
          }

          case 'tick': {
            setLastSeq(msg.seq);
            setServerTime(msg.serverTime);
            setActiveAlertCount(msg.activeAlertCount);

            // Merge compact state into existing fleet
            setFleet((prevFleet) => {
              if (prevFleet.length === 0) return prevFleet;
              const map = new Map(prevFleet.map((s) => [s.shipId, s]));
              for (const update of msg.ships) {
                const existing = map.get(update.shipId);
                if (existing) {
                  map.set(update.shipId, {
                    ...existing,
                    position: update.position,
                    speed: update.speed,
                    heading: update.heading,
                    fuel: update.fuel,
                    status: update.status,
                    routeIndex: update.routeIndex,
                    canReachDestination: update.canReachDestination,
                    fuelNeeded: update.fuelNeeded,
                    etaSeconds: update.etaSeconds,
                    inAdverseWeather: update.inAdverseWeather,
                  });
                }
              }
              return Array.from(map.values());
            });
            break;
          }

          case 'route:update': {
            setFleet((prevFleet) =>
              prevFleet.map((s) =>
                s.shipId === msg.shipId
                  ? { ...s, route: msg.route, status: msg.status, routeIndex: 0 }
                  : s
              )
            );
            break;
          }

          case 'zone:update': {
            setZones(msg.zones);
            break;
          }

          case 'directive:update': {
            setDirectives(msg.directives);
            break;
          }

          case 'alert:update': {
            setAlerts(msg.alerts);
            setActiveAlertCount(msg.alerts.filter((a) => a.state === 'active').length);
            break;
          }

          case 'weather:update': {
            setWeatherGrid(msg.weatherGrid);
            break;
          }

          case 'playback:data': {
            setPlaybackData(msg.playback);
            break;
          }

          case 'captain:broadcast': {
            break;
          }

          case 'error': {
            setLastServerAlert(msg.message);
            console.warn('[Tactical Server Alert]', msg.message);
            // Clear toast after 4s
            setTimeout(() => {
              setLastServerAlert(null);
            }, 4000);
            break;
          }
        }
      } catch (err) {
        console.error('Error handling websocket message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setLatencyMs(null);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
      if (isUnmountedRef.current) return;

      console.warn('[Tactical WebSocket] Connection closed; retrying in 2s:', wsUrl);
      // Auto-reconnect after 2 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connect();
      }, 2000);
    };

    ws.onerror = (event) => {
      console.error('[Tactical WebSocket] Connection error:', wsUrl, event);
      ws.close();
    };
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();
    return () => {
      isUnmountedRef.current = true;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      pingIntervalRef.current = null;
      reconnectTimeoutRef.current = null;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const switchRole = (newRole: Role, newShipId?: string) => {
    setRole(newRole);
    if (newShipId) setCaptainShipId(newShipId);
    send({
      type: 'auth',
      role: newRole,
      shipId: newRole === 'captain' ? newShipId || captainShipId : undefined,
    });
  };

  const createZone = (zone: Omit<RestrictedZone, 'id' | 'createdAt'>) => {
    send({ type: 'zone:create', zone });
  };

  const updateZone = (zone: RestrictedZone) => {
    send({ type: 'zone:update', zone });
  };

  const deleteZone = (zoneId: string) => {
    send({ type: 'zone:delete', zoneId });
  };

  const sendDirective = (directive: Omit<Directive, 'id' | 'issuedAt' | 'status'>) => {
    send({ type: 'directive:send', directive });
  };

  const respondCaptain = (action: 'ACCEPT' | 'ESCALATE_DISTRESS', directiveId?: string, distressText?: string) => {
    send({ type: 'captain:respond', action, directiveId, distressText });
  };

  const acknowledgeAlert = (alertId: string) => {
    send({ type: 'alert:acknowledge', alertId });
  };

  const resolveAlert = (alertId: string) => {
    send({ type: 'alert:resolve', alertId });
  };

  const requestPlayback = () => {
    send({ type: 'playback:request' });
  };

  return {
    connected,
    latencyMs,
    lastServerAlert,
    role,
    captainShipId,
    scenario,
    fleet,
    ports,
    zones,
    alerts,
    directives,
    weatherGrid,
    navigableWater,
    playbackData,
    activeAlertCount,
    serverTime,
    lastSeq,
    switchRole,
    createZone,
    updateZone,
    deleteZone,
    sendDirective,
    respondCaptain,
    acknowledgeAlert,
    resolveAlert,
    requestPlayback,
  };
}

import { WebSocketServer, WebSocket } from 'ws';
import {
  ClientMessage,
  ServerMessage,
  Role,
  Ship,
  Alert,
  Directive,
  CompactShipState,
} from '../types.ts';
import { FleetSimulator } from '../sim/fleetSimulator.ts';
import { AlertManager } from '../alerts/alertManager.ts';
import { WeatherService } from '../weather/weatherService.ts';

interface ClientSession {
  ws: WebSocket;
  role: Role;
  shipId?: string;
  alive: boolean;
}

export class SocketHandler {
  private wss: WebSocketServer;
  private sim: FleetSimulator;
  private alertManager: AlertManager;
  private weatherService: WeatherService;
  private clients: Map<WebSocket, ClientSession> = new Map();

  constructor(
    wss: WebSocketServer,
    sim: FleetSimulator,
    alertManager: AlertManager,
    weatherService: WeatherService
  ) {
    this.wss = wss;
    this.sim = sim;
    this.alertManager = alertManager;
    this.weatherService = weatherService;

    this.init();
  }

  private init() {
    this.wss.on('connection', (ws: WebSocket) => {
      const session: ClientSession = {
        ws,
        role: 'command', // Default until auth message
        alive: true,
      };
      this.clients.set(ws, session);

      // Send initial snapshot
      this.sendInit(session);

      ws.on('message', (rawData: string) => {
        try {
          const msg = JSON.parse(rawData.toString()) as ClientMessage;
          this.handleClientMessage(session, msg);
        } catch (err) {
          this.sendError(ws, 'Malformed JSON payload');
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    // Sim tick broadcast
    this.sim.onTick((tickData) => {
      this.broadcastTick(tickData);
    });

    // Simulator events broadcast with role scoping
    this.sim.onBroadcast((type, payload) => {
      if (type === 'directive:update') {
        const allDirectives = (payload as { directives: Directive[] }).directives;
        for (const session of this.clients.values()) {
          if (session.ws.readyState === WebSocket.OPEN) {
            if (session.role === 'captain' && session.shipId) {
              const captainDirectives = allDirectives.filter((d) => d.shipId === session.shipId);
              session.ws.send(JSON.stringify({ type: 'directive:update', directives: captainDirectives }));
            } else {
              session.ws.send(JSON.stringify({ type: 'directive:update', directives: allDirectives }));
            }
          }
        }
        return;
      }

      if (type === 'alert:update') {
        const allAlerts = (payload as { alerts: Alert[] }).alerts;
        for (const session of this.clients.values()) {
          if (session.ws.readyState === WebSocket.OPEN) {
            if (session.role === 'captain' && session.shipId) {
              const captainAlerts = allAlerts.filter((a) => a.shipIds.includes(session.shipId!));
              session.ws.send(JSON.stringify({ type: 'alert:update', alerts: captainAlerts }));
            } else {
              session.ws.send(JSON.stringify({ type: 'alert:update', alerts: allAlerts }));
            }
          }
        }
        return;
      }

      this.broadcastToAll({ type, ...payload } as ServerMessage);
    });
  }

  private sendInit(session: ClientSession) {
    const allShips = this.sim.getShips();
    // Send all 15 ships so rail dots, ship picker dropdown, and tactical map have full fleet data
    const shipsToSend = allShips;

    const allDirectives = this.sim.getDirectives();
    const directivesToSend =
      session.role === 'captain' && session.shipId
        ? allDirectives.filter((d) => d.shipId === session.shipId)
        : allDirectives;

    const allAlerts = this.alertManager.getAlerts();
    const alertsToSend =
      session.role === 'captain' && session.shipId
        ? allAlerts.filter((a) => a.shipIds.includes(session.shipId!))
        : allAlerts;

    const initMsg: ServerMessage = {
      type: 'init',
      role: session.role,
      shipId: session.shipId,
      scenario: this.sim.getScenario(),
      fleet: shipsToSend,
      ports: this.sim.getPorts(),
      zones: this.sim.getZones(),
      alerts: alertsToSend,
      directives: directivesToSend,
      weatherGrid: this.weatherService.getWeatherGrid(),
      navigableWater: this.sim.getNavigableWater(),
      seq: 0,
      serverTime: Date.now(),
    };

    this.send(session.ws, initMsg);
  }

  private broadcastTick(tickData: {
    seq: number;
    serverTime: number;
    compactShips: CompactShipState[];
    activeAlertCount: number;
  }) {
    // Pre-serialize tick message containing all compact ship positions for tactical awareness and rail dots
    const tickMsg: ServerMessage = {
      type: 'tick',
      seq: tickData.seq,
      serverTime: tickData.serverTime,
      ships: tickData.compactShips,
      activeAlertCount: tickData.activeAlertCount,
    };
    const tickRaw = JSON.stringify(tickMsg);

    for (const session of this.clients.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(tickRaw);
      }
    }
  }

  private broadcastToAll(msg: ServerMessage) {
    const raw = JSON.stringify(msg);
    for (const session of this.clients.values()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(raw);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private sendError(ws: WebSocket, message: string) {
    this.send(ws, { type: 'error', message });
  }

  private handleClientMessage(session: ClientSession, msg: ClientMessage) {
    switch (msg.type) {
      case 'ping': {
        this.send(session.ws, {
          type: 'pong',
          t: msg.t,
          serverTime: Date.now(),
        });
        break;
      }

      case 'auth': {
        session.role = msg.role;
        session.shipId = msg.shipId;
        // Re-send init with role-specific filters
        this.sendInit(session);
        break;
      }

      case 'zone:create': {
        if (session.role !== 'command') {
          this.sendError(session.ws, 'Unauthorized: Captain cannot create zones');
          return;
        }
        this.sim.createZone(msg.zone);
        break;
      }

      case 'zone:update': {
        if (session.role !== 'command') {
          this.sendError(session.ws, 'Unauthorized: Captain cannot edit zones');
          return;
        }
        this.sim.updateZone(msg.zone);
        break;
      }

      case 'zone:delete': {
        if (session.role !== 'command') {
          this.sendError(session.ws, 'Unauthorized: Captain cannot delete zones');
          return;
        }
        this.sim.deleteZone(msg.zoneId);
        break;
      }

      case 'directive:send': {
        if (session.role !== 'command') {
          this.sendError(session.ws, 'Unauthorized: Only Command can issue directives');
          return;
        }
        this.sim.sendDirective(msg.directive);
        break;
      }

      case 'captain:respond': {
        // Enforce captain role and ship assignment
        const shipId = session.shipId;
        if (!shipId) {
          this.sendError(session.ws, 'No ship assigned to Captain session');
          return;
        }

        this.sim.handleCaptainResponse({
          directiveId: msg.directiveId,
          shipId,
          action: msg.action,
          distressText: msg.distressText,
          timestamp: Date.now(),
        });
        break;
      }

      case 'alert:acknowledge': {
        if (session.role !== 'command') {
          this.sendError(session.ws, 'Unauthorized: Only Command can acknowledge alerts');
          return;
        }
        if (this.alertManager.acknowledgeAlert(msg.alertId)) {
          this.broadcastToAll({
            type: 'alert:update',
            alerts: this.alertManager.getAlerts(),
          });
        }
        break;
      }

      case 'alert:resolve': {
        if (session.role !== 'command') {
          this.sendError(session.ws, 'Unauthorized: Only Command can resolve alerts');
          return;
        }
        if (this.alertManager.resolveAlert(msg.alertId)) {
          this.broadcastToAll({
            type: 'alert:update',
            alerts: this.alertManager.getAlerts(),
          });
        }
        break;
      }

      case 'playback:request': {
        const history = this.sim.getPlaybackHistory();
        this.send(session.ws, {
          type: 'playback:data',
          playback: history,
        });
        break;
      }
    }
  }
}

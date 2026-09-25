import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';

import { AlertManager } from './server/alerts/alertManager.ts';
import { WeatherService } from './server/weather/weatherService.ts';
import { DistressAnalyzer } from './server/ai/distressAnalyzer.ts';
import { FleetSimulator } from './server/sim/fleetSimulator.ts';
import { SocketHandler } from './server/ws/socketHandler.ts';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  // Services initialization
  const alertManager = new AlertManager();
  const weatherService = new WeatherService();
  const distressAnalyzer = new DistressAnalyzer();

  weatherService.start();

  const sim = new FleetSimulator(alertManager, weatherService, distressAnalyzer);
  sim.start();

  // WebSocket Server on the same HTTP server
  const wss = new WebSocketServer({ server });
  new SocketHandler(wss, sim, alertManager, weatherService);

  // REST API health & status endpoints
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: Date.now(), ships: sim.getShips().length });
  });

  app.get('/api/fleet', (_req, res) => {
    res.json({
      scenario: sim.getScenario(),
      fleet: sim.getShips(),
      ports: sim.getPorts(),
      zones: sim.getZones(),
      activeAlerts: alertManager.getActiveCount(),
    });
  });

  // Vite middleware in dev or static files in prod
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`Crisis Ops - Strait of Hormuz Fleet Command online`);
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    console.log(`WebSocket ready for tactical multi-viewer sync`);
    console.log(`======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});

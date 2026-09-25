# Crisis Ops – Strait of Hormuz Fleet Command

Tactical maritime crisis operations command for 15 commercial cargo vessels navigating the high-risk Strait of Hormuz, Persian Gulf, and Gulf of Oman.

---

## 1. System Architecture & Tech Stack

- **Backend**: Node.js + TypeScript, Express, native WebSocket (`ws`). The server serves as the single authoritative source of truth.
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS + Leaflet (CartoDB Dark Matter tiles).
- **Navigation & Routing**: Discrete Grid A* (~0.06° cell resolution) within the digitized `navigableWater` polygon, avoiding dynamic restricted exclusion zones and applying route penalties to adverse weather cells. Includes line-of-sight path smoothing.
- **Weather Engine**: Open-Meteo Marine + Forecast APIs (keyless), polling representative offshore coordinates every 5 minutes with caching. A cell is classified as adverse if wave height > 2.5 m or wind speed > 25 knots.
- **Distress NLP Engine**: Google Gemini API (`gemini-3.8-flash`) with structured JSON schema. Automatically falls back to a deterministic regex/keyword parser if `GEMINI_API_KEY` is not provided or fails.
- **Sound Alert System**: WebAudio API synthesizer generating pulse sonar/radar alarm tones on active critical/high alerts with mute control.
- **State Synchronization & Interpolation**: 2 Hz (500 ms) server-authoritative ticks broadcasted via WebSockets with monotonic sequence numbers and timestamps. The frontend uses `requestAnimationFrame` lerp and shortest-arc heading rotation for continuous motion without teleportation.
- **Timeline Playback**: 1-hour ring buffer stored on the server at 30-second resolution, scrubbable via a bottom timeline with key event markers.

---

## 2. Environment Variables

Defined in `.env` (refer to `.env.example`):

| Variable | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API Key for distress report analysis | No (optional) | Fallback parser used |
| `PORT` | HTTP & WebSocket server port | No | `4173` |
| `NODE_ENV` | Environment mode (`development` or `production`) | No | `development` |
| `APP_URL` | Application base URL | No | Dynamic |

---

## 3. How to Run

### Option A: Local Development
```bash
# 1. Install dependencies
npm install

# 2. Run full-stack development server (Express + Vite middlewares on port 4173)
npm run dev

# 3. Access in browser
http://localhost:4173
```

### Option B: Docker Compose
```bash
# Build and run the complete system in container
docker compose up --build

# Access in browser
http://localhost:4173
```

---

## 4. Operational Assumptions & Design Decisions

1. **Fleet & Data Integrity**:
   - Exactly 15 vessels from `fleet.json` (Aurora, Borealis, Cygnus, Dragon, Emerald, Falcon, Gharial, Halcyon, Iris, Jade, Kite, Lotus, Mirage, Nova, Orca) with their exact initial coordinates, destinations, cargoes, speeds, and fuel loads.
   - All 10 destination ports (Kuwait City, Bushehr, Dammam, Manama, Doha, Abu Dhabi, Jebel Ali, Bandar Abbas, Sohar, Muscat) are mapped with coordinate positions.

2. **Snapping Coastal Points**:
   - Shoreline ports or vessel departure positions that lie immediately on or slightly outside the coarse 29-vertex `navigableWater` boundary polygon are snapped to the nearest navigable grid cell using Haversine distance before routing.

3. **Fuel Burn Formulation**:
   - Base fuel burn rate = `0.25 × speed²` tons per hour.
   - In adverse weather conditions (wave height > 2.5m or wind > 25kn), fuel burn rate is multiplied by `× 1.3`.
   - When remaining fuel drops to 0, propulsion stops (`speed = 0`), ship status becomes `no_fuel`, and a `CRITICAL` alert is dispatched.
   - `canReachDestination` evaluates whether `fuel >= fuelNeeded` for the remaining distance to destination port. If not, the vessel status is flagged as `insufficient_fuel`.

4. **Alert Pipeline Deduplication**:
   - Geofence breaches (`GEOFENCE_BREACH`) deduplicate per `(shipId, zoneId)`. If the ship exits the zone, the active breach is automatically resolved.
   - Proximity warnings (`PROXIMITY`) trigger when any pair of vessels is `< 2.0 km` apart, with hysteresis resolving when distance exceeds `> 2.5 km`.
   - Distress incidents (`DISTRESS`) derive priority from Gemini or local NLP analysis: `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW`.

5. **Role Security**:
   - `Command`: Authorized to view the entire fleet, create/delete restricted exclusion polygons, transmit directives (Reroute, Divert, Hold, Resume), and acknowledge/resolve alerts.
   - `Captain`: Connects as a specific vessel's commanding officer. Telemetry is scoped to their vessel. Captains can accept incoming directives or transmit emergency distress reports. Any attempt to modify restricted zones or issue orders to other vessels is rejected at the server WebSocket layer.

6. **Tactical UI/UX**:
   - CartoDB Dark Matter map canvas filling 100% viewport.
   - Monospace tabular numerals, small caps labels, sharp 90-degree corners (no rounded pills or sky-blue aesthetics).
   - Heading-rotated tactical vessel markers with pulsing distress beacons and 2 km proximity collision rings.

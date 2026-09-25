export interface InterpolatedShipState {
  shipId: string;
  lat: number;
  lng: number;
  heading: number;
}

export class FleetInterpolator {
  private states = new Map<
    string,
    {
      currentLat: number;
      currentLng: number;
      currentHeading: number;
      targetLat: number;
      targetLng: number;
      targetHeading: number;
      lastServerTime: number;
    }
  >();

  public updateTargets(
    ships: Array<{ shipId: string; position: [number, number]; heading: number }>,
    serverTime: number
  ) {
    for (const ship of ships) {
      const [tLat, tLng] = ship.position;
      const tHeading = ship.heading;

      const existing = this.states.get(ship.shipId);
      if (!existing) {
        this.states.set(ship.shipId, {
          currentLat: tLat,
          currentLng: tLng,
          currentHeading: tHeading,
          targetLat: tLat,
          targetLng: tLng,
          targetHeading: tHeading,
          lastServerTime: serverTime,
        });
      } else {
        // If huge jump (> 0.5 degrees ~ 55km), ease in or re-anchor
        const distSq =
          (existing.currentLat - tLat) ** 2 + (existing.currentLng - tLng) ** 2;
        if (distSq > 0.25) {
          existing.currentLat = tLat;
          existing.currentLng = tLng;
          existing.currentHeading = tHeading;
        }
        existing.targetLat = tLat;
        existing.targetLng = tLng;
        existing.targetHeading = tHeading;
        existing.lastServerTime = serverTime;
      }
    }
  }

  public step(dtSeconds: number): Map<string, InterpolatedShipState> {
    const result = new Map<string, InterpolatedShipState>();
    // Exponential smoothing factor: roughly converges within 500ms
    const factor = 1 - Math.exp(-dtSeconds * 8);

    for (const [shipId, s] of this.states.entries()) {
      // Lerp positions
      s.currentLat += (s.targetLat - s.currentLat) * factor;
      s.currentLng += (s.targetLng - s.currentLng) * factor;

      // Shortest-arc heading lerp
      let diff = (s.targetHeading - s.currentHeading + 540) % 360 - 180;
      s.currentHeading = (s.currentHeading + diff * factor + 360) % 360;

      result.set(shipId, {
        shipId,
        lat: Number(s.currentLat.toFixed(5)),
        lng: Number(s.currentLng.toFixed(5)),
        heading: Number(s.currentHeading.toFixed(1)),
      });
    }

    return result;
  }

  public clear() {
    this.states.clear();
  }
}

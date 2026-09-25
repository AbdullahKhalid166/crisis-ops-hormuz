import { Alert, AlertPriority, AlertType, DistressAnalysis } from '../types.ts';

export class AlertManager {
  private alerts: Alert[] = [];
  private activeDedupeKeys = new Map<string, string>(); // dedupeKey -> alertId

  public getAlerts(): Alert[] {
    return this.alerts;
  }

  public getActiveCount(): number {
    return this.alerts.filter((a) => a.state === 'active').length;
  }

  public triggerGeofenceAlert(params: {
    dedupeKey: string;
    shipId: string;
    shipName: string;
    zoneId: string;
    zoneName: string;
  }): Alert | null {
    const { dedupeKey, shipId, shipName, zoneId, zoneName } = params;

    // Check if an alert already exists with this key
    if (this.activeDedupeKeys.has(dedupeKey)) {
      const existingId = this.activeDedupeKeys.get(dedupeKey)!;
      const existing = this.alerts.find((a) => a.id === existingId);
      // Keep ONE active alert per ship+zone until acknowledged, or resolved after 10s
      if (existing && (existing.state === 'active' || existing.state === 'acknowledged')) {
        return null;
      }
    }

    return this.triggerAlert({
      type: 'GEOFENCE_BREACH',
      priority: 'CRITICAL',
      shipIds: [shipId],
      message: `Geofence breach: ${shipName} inside restricted zone "${zoneName}"! Evasive reroute ordered.`,
      dedupeKey,
      metadata: { zoneId },
    });
  }

  public triggerAlert(params: {
    type: AlertType;
    priority: AlertPriority;
    shipIds: string[];
    message: string;
    dedupeKey?: string;
    metadata?: {
      zoneId?: string;
      targetShipId?: string;
      distressInfo?: DistressAnalysis;
      distanceMeters?: number;
    };
  }): Alert | null {
    const { type, priority, shipIds, message, dedupeKey, metadata } = params;

    if (dedupeKey && this.activeDedupeKeys.has(dedupeKey)) {
      const existingId = this.activeDedupeKeys.get(dedupeKey)!;
      const existing = this.alerts.find((a) => a.id === existingId);
      if (existing && existing.state === 'active') {
        // Already active alert for this event
        return null;
      }
    }

    const alertId = `ALT-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const newAlert: Alert = {
      id: alertId,
      type,
      priority,
      shipIds,
      message,
      createdAt: Date.now(),
      state: 'active',
      metadata,
    };

    this.alerts.unshift(newAlert);
    if (dedupeKey) {
      this.activeDedupeKeys.set(dedupeKey, alertId);
    }

    // Keep alert history reasonably bounded (e.g. max 150 items)
    if (this.alerts.length > 150) {
      this.alerts.pop();
    }

    return newAlert;
  }

  public hasActiveAlert(dedupeKey: string): boolean {
    if (this.activeDedupeKeys.has(dedupeKey)) {
      const alertId = this.activeDedupeKeys.get(dedupeKey)!;
      const alert = this.alerts.find((a) => a.id === alertId);
      return alert !== undefined && alert.state !== 'resolved';
    }
    return false;
  }

  public resolveByDedupeKey(dedupeKey: string): boolean {
    if (this.activeDedupeKeys.has(dedupeKey)) {
      const alertId = this.activeDedupeKeys.get(dedupeKey)!;
      const resolved = this.resolveAlert(alertId);
      this.activeDedupeKeys.delete(dedupeKey);
      return resolved;
    }
    return false;
  }

  public acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert && alert.state === 'active') {
      alert.state = 'acknowledged';
      alert.acknowledgedAt = Date.now();
      return true;
    }
    return false;
  }

  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert && alert.state !== 'resolved') {
      alert.state = 'resolved';
      alert.resolvedAt = Date.now();

      // Clear any dedupe key referencing this
      for (const [key, id] of this.activeDedupeKeys.entries()) {
        if (id === alertId) {
          this.activeDedupeKeys.delete(key);
        }
      }
      return true;
    }
    return false;
  }
}

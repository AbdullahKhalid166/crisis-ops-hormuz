import { WeatherCell } from '../types.ts';

interface MarineLocation {
  id: string;
  lat: number;
  lng: number;
  name: string;
}

const MARINE_POINTS: MarineLocation[] = [
  { id: 'W1', lat: 29.3, lng: 49.2, name: 'Northern Gulf (Kuwait/Bushehr)' },
  { id: 'W2', lat: 28.0, lng: 51.0, name: 'Central Persian Gulf' },
  { id: 'W3', lat: 27.0, lng: 50.8, name: 'Dammam / Bahrain Approaches' },
  { id: 'W4', lat: 26.8, lng: 52.6, name: 'Mid-Gulf Shipping Lane' },
  { id: 'W5', lat: 25.5, lng: 52.8, name: 'Qatar Basin' },
  { id: 'W6', lat: 25.0, lng: 54.0, name: 'Abu Dhabi Offshore' },
  { id: 'W7', lat: 25.6, lng: 55.0, name: 'Dubai / UAE Coast' },
  { id: 'W8', lat: 26.4, lng: 55.8, name: 'Strait of Hormuz West Entry' },
  { id: 'W9', lat: 26.55, lng: 56.45, name: 'Strait of Hormuz Narrows' },
  { id: 'W10', lat: 25.8, lng: 57.0, name: 'Gulf of Oman North' },
  { id: 'W11', lat: 24.8, lng: 57.3, name: 'Sohar / Fujairah Offshore' },
  { id: 'W12', lat: 23.9, lng: 58.8, name: 'Muscat Deep Sea Approach' },
];

export class WeatherService {
  private cache: WeatherCell[] = [];
  private lastFetchTime = 0;
  private pollIntervalMs = 5 * 60 * 1000; // 5 minutes
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.initDefaultWeather();
  }

  private initDefaultWeather() {
    // Initial seeded baseline
    const now = Date.now();
    this.cache = MARINE_POINTS.map((p, index) => {
      // Seed realistic waves (1.2m - 2.8m) and wind (12kn - 28kn)
      // Make 1 or 2 areas initially rough (e.g. Strait Narrows or Muscat) for realistic tactical scenarios
      const isInitialRough = index === 8 || index === 11;
      const wave = isInitialRough ? 2.9 : 1.4 + (index % 3) * 0.4;
      const wind = isInitialRough ? 28.5 : 14 + (index % 4) * 3;

      return {
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        waveHeight: Number(wave.toFixed(1)),
        windSpeed: Number(wind.toFixed(1)),
        isAdverse: wave > 2.5 || wind > 25,
        updatedAt: now,
      };
    });
  }

  public start() {
    // Fetch immediately, then schedule every 5 min
    this.fetchLiveMarineWeather().catch(() => {});
    this.timer = setInterval(() => {
      this.fetchLiveMarineWeather().catch(() => {});
    }, this.pollIntervalMs);
  }

  public stop() {
    if (this.timer) clearInterval(this.timer);
  }

  public getWeatherGrid(): WeatherCell[] {
    return this.cache;
  }

  /**
   * Checks if a specific coordinate is within adverse weather cell radius (approx 45 km)
   */
  public isAdverseAt(lat: number, lng: number): boolean {
    for (const cell of this.cache) {
      if (cell.isAdverse) {
        // Approximate degree distance (~0.45 deg ~ 50km)
        const dLat = Math.abs(cell.lat - lat);
        const dLng = Math.abs(cell.lng - lng);
        if (dLat * dLat + dLng * dLng < 0.2) {
          return true;
        }
      }
    }
    return false;
  }

  public async fetchLiveMarineWeather(): Promise<void> {
    const lats = MARINE_POINTS.map((p) => p.lat).join(',');
    const lngs = MARINE_POINTS.map((p) => p.lng).join(',');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      // Open-Meteo Marine API
      const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lngs}&current=wave_height&wind_speed_unit=kn`;
      // Open-Meteo Forecast API for wind_speed_10m in knots
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=wind_speed_10m&wind_speed_unit=kn`;

      const [marineRes, forecastRes] = await Promise.allSettled([
        fetch(marineUrl, { signal: controller.signal }),
        fetch(forecastUrl, { signal: controller.signal }),
      ]);
      clearTimeout(timeout);

      let marineData: any = null;
      let forecastData: any = null;

      if (marineRes.status === 'fulfilled' && marineRes.value.ok) {
        marineData = await marineRes.value.json();
      }
      if (forecastRes.status === 'fulfilled' && forecastRes.value.ok) {
        forecastData = await forecastRes.value.json();
      }

      const now = Date.now();

      // Open-Meteo returns an array of results when multiple coordinates are passed
      const updatedCells: WeatherCell[] = MARINE_POINTS.map((point, i) => {
        let wave = this.cache[i]?.waveHeight ?? 1.5;
        let wind = this.cache[i]?.windSpeed ?? 15.0;

        if (Array.isArray(marineData)) {
          const item = marineData[i];
          if (item?.current?.wave_height !== undefined && item.current.wave_height !== null) {
            wave = item.current.wave_height;
          }
        } else if (marineData?.current?.wave_height !== undefined) {
          wave = marineData.current.wave_height;
        }

        if (Array.isArray(forecastData)) {
          const item = forecastData[i];
          if (item?.current?.wind_speed_10m !== undefined && item.current.wind_speed_10m !== null) {
            wind = item.current.wind_speed_10m;
          }
        } else if (forecastData?.current?.wind_speed_10m !== undefined) {
          wind = forecastData.current.wind_speed_10m;
        }

        const isAdverse = wave > 2.5 || wind > 25.0;

        return {
          id: point.id,
          lat: point.lat,
          lng: point.lng,
          waveHeight: Number(wave.toFixed(1)),
          windSpeed: Number(wind.toFixed(1)),
          isAdverse,
          updatedAt: now,
        };
      });

      this.cache = updatedCells;
      this.lastFetchTime = now;
    } catch {
      // Fallback silently to existing cached data as specified
    }
  }
}

export const EARTH_RADIUS_METERS = 6371000;
export const METERS_PER_NAUTICAL_MILE = 1852;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Returns distance in meters between two [lat, lng] coordinates
 */
export function haversineMeters(p1: [number, number], p2: [number, number]): number {
  const [lat1, lon1] = p1;
  const [lat2, lon2] = p2;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function haversineNauticalMiles(p1: [number, number], p2: [number, number]): number {
  return haversineMeters(p1, p2) / METERS_PER_NAUTICAL_MILE;
}

/**
 * Computes initial bearing from p1 to p2 in degrees (0 - 360)
 */
export function calculateBearing(p1: [number, number], p2: [number, number]): number {
  const [lat1, lon1] = p1;
  const [lat2, lon2] = p2;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const lambda1 = toRad(lon1);
  const lambda2 = toRad(lon2);
  const dLambda = lambda2 - lambda1;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const brg = toDeg(Math.atan2(y, x));
  return (brg + 360) % 360;
}

/**
 * Computes destination point given start [lat, lng], distance in meters, and bearing in degrees
 */
export function destinationPoint(
  start: [number, number],
  distanceMeters: number,
  bearingDeg: number
): [number, number] {
  const [lat1, lon1] = start;
  const delta = distanceMeters / EARTH_RADIUS_METERS;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(lat1);
  const lambda1 = toRad(lon1);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  return [toDeg(phi2), toDeg(lambda2)];
}

/**
 * Standard ray-casting point-in-polygon algorithm
 * polygon is array of [lat, lng]
 */
export function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;
  const [lat, lng] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = [polygon[i][1], polygon[i][0]]; // x=lng, y=lat
    const [xj, yj] = [polygon[j][1], polygon[j][0]];

    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Line segment intersection check between (p1, p2) and (p3, p4)
 * Points are [lat, lng]
 */
function ccw(p1: [number, number], p2: [number, number], p3: [number, number]): boolean {
  return (p3[0] - p1[0]) * (p2[1] - p1[1]) > (p2[0] - p1[0]) * (p3[1] - p1[1]);
}

export function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number]
): boolean {
  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
    ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
}

/**
 * Checks if a line segment crosses any edge of a polygon or if midpoint lies inside
 */
export function segmentIntersectsPolygon(
  p1: [number, number],
  p2: [number, number],
  polygon: [number, number][]
): boolean {
  if (polygon.length < 3) return false;
  // If either endpoint is inside, it intersects
  if (pointInPolygon(p1, polygon) || pointInPolygon(p2, polygon)) return true;

  // Check edge intersection
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (segmentsIntersect(p1, p2, polygon[i], polygon[j])) {
      return true;
    }
  }

  // Check midpoint
  const mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  if (pointInPolygon(mid, polygon)) return true;

  return false;
}

/**
 * Checks if line segment is entirely inside a polygon
 * Subdivides into test points
 */
export function segmentEntirelyInsidePolygon(
  p1: [number, number],
  p2: [number, number],
  polygon: [number, number][],
  samples = 5
): boolean {
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const lat = p1[0] + t * (p2[0] - p1[0]);
    const lng = p1[1] + t * (p2[1] - p1[1]);
    if (!pointInPolygon([lat, lng], polygon)) {
      return false;
    }
  }
  return true;
}

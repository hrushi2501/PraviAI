export const TILE_SIZE = 256;
export const MAX_MERCATOR_LATITUDE = 85.05112878;
export type MapPoint = { x: number; y: number };
export type MapCoordinate = { latitude: number; longitude: number };

export function project(coordinate: MapCoordinate, zoom: number): MapPoint {
  const size = TILE_SIZE * 2 ** zoom;
  const latitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, coordinate.latitude),
  );
  const sine = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((coordinate.longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  };
}

export function unproject(point: MapPoint, zoom: number): MapCoordinate {
  const size = TILE_SIZE * 2 ** zoom;
  return {
    longitude: (((point.x / size) * 360 - 180 + 540) % 360) - 180,
    latitude:
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * point.y) / size))) * 180) /
      Math.PI,
  };
}

export function fitCoordinates(
  coordinates: MapCoordinate[],
  width: number,
  height: number,
): { center: MapCoordinate; zoom: number } {
  if (!coordinates.length)
    return { center: { latitude: 22.5, longitude: 79 }, zoom: 5 };
  for (let zoom = 16; zoom >= 3; zoom--) {
    const points = coordinates.map((coordinate) => project(coordinate, zoom));
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    if (
      (maxX - minX <= width - 100 && maxY - minY <= height - 100) ||
      zoom === 3
    )
      return {
        center: unproject({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, zoom),
        zoom,
      };
  }
  return { center: coordinates[0], zoom: 3 };
}

export const MIN_MAP_ZOOM = 3;
export const MAX_MAP_ZOOM = 19;

export function clampZoom(zoom: number): number {
  return Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, zoom));
}

export function zoomAroundPoint(
  center: MapCoordinate,
  currentZoom: number,
  targetZoom: number,
  screenX: number,
  screenY: number,
  width: number,
  height: number,
): MapCoordinate {
  const currentCenterPoint = project(center, currentZoom);
  const pointUnderCursor = {
    x: currentCenterPoint.x + (screenX - width / 2),
    y: currentCenterPoint.y + (screenY - height / 2),
  };
  const coordUnderCursor = unproject(pointUnderCursor, currentZoom);

  const targetPointUnderCursor = project(coordUnderCursor, targetZoom);
  const targetCenterPoint = {
    x: targetPointUnderCursor.x - (screenX - width / 2),
    y: targetPointUnderCursor.y - (screenY - height / 2),
  };
  return unproject(targetCenterPoint, targetZoom);
}

export function visibleTiles(
  center: MapCoordinate,
  zoom: number,
  width: number,
  height: number,
  buffer = 0,
  baseZoomOverride?: number,
) {
  const baseZoom =
    baseZoomOverride !== undefined
      ? Math.max(0, Math.min(19, baseZoomOverride))
      : Math.max(0, Math.min(19, Math.round(zoom)));
  const scale = 2 ** (zoom - baseZoom);
  const point = project(center, baseZoom);
  const halfW = width / 2 / scale;
  const halfH = height / 2 / scale;
  const left = point.x - halfW;
  const top = point.y - halfH;
  const count = 2 ** baseZoom;
  const tiles: Array<{
    key: string;
    url: string;
    left: number;
    top: number;
    size: number;
    baseZoom: number;
  }> = [];

  const minX = Math.floor(left / TILE_SIZE) - buffer;
  const maxX = Math.ceil((left + halfW * 2) / TILE_SIZE) - 1 + buffer;
  const minY = Math.floor(top / TILE_SIZE) - buffer;
  const maxY = Math.ceil((top + halfH * 2) / TILE_SIZE) - 1 + buffer;

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (y < 0 || y >= count) continue;
      const wrappedX = ((x % count) + count) % count;
      const screenLeft = (x * TILE_SIZE - point.x) * scale + width / 2;
      const screenTop = (y * TILE_SIZE - point.y) * scale + height / 2;
      const screenSize = TILE_SIZE * scale;
      tiles.push({
        key: `${baseZoom}:${wrappedX}:${y}`,
        url: `https://tile.openstreetmap.org/${baseZoom}/${wrappedX}/${y}.png`,
        left: screenLeft,
        top: screenTop,
        size: screenSize,
        baseZoom,
      });
    }
  }
  return tiles;
}

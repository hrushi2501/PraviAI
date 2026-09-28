import { describe, expect, it } from "vitest";
import {
  fitCoordinates,
  project,
  unproject,
  visibleTiles,
  zoomAroundPoint,
} from "@/lib/map-projection";

describe("map geography", () => {
  it("places the equator and prime meridian at the world's pixel center", () => {
    expect(project({ latitude: 0, longitude: 0 }, 3)).toEqual({
      x: 1024,
      y: 1024,
    });
  });
  it("round-trips real Indian geotags at different zoom levels", () => {
    for (const zoom of [3, 8, 16]) {
      const coordinate = { latitude: 23.0225, longitude: 72.5714 };
      const actual = unproject(project(coordinate, zoom), zoom);
      expect(actual.latitude).toBeCloseTo(coordinate.latitude, 8);
      expect(actual.longitude).toBeCloseTo(coordinate.longitude, 8);
    }
  });
  it("keeps both scope extremes inside the padded fitted viewport", () => {
    const coordinates = [
      { latitude: 8, longitude: 72 },
      { latitude: 34, longitude: 90 },
    ];
    const fitted = fitCoordinates(coordinates, 900, 500);
    const center = project(fitted.center, fitted.zoom);
    for (const coordinate of coordinates) {
      const point = project(coordinate, fitted.zoom);
      expect(Math.abs(point.x - center.x)).toBeLessThanOrEqual(400);
      expect(Math.abs(point.y - center.y)).toBeLessThanOrEqual(200);
    }
  });
  it("requests only visible tiles and wraps longitude without invalid tile indexes", () => {
    const tiles = visibleTiles({ latitude: 0, longitude: 179 }, 3, 500, 400);
    expect(tiles.length).toBeLessThanOrEqual(9);
    for (const tile of tiles) {
      const match = tile.url.match(/\/3\/(\d+)\/(\d+)\.png$/);
      expect(match).not.toBeNull();
      expect(Number(match?.[1])).toBeLessThan(8);
      expect(Number(match?.[2])).toBeLessThan(8);
      expect(tile.left).toBeLessThan(500);
      expect(tile.left + 256).toBeGreaterThan(0);
      expect(tile.top).toBeLessThan(400);
      expect(tile.top + 256).toBeGreaterThan(0);
    }
  });
  it("preserves the exact geographic coordinate under cursor during smooth zoom around point", () => {
    const center = { latitude: 23.0225, longitude: 72.5714 }; // Ahmedabad
    const currentZoom = 12.0;
    const targetZoom = 13.5;
    const width = 800;
    const height = 500;
    const cursorX = 620;
    const cursorY = 180;

    // What coordinate was under cursor before zoom?
    const cPoint = project(center, currentZoom);
    const beforeCoord = unproject(
      {
        x: cPoint.x + (cursorX - width / 2),
        y: cPoint.y + (cursorY - height / 2),
      },
      currentZoom,
    );

    // Zoom around cursor:
    const newCenter = zoomAroundPoint(
      center,
      currentZoom,
      targetZoom,
      cursorX,
      cursorY,
      width,
      height,
    );

    // Where is that same coordinate projected on screen after zoom?
    const newCPoint = project(newCenter, targetZoom);
    const afterPoint = project(beforeCoord, targetZoom);
    const afterScreenX = afterPoint.x - newCPoint.x + width / 2;
    const afterScreenY = afterPoint.y - newCPoint.y + height / 2;

    expect(afterScreenX).toBeCloseTo(cursorX, 4);
    expect(afterScreenY).toBeCloseTo(cursorY, 4);
  });
  it("scales and positions tiles continuously at fractional zooms without NaN", () => {
    const tiles = visibleTiles(
      { latitude: 23.0225, longitude: 72.5714 },
      12.45,
      800,
      500,
    );
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(Number.isFinite(tile.left)).toBe(true);
      expect(Number.isFinite(tile.top)).toBe(true);
      expect(tile.size).toBeGreaterThan(200);
      expect(tile.size).toBeLessThan(400);
      expect(tile.baseZoom).toBe(12);
    }
  });
});

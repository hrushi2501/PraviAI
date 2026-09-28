import { GeoTag } from "@/server/domain/value-objects/geo-tag";

/** Empty paired input means unknown; never substitute an origin or fixture location. */
export function parseCoordinateInput(latitude: string, longitude: string) {
  const lat = latitude.trim();
  const lng = longitude.trim();
  if (!lat && !lng) return null;
  if (!lat || !lng)
    throw new Error(
      "Enter both latitude and longitude, or leave both unknown.",
    );
  const latitudeValue = Number(lat);
  const longitudeValue = Number(lng);
  if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue))
    throw new Error("Coordinates must be finite decimal numbers.");
  return new GeoTag(latitudeValue, longitudeValue).toPoint();
}

import { InvariantViolationError } from "@/server/db/error-mapper";

/**
 * Value Object representing geographic coordinates within India's jurisdiction.
 * Matches SQL check constraint: latitude BETWEEN 6.0 AND 38.0 AND longitude BETWEEN 68.0 AND 98.0.
 */
export class GeoTag {
  public readonly latitude: number;
  public readonly longitude: number;

  constructor(latitude: number, longitude: number) {
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new InvariantViolationError("Coordinates must be valid numbers");
    }
    if (latitude < 6.0 || latitude > 38.0) {
      throw new InvariantViolationError(
        `Latitude ${latitude} is outside valid Indian territory bounds (6.0 to 38.0)`,
      );
    }
    if (longitude < 68.0 || longitude > 98.0) {
      throw new InvariantViolationError(
        `Longitude ${longitude} is outside valid Indian territory bounds (68.0 to 98.0)`,
      );
    }

    this.latitude = latitude;
    this.longitude = longitude;
  }

  static tryCreate(
    latitude?: number | string | null,
    longitude?: number | string | null,
  ): GeoTag | null {
    if (latitude == null || longitude == null) {
      return null;
    }
    const lat =
      typeof latitude === "string" ? Number.parseFloat(latitude) : latitude;
    const lng =
      typeof longitude === "string" ? Number.parseFloat(longitude) : longitude;
    return new GeoTag(lat, lng);
  }

  toPoint(): { latitude: number; longitude: number } {
    return {
      latitude: this.latitude,
      longitude: this.longitude,
    };
  }

  /**
   * Calculates great-circle distance between two coordinates in kilometers using Haversine formula.
   */
  distanceToKm(other: GeoTag): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // Earth radius in km

    const dLat = toRad(other.latitude - this.latitude);
    const dLon = toRad(other.longitude - this.longitude);
    const lat1 = toRad(this.latitude);
    const lat2 = toRad(other.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

import { InvalidArgumentError } from '../../shared/domain/InvalidArgumentError.ts';
export interface MapSearch { latitude: number; longitude: number; radiusMeters: number }
export interface MapActivity {
  id: string; title: string; description: string; locationName: string; categoryName: string;
  latitude: number; longitude: number; startsAt: string; endsAt: string; timeZone: string;
  price: number; currency: string; distanceMeters: number;
}
export interface MapActivities { activities: MapActivity[]; hasMore: boolean }
export function mapSearch(input: Record<string, unknown>): MapSearch {
  if (Object.keys(input).some(key => !['lat', 'lng', 'radiusMeters'].includes(key))) throw new InvalidArgumentError('Parámetros de mapa inválidos.');
  function number(value: unknown): number {
    if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new InvalidArgumentError('Coordenadas y radio deben ser números válidos.');
    return Number(value);
  }
  const latitude = number(input.lat), longitude = number(input.lng), radiusMeters = number(input.radiusMeters ?? '5000');
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || radiusMeters <= 0 || radiusMeters > 10000) {
    throw new InvalidArgumentError('Latitud: −90 a 90; longitud: −180 a 180; radio: mayor que 0 y hasta 10000 metros.');
  }
  return { latitude, longitude, radiusMeters };
}

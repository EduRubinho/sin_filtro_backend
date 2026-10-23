import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapSearch } from '../../src/event/domain/MapActivity.ts';
test('consulta del mapa valida coordenadas, radio, parámetros repetidos y entradas vacías', () => {
  assert.deepEqual(mapSearch({ lat: '-12.04', lng: '-77.03' }), { latitude: -12.04, longitude: -77.03, radiusMeters: 5000 });
  assert.equal(mapSearch({ lat: '1e-7', lng: '0' }).latitude, 0.0000001);
  assert.equal(mapSearch({ lat: '0', lng: '0', radiusMeters: '500' }).radiusMeters, 500);
  for (const query of [{}, { lat: '', lng: '1' }, { lat: ['1', '2'], lng: '1' }, { lat: '91', lng: '1' },
    { lat: '1', lng: '-181' }, { lat: '1', lng: '1', radiusMeters: '0' }, { lat: '1', lng: '1', radiusMeters: '10001' },
    { lat: '1', lng: 'NaN' }, { lat: '1', lng: '1', status: 'draft' }]) {
    assert.throws(() => mapSearch(query), { code: 'INVALID_INPUT' });
  }
});

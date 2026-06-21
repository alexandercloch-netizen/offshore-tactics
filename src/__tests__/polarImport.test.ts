import { parsePolar } from '../engine/polarImport';

describe('parsePolar — grid formats', () => {
  it('parses a generic TWA\\TWS grid', () => {
    const text = 'TWA\\TWS,6,10\n45,4,6\n90,5,7\n135,4.5,6.5';
    const r = parsePolar(text);
    expect(r.ok).toBe(true);
    expect(r.polar!.tws).toEqual([6, 10]);
    expect(r.polar!.twa).toEqual([45, 90, 135]);
    expect(r.polar!.speed[1]).toEqual([5, 7]);
    expect(r.polar!.importedFrom).toBe('generic');
  });

  it('parses a PredictWind grid with a blank corner cell', () => {
    const text = ',6,10\n45,4,6\n90,5,7';
    const r = parsePolar(text);
    expect(r.ok).toBe(true);
    expect(r.polar!.importedFrom).toBe('predictwind');
    expect(r.polar!.tws).toEqual([6, 10]);
  });

  it('ignores comment lines', () => {
    const text = '! my polar\nTWA\\TWS,8,12\n50,4,6\n100,5,7';
    const r = parsePolar(text);
    expect(r.ok).toBe(true);
    expect(r.polar!.tws).toEqual([8, 12]);
  });
});

describe('parsePolar — Expedition/ORC curve format', () => {
  it('parses one line per wind speed with angle/speed pairs', () => {
    const text = '6 0 0 45 4 90 5 135 4.5 180 3\n10 0 0 45 6 90 7 135 6.5 180 4';
    const r = parsePolar(text);
    expect(r.ok).toBe(true);
    expect(r.polar!.importedFrom).toBe('expedition');
    expect(r.polar!.tws).toEqual([6, 10]);
    expect(r.polar!.twa).toEqual([45, 90, 135, 180]);
    // interpolated grid has a value for every (twa, tws)
    expect(r.polar!.speed.length).toBe(4);
    expect(r.polar!.speed[0].length).toBe(2);
  });

  it('computes target angles for an imported polar', () => {
    const r = parsePolar('6 0 0 45 4 90 5 135 4.5 180 3\n10 0 0 45 6 90 7 135 6.5 180 4');
    expect(r.polar!.targets.beatAngle.length).toBe(2);
  });
});

describe('parsePolar — failures', () => {
  it('returns an error for unparseable text', () => {
    expect(parsePolar('hello world').ok).toBe(false);
    expect(parsePolar('').ok).toBe(false);
  });
});

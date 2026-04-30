import { describe, expect, it } from 'vitest';
import { parseImageAnalysis, parseScorecard } from '../parseAlliAnalysis';

describe('parseImageAnalysis', () => {
  it('parses valid JSON string into ImageAnalysis', () => {
    const raw = JSON.stringify({
      text: ['hello'],
      colors: [{ hexColor: '#fff', imagePercentage: 50 }],
      labels: ['Clothing'],
      objects: ['Person'],
      faces: [],
      links: [],
    });

    const result = parseImageAnalysis(raw);

    expect(result).not.toBeNull();
    expect(result?.colors[0].hexColor).toBe('#fff');
    expect(result?.labels).toEqual(['Clothing']);
  });

  it('returns null for invalid JSON', () => {
    expect(parseImageAnalysis('not json')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseImageAnalysis('')).toBeNull();
  });

  it('defaults missing arrays to empty', () => {
    const raw = JSON.stringify({ colors: [] });
    const result = parseImageAnalysis(raw);

    expect(result).not.toBeNull();
    expect(result?.labels).toEqual([]);
    expect(result?.text).toEqual([]);
    expect(result?.objects).toEqual([]);
  });
});

describe('parseScorecard', () => {
  it('converts string "false" to boolean false', () => {
    const result = parseScorecard({
      brand_visuals: 'false',
      call_to_action_text: 'true',
      fatigue_status: 'null',
      ctr: 'null',
      cpm: 'null',
    });

    expect(result.brandVisuals).toBe(false);
    expect(result.callToActionText).toBe(true);
  });

  it('converts string "null" to null', () => {
    const result = parseScorecard({
      brand_visuals: 'false',
      call_to_action_text: 'false',
      fatigue_status: 'null',
      ctr: 'null',
      cpm: 'null',
    });

    expect(result.fatigueStatus).toBeNull();
    expect(result.ctr).toBeNull();
    expect(result.cpm).toBeNull();
  });

  it('parses numeric strings to numbers', () => {
    const result = parseScorecard({
      brand_visuals: 'true',
      call_to_action_text: 'false',
      fatigue_status: 'active',
      ctr: '1.03',
      cpm: '4.68',
    });

    expect(result.ctr).toBe(1.03);
    expect(result.cpm).toBe(4.68);
    expect(result.fatigueStatus).toBe('active');
  });
});

import { describe, expect, it } from 'vitest';
import type { ImageAnalysis, ScorecardData } from '../../types';
import { buildRecommendations } from '../buildRecommendations';

const mockAnalysis: ImageAnalysis = {
  colors: [
    { hexColor: '#ddc1a4', imagePercentage: 22.7 },
    { hexColor: '#faf9f8', imagePercentage: 35.9 },
    { hexColor: '#3e2e1a', imagePercentage: 8.4 },
  ],
  labels: ['Fashion', 'Jacket', 'Denim'],
  objects: ['Person', 'Outerwear'],
  text: ['ralphlauren', 'Shop now'],
  faces: [],
  links: [],
};

const mockScorecard: ScorecardData = {
  brandVisuals: false,
  callToActionText: false,
  fatigueStatus: null,
  ctr: null,
  cpm: null,
};

describe('buildRecommendations', () => {
  it('returns exactly 3 recommendations', () => {
    const recs = buildRecommendations(mockAnalysis, mockScorecard, ['#0C69EA']);
    expect(recs).toHaveLength(3);
  });

  it('sets isTopRecommendation on exactly one rec', () => {
    const recs = buildRecommendations(mockAnalysis, mockScorecard, ['#0C69EA']);
    const top = recs.filter((recommendation) => recommendation.isTopRecommendation);

    expect(top).toHaveLength(1);
    expect(top[0].category).toBe('visuals-background');
  });

  it('includes dominant colors as data chips on background rec', () => {
    const recs = buildRecommendations(mockAnalysis, mockScorecard, ['#0C69EA']);
    const bgRec = recs.find((recommendation) => recommendation.category === 'visuals-background');

    expect(bgRec?.dataChips).toContain('#ddc1a4');
  });

  it('handles empty brand colors gracefully', () => {
    const recs = buildRecommendations(mockAnalysis, mockScorecard, []);
    const bgRec = recs.find((recommendation) => recommendation.category === 'visuals-background');

    expect(bgRec?.description).not.toContain('undefined');
  });

  it('changes hero-text title when CTA is detected', () => {
    const withCta = { ...mockScorecard, callToActionText: true };
    const recs = buildRecommendations(mockAnalysis, withCta, []);
    const heroRec = recs.find((recommendation) => recommendation.category === 'hero-text');

    expect(heroRec?.title).toBe('CTA Detected');
  });

  it('changes brand-alignment title when brand visuals present', () => {
    const withBrand = { ...mockScorecard, brandVisuals: true };
    const recs = buildRecommendations(mockAnalysis, withBrand, []);
    const brandRec = recs.find((recommendation) => recommendation.category === 'brand-alignment');

    expect(brandRec?.title).toBe('Brand Visuals Present');
  });
});

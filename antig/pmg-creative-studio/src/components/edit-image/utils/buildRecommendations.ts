import type { CreativeRecommendation, ImageAnalysis, ScorecardData } from '../types';

export function buildRecommendations(
  analysis: ImageAnalysis,
  scorecard: ScorecardData,
  brandColors: string[],
): CreativeRecommendation[] {
  const dominantColors = analysis.colors.slice(0, 2).map((color) => color.hexColor);
  const brandSnippet = brandColors.length
    ? `Your brand palette includes ${brandColors.slice(0, 2).join(', ')}. Consider aligning the background.`
    : '';

  return [
    {
      category: 'visuals-background',
      title: 'Background Opportunity',
      description: `Dominant colors are ${dominantColors.join(', ')}. ${brandSnippet}`.trim(),
      confidence: 'medium',
      dataChips: analysis.colors.slice(0, 3).map((color) => color.hexColor),
      actionType: 'background',
      isTopRecommendation: true,
    },
    {
      category: 'hero-text',
      title: scorecard.callToActionText ? 'CTA Detected' : 'Missing Call-to-Action',
      description: scorecard.callToActionText
        ? `Your image includes text: "${analysis.text.slice(0, 5).join(', ')}". Consider whether it aligns with campaign goals.`
        : 'No call-to-action text detected. Adding a CTA could improve engagement.',
      confidence: 'medium',
      dataChips: analysis.text.slice(0, 3),
      actionType: 'text',
      isTopRecommendation: false,
    },
    {
      category: 'brand-alignment',
      title: scorecard.brandVisuals ? 'Brand Visuals Present' : 'Brand Visuals Missing',
      description: scorecard.brandVisuals
        ? 'Brand elements are detected in this creative. Maintaining consistency across campaigns.'
        : 'No brand visuals detected. Consider adding brand colors or logo to strengthen recognition.',
      confidence: 'medium',
      dataChips: scorecard.brandVisuals ? ['Brand detected'] : ['No brand elements'],
      actionType: 'colors',
      isTopRecommendation: false,
    },
  ];
}

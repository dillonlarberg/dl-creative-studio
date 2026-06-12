// tools/catalog-wireframes.mjs
// Usage: node tools/catalog-wireframes.mjs
// Reads public/template_examples/social/*.html, extracts known zone IDs,
// prints SOCIAL_WIREFRAMES and WIREFRAME_CATALOG entries ready to paste into
// src/constants/useCases.ts.

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIREFRAMES_DIR = resolve(__dirname, '../public/template_examples/social');

// All known zone target IDs from FIELD_ID_MAP in injectIntoHtml.ts
const KNOWN_TARGETS = new Set([
  // image fields
  'image1', 'image_1', 'singe-image-1', 'image_1_single', 'double_image_1',
  'image_1_double', 'main-image', 'image_3', 'image2', 'image_2',
  'double_image_2', 'image_2_double', 'background-image', 'image_background',
  'background_image', 'bg', 'background_asset', 'background_test', 'background',
  'logo', 'logo_1', 'logo_2', 'fbg-logo',
  // text fields
  'headline', 'headline1', 'headline2', 'headline_1', 'headline_2',
  'tag', 'callout', 'promo', 'label', 'cta', 'price', 'price-note',
  'callout_text', 'tag_callout', 'promo_label', 'callout-container',
  'left-bar',
]);

// IDs that are structural containers — skip even if they match known targets
const SKIP_IDS = new Set(['ad', 'base', 'background', 'bg', 'body', 'ad-container', 'wrapper']);

// Already-catalogued file names — we print these too for reference but mark as existing
const CATALOGUED_FILES = new Set([
  'original_1_copy.html', 'minimalist_frame.html', 'bold_typography.html',
  'interior_split.html', 'modern_reveal.html', 'organic_shapes.html',
  'editorial_spotlight.html', 'featured_collection.html', 'clean_showcase.html',
  'dual_focus.html', 'vibrant_pulse_a.html', 'vibrant_pulse_b.html',
  'mosaic_narrative.html', 'techno_vibe_a.html', 'techno_vibe_b.html',
]);

function extractIds(html) {
  const ids = new Set();
  const regex = /\sid="([^"]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1].trim();
    if (KNOWN_TARGETS.has(id) && !SKIP_IDS.has(id)) ids.add(id);
  }
  return [...ids].sort();
}

function toIdSlug(filename) {
  return filename.replace('.html', '').replace(/_copy$/, '').replace(/-/g, '_');
}

function deriveAdSize(html) {
  // Look for width/height in the GWD meta or body style
  const m = html.match(/width[:\s]*(\d{3,4})px/i);
  return m ? parseInt(m[1]) : 1024;
}

function countType(slots, type) {
  if (type === 'image') {
    return slots.filter(s =>
      s.includes('image') || s.includes('background') || s === 'logo' || s === 'bg'
    ).length;
  }
  return slots.filter(s =>
    ['headline', 'headline1', 'headline2', 'callout', 'promo', 'label', 'tag', 'cta', 'price'].includes(s)
  ).length;
}

const files = readdirSync(WIREFRAMES_DIR).filter(f => f.endsWith('.html')).sort();
const newFiles = files.filter(f => !CATALOGUED_FILES.has(f));

console.log(`\n=== REVIEW TABLE (${newFiles.length} new files) ===\n`);
console.log('File'.padEnd(40), 'Detected zone IDs');
console.log('-'.repeat(80));

const socialEntries = [];
const catalogEntries = [];

for (const file of newFiles) {
  const html = readFileSync(resolve(WIREFRAMES_DIR, file), 'utf-8');
  const slots = extractIds(html);
  const adSize = deriveAdSize(html);
  const slug = toIdSlug(file);
  const hasLogo = slots.some(s => s.startsWith('logo') || s === 'fbg-logo');
  const hasBg = slots.some(s => s.includes('background') || s === 'bg');
  const hasCTA = slots.includes('cta');
  const hasPrice = slots.includes('price') || slots.includes('price-note');
  const imgCount = slots.filter(s => s.includes('image') || s.includes('double_image')).length;
  const txtCount = countType(slots, 'text');

  console.log(file.padEnd(40), slots.join(', ') || '(none found)');

  const minReqs = [
    hasLogo ? "'Logo'" : null,
    imgCount > 0 ? "'Image'" : null,
    slots.includes('headline') || slots.includes('headline1') ? "'Headline'" : null,
  ].filter(Boolean).join(', ');

  socialEntries.push(
    `  { id: '${slug}', name: '${slug}', file: '${file}', adSize: ${adSize}, minRequirements: [${minReqs}] },`
  );

  catalogEntries.push(`  {
    id: '${slug}',
    name: 'TODO: Give a human-readable name',
    file: '${file}',
    adSize: ${adSize},
    slots: [${slots.map(s => `'${s}'`).join(', ')}],
    description: 'TODO: One sentence describing the layout.',
    bestFor: 'TODO: When to use this wireframe.',
    elementTypes: { image: ${imgCount}, text: ${txtCount}, hasLogo: ${hasLogo}, hasBackground: ${hasBg}, hasCTA: ${hasCTA}, hasPrice: ${hasPrice} },
  },`);
}

console.log('\n=== PASTE INTO SOCIAL_WIREFRAMES ===\n');
socialEntries.forEach(e => console.log(e));

console.log('\n=== PASTE INTO WIREFRAME_CATALOG ===\n');
catalogEntries.forEach(e => console.log(e));

console.log(`\nDone. ${newFiles.length} new entries. Update TODO fields in WIREFRAME_CATALOG before committing.`);

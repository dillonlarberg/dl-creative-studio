import type { ClientAssetHouse } from '../../../services/clientAssetHouse';

/** Extract brand color hex strings from ClientAssetHouse. Returns empty array if no data. */
export function extractBrandColors(assetHouse: ClientAssetHouse | null): string[] {
  if (!assetHouse) {
    return [];
  }

  const colors: string[] = [];

  if (assetHouse.primaryColor) {
    colors.push(assetHouse.primaryColor);
  }

  for (const variable of assetHouse.variables || []) {
    if (variable.type === 'color' && variable.value) {
      colors.push(variable.value);
    }
  }

  for (const asset of assetHouse.assets || []) {
    if (asset.type === 'color' && asset.value) {
      colors.push(asset.value);
    }
  }

  return colors;
}

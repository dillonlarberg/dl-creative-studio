declare module 'magic-wand-tool' {
  interface MagicWandImage {
    data: Uint8Array;
    width: number;
    height: number;
    bytes: number;
  }

  interface MagicWandMask {
    data: Uint8Array;
    width: number;
    height: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  }

  const MagicWand: {
    floodFill(
      image: MagicWandImage,
      x: number,
      y: number,
      threshold: number,
      oldMask?: Uint8Array | null,
      returnMask?: boolean,
    ): MagicWandMask | null;

    gaussBlurOnlyBorder(
      mask: MagicWandMask,
      radius: number,
      oldMask?: Uint8Array | null,
    ): MagicWandMask;

    getBorderIndices(mask: MagicWandMask): number[];

    traceContours(
      mask: MagicWandMask,
    ): Array<{
      inner: boolean;
      points: Array<{ x: number; y: number }>;
    }>;

    simplifyContours(
      contours: Array<{
        inner: boolean;
        points: Array<{ x: number; y: number }>;
      }>,
      tolerant: number,
      count: number,
    ): Array<{
      inner: boolean;
      points: Array<{ x: number; y: number }>;
    }>;
  };

  export default MagicWand;
}

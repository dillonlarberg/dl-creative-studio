interface DimensionPreviewProps {
  width: number;
  height: number;
  maxSize?: number;
}

export default function DimensionPreview({ width, height, maxSize = 40 }: DimensionPreviewProps) {
  const ratio = width / height;
  let w: number, h: number;
  if (ratio >= 1) {
    w = maxSize;
    h = Math.max(4, Math.round(maxSize / ratio));
  } else {
    h = maxSize;
    w = Math.max(4, Math.round(maxSize * ratio));
  }

  return (
    <div
      className="shrink-0 rounded-sm border border-blue-300 bg-blue-100"
      style={{ width: w, height: h }}
      aria-hidden="true"
    />
  );
}

import { useMemo } from 'react';

interface HasDimensions {
  id: string;
  width: number;
  height: number;
}

interface MasonryGridProps<T extends HasDimensions> {
  items: T[];
  numCols: number;
  renderItem: (item: T) => React.ReactNode;
}

function distributeColumns<T extends HasDimensions>(items: T[], numCols: number): T[][] {
  const cols = Array.from({ length: numCols }, (): T[] => []);
  const heights = new Array<number>(numCols).fill(0);
  for (const item of items) {
    const ratio = item.width > 0 ? item.height / item.width : 1;
    let shortest = 0;
    for (let i = 1; i < numCols; i++) {
      if (heights[i] < heights[shortest]) shortest = i;
    }
    cols[shortest].push(item);
    heights[shortest] += ratio + 0.08; // 0.08 accounts for gap
  }
  return cols;
}

export default function MasonryGrid<T extends HasDimensions>({
  items,
  numCols,
  renderItem,
}: MasonryGridProps<T>) {
  const columns = useMemo(() => distributeColumns(items, numCols), [items, numCols]);

  return (
    <div className="flex w-full gap-3">
      {columns.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-3">
          {col.map(item => renderItem(item))}
        </div>
      ))}
    </div>
  );
}

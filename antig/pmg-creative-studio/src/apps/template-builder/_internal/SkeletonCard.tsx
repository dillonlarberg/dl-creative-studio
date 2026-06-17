export function SkeletonCard() {
  return (
    <div className="rounded-2xl border-2 border-gray-100 p-4 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-5 w-12 bg-gray-100 rounded-full" />
      </div>
      <div className="h-2.5 w-full bg-gray-100 rounded" />
      <div className="h-2.5 w-3/4 bg-gray-100 rounded" />
    </div>
  );
}
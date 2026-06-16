export function TemplateCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden animate-pulse">
      <div className="bg-gray-100" style={{ height: '190px' }} />
      <div className="p-5 space-y-3">
        <div className="flex justify-between gap-2">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-5 bg-gray-100 rounded-full w-14" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    </div>
  );
}

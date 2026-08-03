interface Props {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalItems,
  pageSize,
  onPageChange,
}: Props) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  // Build visible page numbers
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    if (page > 2) pages.push("...");
    for (
      let i = Math.max(1, page - 1);
      i <= Math.min(totalPages - 2, page + 1);
      i++
    ) {
      pages.push(i);
    }
    if (page < totalPages - 3) pages.push("...");
    pages.push(totalPages - 1);
  }

  return (
    <div className="flex items-center justify-between pt-2 text-xs text-txt-tertiary">
      <span>
        {start}–{end} of {totalItems}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="page-btn disabled:opacity-30"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span
              key={`dots-${i}`}
              className="px-1 text-txt-tertiary"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`page-btn ${p === page ? "page-btn-active" : ""}`}
            >
              {p + 1}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="page-btn disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  );
}

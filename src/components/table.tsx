"use client";
import { useState, type ReactNode } from "react";
import {
  Search,
  Columns3,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowDownUp,
} from "lucide-react";
import Link from "next/link";
import { csvCell } from "@/lib/policy";
export type Column<T> = {
  key: string;
  label: string;
  value: (row: T) => string;
  render?: (row: T) => ReactNode;
};
export type ServerPagination = {
  page: number;
  pageSize: number;
  total: number;
  previousHref?: string;
  nextHref?: string;
};
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  name,
  filter,
  actions,
  exportAllowed = true,
  sample = true,
  initialSort,
  onOpen,
  serverPagination,
}: {
  rows: T[];
  columns: Column<T>[];
  name: string;
  filter?: ReactNode;
  actions?: ReactNode;
  exportAllowed?: boolean;
  sample?: boolean;
  initialSort?: string;
  onOpen?: (row: T) => void;
  serverPagination?: ServerPagination;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort ?? columns[0].key);
  const [descending, setDescending] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const visible = columns.filter((c) => !hidden.includes(c.key));
  const matched = rows.filter((row) =>
    columns.some((c) =>
      c.value(row).toLowerCase().includes(query.toLowerCase()),
    ),
  );
  const sortColumn = columns.find((c) => c.key === sort) ?? columns[0];
  const ordered = [...matched].sort(
    (a, b) =>
      sortColumn
        .value(a)
        .localeCompare(sortColumn.value(b), undefined, { numeric: true }) *
      (descending ? -1 : 1),
  );
  const pageSize = serverPagination?.pageSize ?? 10;
  const pageCount = serverPagination
    ? Math.max(1, Math.ceil(serverPagination.total / pageSize))
    : Math.max(1, Math.ceil(ordered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = serverPagination
    ? ordered
    : ordered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  function exportCsv() {
    const text =
      "\uFEFF" +
      [
        visible.map((c) => csvCell(c.label)).join(","),
        ...ordered.map((row) =>
          visible.map((c) => csvCell(c.value(row))).join(","),
        ),
      ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `EVERSHINE-${sample ? "sample-" : ""}${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="table-panel">
      <div className="table-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label={`Search ${name}`}
            placeholder="Search…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        {filter}
        <div className="toolbar-spacer" />
        <label className="sort-select">
          <ArrowDownUp size={15} />
          <select
            aria-label={`Sort ${name}`}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button
          title="Reverse sort order"
          aria-label="Reverse sort order"
          onClick={() => setDescending(!descending)}
        >
          {descending ? "↓" : "↑"}
        </button>
        <details className="column-menu">
          <summary aria-label="Columns">
            <Columns3 size={15} />
            <span>Columns</span>
          </summary>
          <div>
            {columns.map((c) => (
              <label key={c.key}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(c.key)}
                  disabled={!hidden.includes(c.key) && visible.length === 1}
                  onChange={() =>
                    setHidden((h) =>
                      h.includes(c.key)
                        ? h.filter((k) => k !== c.key)
                        : [...h, c.key],
                    )
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </details>
        {exportAllowed ? (
          <button onClick={exportCsv}>
            <Download size={15} /> {serverPagination ? "Export page CSV" : "Export CSV"}
          </button>
        ) : null}
        {actions}
      </div>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">
            {name}
            {sample ? " — sample records" : ""}
          </caption>
          <thead>
            <tr>
              {visible.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              {onOpen ? (
                <th scope="col">
                  <span className="sr-only">Open record</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={row.id}>
                {visible.map((c, index) => (
                  <td key={c.key}>
                    {index === 0 && onOpen ? (
                      <button
                        className="text-button row-link"
                        onClick={() => onOpen(row)}
                      >
                        {c.render ? c.render(row) : c.value(row)}
                      </button>
                    ) : c.render ? (
                      c.render(row)
                    ) : (
                      c.value(row)
                    )}
                  </td>
                ))}
                {onOpen ? (
                  <td className="row-action">
                    <button
                      className="text-button"
                      aria-label={`Open ${columns[0].value(row)}`}
                      onClick={() => onOpen(row)}
                    >
                      View <ChevronRight size={14} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {!slice.length ? (
              <tr>
                <td
                  colSpan={visible.length + (onOpen ? 1 : 0)}
                  className="empty-cell"
                >
                  {query
                    ? "No records match your search."
                    : "No records in this view."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          {serverPagination
            ? serverPagination.total
              ? (serverPagination.page - 1) * pageSize + 1
              : 0
            : ordered.length
              ? currentPage * pageSize + 1
              : 0}
          –
          {serverPagination
            ? Math.min(
                serverPagination.page * pageSize,
                serverPagination.total,
              )
            : Math.min((currentPage + 1) * pageSize, ordered.length)} of {serverPagination?.total ?? ordered.length}
        </span>
        <div>
          {serverPagination ? (
            serverPagination.previousHref ? (
              <Link href={serverPagination.previousHref} aria-label="Previous page">
                <ChevronLeft size={15} />
              </Link>
            ) : (
              <button aria-label="Previous page" disabled>
                <ChevronLeft size={15} />
              </button>
            )
          ) : (
            <button
              aria-label="Previous page"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={15} />
            </button>
          )}
          <span>
            {serverPagination?.page ?? currentPage + 1} / {pageCount}
          </span>
          {serverPagination ? (
            serverPagination.nextHref ? (
              <Link href={serverPagination.nextHref} aria-label="Next page">
                <ChevronRight size={15} />
              </Link>
            ) : (
              <button aria-label="Next page" disabled>
                <ChevronRight size={15} />
              </button>
            )
          ) : (
            <button
              aria-label="Next page"
              disabled={currentPage + 1 >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

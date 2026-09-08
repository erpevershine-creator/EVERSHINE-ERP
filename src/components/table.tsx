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
import { csvCell } from "@/lib/policy";
export type Column<T> = {
  key: string;
  label: string;
  value: (row: T) => string;
  render?: (row: T) => ReactNode;
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
  const pageCount = Math.max(1, Math.ceil(ordered.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = ordered.slice(currentPage * 10, (currentPage + 1) * 10);
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
            <Download size={15} /> Export CSV
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
          {ordered.length ? currentPage * 10 + 1 : 0}–
          {Math.min((currentPage + 1) * 10, ordered.length)} of {ordered.length}
        </span>
        <div>
          <button
            aria-label="Previous page"
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            {currentPage + 1} / {pageCount}
          </span>
          <button
            aria-label="Next page"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

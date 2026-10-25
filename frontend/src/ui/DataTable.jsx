import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';
import Button from './Button';

/**
 * DataTable with sticky headers, sorting, accessible semantics,
 * and mobile card fallback.
 */
export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  loading = false,
  emptyTitle = 'No data available',
  emptyDescription = 'There are no records to display.',
  emptyAction,
  onRowClick,
  pageSize = 10,
  className = ''
}) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);

  const handleSort = (field) => {
    if (!field) return;
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortField(null);
        setSortDir('asc');
      }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortField) return data;
    return [...data].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      const res = valA < valB ? -1 : 1;
      return sortDir === 'asc' ? res : -res;
    });
  }, [data, sortField, sortDir]);

  const totalPages = Math.ceil((sortedData.length || 1) / pageSize);
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  if (loading) {
    return (
      <div className="table-wrapper responsive-table" style={{ padding: 16 }}>
        <Skeleton rows={6} height={28} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="table-wrapper responsive-table">
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyAction?.label}
          onAction={emptyAction?.onClick}
        />
      </div>
    );
  }

  return (
    <div className={`table-wrapper responsive-table ${className}`.trim()}>
      <table className="data-table" role="table">
        <thead>
          <tr role="row">
            {columns.map((col, idx) => {
              const isSortable = !!col.sortKey || (!!col.accessor && typeof col.accessor === 'string');
              const key = col.sortKey || col.accessor;
              const isSorted = sortField === key;

              return (
                <th
                  key={idx}
                  scope="col"
                  className={isSortable ? 'sortable' : ''}
                  onClick={isSortable ? () => handleSort(key) : undefined}
                  tabIndex={isSortable ? 0 : undefined}
                  onKeyDown={
                    isSortable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSort(key);
                          }
                        }
                      : undefined
                  }
                  style={{ width: col.width, textAlign: col.align || 'left' }}
                  aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span>{col.header}</span>
                    {isSortable && (
                      <span aria-hidden="true">
                        {isSorted ? (
                          sortDir === 'asc' ? (
                            <ArrowUp size={14} />
                          ) : (
                            <ArrowDown size={14} />
                          )
                        ) : (
                          <ArrowUpDown size={13} style={{ opacity: 0.4 }} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {paginatedData.map((row, rowIdx) => {
            const key = row[keyField] ?? rowIdx;
            return (
              <tr
                key={key}
                className="table-row-animate"
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  animationDelay: `${Math.min(rowIdx * 25, 300)}ms`
                }}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter') {
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((col, colIdx) => {
                  let cellContent;
                  if (typeof col.render === 'function') {
                    cellContent = col.render(row);
                  } else if (typeof col.accessor === 'function') {
                    cellContent = col.accessor(row);
                  } else if (typeof col.accessor === 'string') {
                    cellContent = row[col.accessor];
                  }

                  return (
                    <td
                      key={colIdx}
                      data-label={col.header}
                      style={{ textAlign: col.align || 'left' }}
                      className={col.className || ''}
                    >
                      {cellContent ?? '-'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {sortedData.length > pageSize && (
        <div className="table-pagination">
          <span>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, sortedData.length)} of {sortedData.length} records
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 12 }}>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


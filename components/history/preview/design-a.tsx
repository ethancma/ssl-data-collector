"use client";

import { ALL_COLUMNS } from "./logic";
import { useHistoryPreview } from "./use-history-preview";
import { DesignSwitcher, FilterBar, HistoryHeader, HistoryTable, RowDetail } from "./ui";

const columnsFor = () => ALL_COLUMNS;

// Design A: one ledger of every dataset with a single set of filters.
export default function DesignA() {
  const h = useHistoryPreview(columnsFor);
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8">
    <DesignSwitcher current="a" />
    <HistoryHeader h={h} />
    <FilterBar h={h} dataset="pills" />
    <HistoryTable h={h} columns={h.columns} />
    <RowDetail h={h} />
  </div>;
}

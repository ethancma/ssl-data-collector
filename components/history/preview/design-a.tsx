"use client";

import { columnsForDataset } from "./logic";
import { useHistoryPreview } from "./use-history-preview";
import { DesignSwitcher, FilterBar, HistoryHeader, HistoryTable, RowDetail } from "./ui";

// Design A: one ledger with a dataset combobox; each dataset shows all of its own columns.
export default function DesignA() {
  const h = useHistoryPreview(columnsForDataset);
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8">
    <DesignSwitcher current="a" />
    <HistoryHeader h={h} />
    <FilterBar h={h} dataset="select" />
    <HistoryTable h={h} columns={h.columns} />
    <RowDetail h={h} />
  </div>;
}

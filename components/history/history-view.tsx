"use client";

import { columnsForDataset } from "./logic";
import { useHistoryPreview } from "./use-history-preview";
import { FilterBar, HistoryHeader, HistorySampleNote, HistoryTable, RowDetail } from "./ui";

export default function HistoryView() {
  const h = useHistoryPreview(columnsForDataset);
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8">
    <HistoryHeader h={h} />
    <FilterBar h={h} />
    <HistoryTable h={h} columns={h.columns} />
    <HistorySampleNote />
    <RowDetail h={h} />
  </div>;
}

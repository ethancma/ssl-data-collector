"use client";

import { FilterBar, HistoryHeader, HistoryTable, RowDetail } from "./ui";
import { useHistory, type HistoryData } from "./use-history";

export default function HistoryView({ data }: { data: HistoryData }) {
  const h = useHistory(data);
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8">
    <HistoryHeader h={h} />
    <FilterBar h={h} />
    <HistoryTable h={h} />
    <RowDetail h={h} />
  </div>;
}

"use client";

import { Segmented } from "@/components/iseau/shared";
import { columnsForDataset } from "./logic";
import { DATASETS, DATASET_LABELS } from "./mock-rows";
import { useHistoryPreview } from "./use-history-preview";
import { DesignSwitcher, FilterBar, HistoryHeader, HistoryTable, RowDetail } from "./ui";

// Design B: a tab per dataset, each with its own typed columns. Out-of-range water readings are coloured.
export default function DesignB() {
  const h = useHistoryPreview(columnsForDataset);
  const total = DATASETS.reduce((sum, dataset) => sum + h.counts[dataset], 0);
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8">
    <DesignSwitcher current="b" />
    <HistoryHeader h={h} />
    <Segmented label="Dataset" value={h.filters.dataset} onChange={(value) => h.update({ dataset: value, sort: null, dir: null })}
      options={[{ value: "all", label: `All (${total.toLocaleString()})` }, ...DATASETS.map((value) => ({ value, label: `${DATASET_LABELS[value]} (${h.counts[value].toLocaleString()})` }))]} />
    <FilterBar h={h} dataset="none" />
    <HistoryTable h={h} columns={h.columns} />
    <RowDetail h={h} />
  </div>;
}

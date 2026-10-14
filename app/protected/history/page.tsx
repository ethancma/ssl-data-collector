import { Suspense } from "react";

import HistoryView from "@/components/history/history-view";

export default function HistoryPage() {
  return <Suspense><HistoryView /></Suspense>;
}

import { notFound } from "next/navigation";
import ISeaUPreview from "@/components/iseau/iseau-preview";

export default async function ISeaUDesignPage({ params }: { params: Promise<{ design: string }> }) {
  const { design } = await params;
  if (!["1", "2", "3", "4", "5"].includes(design)) notFound();
  return <ISeaUPreview design={Number(design)} />;
}
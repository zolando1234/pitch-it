import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { CameraRecordScreen } from "@/components/pitch/camera-record-screen";
import { requireUser } from "@/lib/auth/session";
import { getPitchBalance } from "@/lib/db/pitch-wallet";
import { loadPitchSetup } from "@/lib/pitch/setup";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "en" ? "Recording" : "Nahrávanie" };
}

export default async function RecordPage({ searchParams }: PageProps<"/app/nahravka">) {
  const user = await requireUser("/app/nahravka");
  const [{ setup }, balance, params] = await Promise.all([loadPitchSetup(user.id), getPitchBalance(user.id), searchParams]);
  return <CameraRecordScreen setup={setup} balance={balance} paid={params.platba === "ok"} feedbackHref="/app/nahravka/{id}" />;
}

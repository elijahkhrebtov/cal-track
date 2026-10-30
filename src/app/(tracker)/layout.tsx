import { Suspense } from "react";
import TrackerApp from "@/components/tracker-app";

export default function TrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <TrackerApp />
      {children}
    </Suspense>
  );
}

import type { ReactNode } from "react";
import MuseumNavDock from "./MuseumNavDock";

export default function MuseumLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <MuseumNavDock />
    </>
  );
}

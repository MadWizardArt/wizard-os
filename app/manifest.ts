import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wizard OS",
    short_name: "Wizard OS",
    description: "Private business operations console for ventures, work, and recurring income.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1118",
    theme_color: "#0b1118",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}

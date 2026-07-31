import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Výtahy DC — Servisní systém",
    short_name: "Výtahy DC",
    description: "Interní servisní systém pro správu výtahů, poruch a revizí.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#f8fafc",
    lang: "cs",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Přehled",
        short_name: "Přehled",
        url: "/dashboard",
      },
      {
        name: "Poruchy",
        short_name: "Poruchy",
        url: "/faults",
      },
      {
        name: "Servis",
        short_name: "Servis",
        url: "/service",
      },
    ],
  };
}

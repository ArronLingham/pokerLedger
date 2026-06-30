import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Poker Ledger",
    short_name: "Ledger",
    description: "Track your home poker games, balances, and who owes whom.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b0f0c",
    theme_color: "#0b0f0c",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

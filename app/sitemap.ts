import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  // El sistema es privado: no publicamos rutas para indexación.
  return [];
}

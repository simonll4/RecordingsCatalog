import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_CANDIDATES = [
  join(__dirname, "..", "..", "class_catalog.json"),
  join(__dirname, "..", "..", "..", "worker-ai", "models", "class_catalog.json"),
];

function loadClassCatalog(): string[] {
  for (const candidate of CATALOG_CANDIDATES) {
    try {
      const payload = readFileSync(candidate, "utf-8");
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) {
        throw new Error("class_catalog.json debe contener un array");
    }

    const sanitized = parsed
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);

    if (sanitized.length === 0) {
        throw new Error("catálogo vacío");
    }

      return sanitized;
    } catch (error) {
      // Intentar siguiente candidato
      continue;
    }
  }

  const fallback = ["person"];
  console.warn(
    `[classes] No se pudo cargar el catálogo de clases en ${CATALOG_CANDIDATES.join(
      ", "
    )}. Usando fallback ${fallback}`
  );
  return fallback;
}

export const CLASS_CATALOG: string[] = loadClassCatalog();
export const CLASS_SET: Set<string> = new Set(
  CLASS_CATALOG.map((cls) => cls.toLowerCase())
);

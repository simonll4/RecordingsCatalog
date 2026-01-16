import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Overrides } from "./types.js";

const DEFAULT_OVERRIDES: Overrides = {
  classesFilter: [],
};

function ensureDirectory(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class OverridesStore {
  private overrides: Overrides = { ...DEFAULT_OVERRIDES };

  constructor(private readonly filePath: string) {
    this.overrides = this.loadFromDisk();
  }

  get(): Overrides {
    return { ...this.overrides, classesFilter: [...this.overrides.classesFilter] };
  }

  set(overrides: Overrides): void {
    this.overrides = {
      classesFilter: [
        ...new Set(
          overrides.classesFilter
            .map((c) => c.trim().toLowerCase())
            .filter((c) => c.length > 0)
        ),
      ],
    };
    this.persist();
  }

  private loadFromDisk(): Overrides {
    try {
      if (!existsSync(this.filePath)) {
        return { ...DEFAULT_OVERRIDES };
      }

      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray(parsed.classesFilter)
      ) {
        return {
          classesFilter: parsed.classesFilter
            .map((c: unknown) => (typeof c === "string" ? c.trim().toLowerCase() : ""))
            .filter((c: string) => c.length > 0),
        };
      }
      return { ...DEFAULT_OVERRIDES };
    } catch (err) {
      return { ...DEFAULT_OVERRIDES };
    }
  }

  private persist(): void {
    ensureDirectory(this.filePath);
    const payload = JSON.stringify(this.overrides, null, 2);
    writeFileSync(this.filePath, payload, "utf-8");
  }
}

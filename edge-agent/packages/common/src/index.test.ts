import { describe, it, expect } from "vitest";
import { calculateIoU, generateId } from "../src/index";

describe("Common utilities", () => {
  describe("calculateIoU", () => {
    it("should return 0 for non-overlapping boxes", () => {
      const box1 = { x: 0, y: 0, w: 10, h: 10 };
      const box2 = { x: 20, y: 20, w: 10, h: 10 };
      expect(calculateIoU(box1, box2)).toBe(0);
    });

    it("should return 1 for identical boxes", () => {
      const box1 = { x: 0, y: 0, w: 10, h: 10 };
      const box2 = { x: 0, y: 0, w: 10, h: 10 };
      expect(calculateIoU(box1, box2)).toBe(1);
    });

    it("should calculate correct IoU for overlapping boxes", () => {
      const box1 = { x: 0, y: 0, w: 10, h: 10 };
      const box2 = { x: 5, y: 5, w: 10, h: 10 };

      // Intersection: 5x5 = 25
      // Union: 100 + 100 - 25 = 175
      // IoU: 25/175 = 1/7 ≈ 0.143
      const iou = calculateIoU(box1, box2);
      expect(iou).toBeCloseTo(0.143, 3);
    });
  });

  describe("generateId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it("should generate UUID format", () => {
      const id = generateId();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });
  });
});

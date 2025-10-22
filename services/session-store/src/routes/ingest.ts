import type { Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { db } from "../db.js";

const router = Router();

// Configurar multer para recibir archivos en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max (para frames sin comprimir durante desarrollo)
  },
});

const FRAMES_DIR = "/data/frames";

// Inicializar directorio de frames
const initFramesDir = async () => {
  await fs.mkdir(FRAMES_DIR, { recursive: true });
};
initFramesDir().catch(console.error);

// Tipos para el payload
interface MetaPayload {
  sessionId: string;
  seqNo: number;
  captureTs: string;
  detections: Array<{
    trackId: string;
    cls: string;
    conf: number;
    bbox: { x: number; y: number; w: number; h: number };
  }>;
}

// POST /ingest - Recibe frame + metadatos con múltiples detecciones
router.post(
  "/",
  upload.fields([
    { name: "meta", maxCount: 1 },
    { name: "frame", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;

      // Validar que llegaron ambas partes
      if (!files || !files.meta || !files.frame) {
        return res.status(400).json({
          error: "Missing required parts: meta and frame",
        });
      }

      // Parsear metadata
      const metaBuffer = files.meta[0].buffer;
      const metaStr = metaBuffer.toString("utf-8");
      let meta: MetaPayload;

      try {
        meta = JSON.parse(metaStr);
      } catch (err) {
        return res.status(400).json({ error: "Invalid JSON in meta" });
      }

      // Validar campos requeridos
      if (!meta.sessionId || typeof meta.sessionId !== "string") {
        return res.status(400).json({ error: "Missing or invalid sessionId" });
      }

      if (typeof meta.seqNo !== "number") {
        return res.status(400).json({ error: "Missing or invalid seqNo" });
      }

      if (!meta.captureTs || typeof meta.captureTs !== "string") {
        return res.status(400).json({ error: "Missing or invalid captureTs" });
      }

      if (!Array.isArray(meta.detections) || meta.detections.length === 0) {
        return res
          .status(400)
          .json({ error: "Missing or invalid detections array" });
      }

      // Validar cada detección
      for (const det of meta.detections) {
        if (!det.trackId || typeof det.trackId !== "string") {
          return res
            .status(400)
            .json({ error: "Invalid trackId in detection" });
        }
        if (!det.cls || typeof det.cls !== "string") {
          return res.status(400).json({ error: "Invalid cls in detection" });
        }
        if (typeof det.conf !== "number" || det.conf < 0 || det.conf > 1) {
          return res.status(400).json({ error: "Invalid conf in detection" });
        }
        if (
          !det.bbox ||
          typeof det.bbox.x !== "number" ||
          typeof det.bbox.y !== "number" ||
          typeof det.bbox.w !== "number" ||
          typeof det.bbox.h !== "number"
        ) {
          return res.status(400).json({ error: "Invalid bbox in detection" });
        }
      }

      // Frame binario
      const frameBuffer = files.frame[0].buffer;

      // Guardar frame temporalmente
      const tempFramePath = path.join(
        FRAMES_DIR,
        `temp_${meta.sessionId}_${meta.seqNo}.jpg`
      );
      await fs.writeFile(tempFramePath, frameBuffer);

      // Obtener detecciones existentes para esta sesión (una sola query)
      const existingDetections = await db.getDetectionsBySession(
        meta.sessionId
      );
      const existingMap = new Map(
        existingDetections.map((d) => [d.track_id, d])
      );

      // Procesar cada detección
      const results: Array<{
        trackId: string;
        action: "inserted" | "updated" | "skipped";
      }> = [];

      for (const det of meta.detections) {
        const urlFrame = `/frames/${meta.sessionId}_${det.trackId}.jpg`;
        const framePath = path.join(
          FRAMES_DIR,
          `${meta.sessionId}_${det.trackId}.jpg`
        );

        // Verificar si ya existe
        const existingDet = existingMap.get(det.trackId);

        // Intentar UPSERT
        const result = await db.insertDetection({
          sessionId: meta.sessionId,
          trackId: det.trackId,
          cls: det.cls,
          conf: det.conf,
          bbox: det.bbox,
          captureTs: meta.captureTs,
          urlFrame,
        });

        if (!result) {
          results.push({ trackId: det.trackId, action: "skipped" });
          continue;
        }

        // Determinar acción y guardar frame si corresponde
        if (!existingDet) {
          // Primera inserción - siempre guardar frame
          await fs.copyFile(tempFramePath, framePath);
          results.push({ trackId: det.trackId, action: "inserted" });
        } else if (det.conf > existingDet.conf) {
          // Conf mejoró - actualizar frame
          await fs.copyFile(tempFramePath, framePath);
          results.push({ trackId: det.trackId, action: "updated" });
        } else {
          // Conf no mejoró - solo actualizar last_ts (ya hecho en UPSERT)
          results.push({ trackId: det.trackId, action: "skipped" });
        }
      }

      // Borrar frame temporal
      await fs.unlink(tempFramePath).catch(() => {
        /* ignorar errores */
      });

      // Contar acciones
      const inserted = results.filter((r) => r.action === "inserted").length;
      const updated = results.filter((r) => r.action === "updated").length;
      const skipped = results.filter((r) => r.action === "skipped").length;

      res.status(200).json({
        sessionId: meta.sessionId,
        seqNo: meta.seqNo,
        inserted,
        updated,
        skipped,
        total: meta.detections.length,
        results,
      });
    } catch (error: any) {
      console.error("Error in /ingest", error);

      // Backpressure: si el sistema está sobrecargado
      if (error.code === "ENOSPC") {
        return res.status(507).json({ error: "Insufficient storage" });
      }

      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { router as ingestRouter };

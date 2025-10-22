import express from "express";
import { db } from "../db.js";
import { CONFIG } from "../config.js";

const router = express.Router();

// Middleware opcional para validar token de hooks
const validateHookToken = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const hookToken = CONFIG.MEDIAMTX_HOOK_TOKEN;
  if (!hookToken) {
    return next(); // No hay token configurado, permitir acceso
  }

  const providedToken = req.headers["x-hook-token"];
  if (providedToken !== hookToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// POST /hooks/mediamtx/publish
// Se ejecuta cuando un publisher se conecta a MediaMTX
router.post("/mediamtx/publish", validateHookToken, async (req, res) => {
  try {
    const { path, eventTs } = req.body;

    if (!path || !eventTs) {
      return res
        .status(400)
        .json({ error: "Missing required fields: path, eventTs" });
    }

    // Buscar sesión abierta con este path
    const session = await db.findOpenSessionByPath(path);
    if (!session) {
      console.warn(`[hook:publish] No open session found for path: ${path}`);
      return res.status(200).json({ status: "no_session" });
    }

    // Actualizar media_connect_ts si está vacío
    await db.updateMediaConnectTs(session.session_id, eventTs);
    // Establecer un nudge mínimo por defecto para evitar 404 en el primer GOP
    await db.setRecommendedStartOffsetIfNull(session.session_id, 200);

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "hook:publish",
        session_id: session.session_id,
        path,
        eventTs,
      })
    );

    res.json({ status: "ok", session_id: session.session_id });
  } catch (error) {
    console.error("[hook:publish] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /hooks/mediamtx/record/segment/start
// Se ejecuta cuando MediaMTX inicia un segmento de grabación
router.post(
  "/mediamtx/record/segment/start",
  validateHookToken,
  async (req, res) => {
    try {
      const { path, segmentPath, eventTs, segmentStartTs } = req.body;

      if (!path || !segmentStartTs) {
        return res
          .status(400)
          .json({ error: "Missing required fields: path, segmentStartTs" });
      }

      // Buscar sesión abierta con este path
      const session = await db.findOpenSessionByPath(path);
      if (!session) {
        console.warn(
          `[hook:segment_start] No open session found for path: ${path}`
        );
        return res.status(200).json({ status: "no_session" });
      }

      // Actualizar media_start_ts si está vacío (primer segmento)
    await db.updateMediaStartTs(session.session_id, segmentStartTs);
    await db.setRecommendedStartOffsetIfNull(session.session_id, 200);

      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "hook:segment_start",
          session_id: session.session_id,
          path,
          segmentPath,
          segmentStartTs,
        })
      );

      res.json({ status: "ok", session_id: session.session_id });
    } catch (error) {
      console.error("[hook:segment_start] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /hooks/mediamtx/record/segment/complete
// Se ejecuta cuando MediaMTX completa un segmento de grabación
router.post(
  "/mediamtx/record/segment/complete",
  validateHookToken,
  async (req, res) => {
    try {
      const { path, segmentPath, eventTs, segmentStartTs } = req.body;

      if (!path || !segmentStartTs) {
        return res
          .status(400)
          .json({ error: "Missing required fields: path, segmentStartTs" });
      }

      // Buscar sesión abierta con este path
      const session = await db.findOpenSessionByPath(path);
      if (!session) {
        console.warn(
          `[hook:segment_complete] No open session found for path: ${path}`
        );
        return res.status(200).json({ status: "no_session" });
      }

      // Si media_start_ts está vacío, usar este segmento como inicio (fallback)
    await db.updateMediaStartTs(session.session_id, segmentStartTs);
    await db.setRecommendedStartOffsetIfNull(session.session_id, 200);

      // Calcular segmentEndTs: segmentStartTs + recordSegmentDuration
      // Usar duración de 5 minutos (300 segundos) como default
      const recordSegmentDurationSec =
        CONFIG.MEDIAMTX_SEGMENT_DURATION_SEC || 300;
      const segmentStartDate = new Date(segmentStartTs);
      const segmentEndDate = new Date(
        segmentStartDate.getTime() + recordSegmentDurationSec * 1000
      );
      const segmentEndTs = segmentEndDate.toISOString();

      // Actualizar media_end_ts al máximo entre el actual y este nuevo
      await db.updateMediaEndTs(session.session_id, segmentEndTs);

      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          event: "hook:segment_complete",
          session_id: session.session_id,
          path,
          segmentPath,
          segmentStartTs,
          segmentEndTs,
        })
      );

      res.json({ status: "ok", session_id: session.session_id });
    } catch (error) {
      console.error("[hook:segment_complete] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { router as hooksRouter };

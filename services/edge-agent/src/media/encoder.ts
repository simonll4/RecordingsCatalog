/**
 * Detector de encoder H.264 disponible
 * Detecta una vez y cachea el resultado
 */

import { spawn } from "child_process";
import { logger } from "../shared/logging.js";

export type EncoderConfig = {
  element: string;
  extraArgs: string[];
};

let cachedEncoder: EncoderConfig | undefined;

/**
 * Detecta el mejor encoder H.264 disponible en el sistema
 *
 * Prioridad:
 * 1. nvh264enc (NVIDIA NVENC) - GPU encoding
 * 2. vaapih264enc (Intel VA-API) - iGPU encoding
 * 3. x264enc (software) - CPU encoding fallback
 */
export async function detectEncoder(): Promise<EncoderConfig> {
  if (cachedEncoder) {
    return cachedEncoder;
  }

  const encoders = ["nvh264enc", "vaapih264enc", "x264enc"];

  for (const encoder of encoders) {
    if (await testEncoder(encoder)) {
      const config = getEncoderConfig(encoder);
      cachedEncoder = config;
      logger.info(`Encoder detected and cached`, { encoder: config.element });
      return config;
    }
  }

  // Fallback a x264enc si todo falla
  const fallback = getEncoderConfig("x264enc");
  cachedEncoder = fallback;
  logger.warn(`No hardware encoder found, using software fallback`, {
    encoder: fallback.element,
  });
  return fallback;
}

/**
 * Prueba si un encoder está disponible
 */
async function testEncoder(encoder: string): Promise<boolean> {
  return new Promise((resolve) => {
    const base = ["--gst-debug=0", "videotestsrc", "num-buffers=1", "!"];

    const testArgs =
      encoder === "vaapih264enc"
        ? [
            ...base,
            "video/x-raw,format=NV12,width=64,height=64",
            "!",
            "vaapih264enc",
            "bitrate=1000",
            "rate-control=cbr",
            "!",
            "fakesink",
          ]
        : [
            ...base,
            "video/x-raw,width=64,height=64",
            "!",
            encoder,
            "!",
            "fakesink",
          ];

    const proc = spawn("gst-launch-1.0", testArgs, { stdio: "ignore" });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 2000);

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });

    proc.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Obtiene la configuración específica de cada encoder
 */
function getEncoderConfig(encoder: string): EncoderConfig {
  switch (encoder) {
    case "nvh264enc":
      return {
        element: "nvh264enc",
        extraArgs: ["preset=low-latency-hq", "rc-mode=cbr", "gop-size=30"],
      };

    case "vaapih264enc":
      return {
        element: "vaapih264enc",
        extraArgs: ["bitrate=2000", "rate-control=cbr", "keyframe-period=30"],
      };

    case "x264enc":
    default:
      return {
        element: "x264enc",
        extraArgs: [
          "tune=zerolatency",
          "speed-preset=ultrafast",
          "bitrate=2000",
          "key-int-max=30",
        ],
      };
  }
}

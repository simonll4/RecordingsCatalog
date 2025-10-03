// /**
//  * EJEMPLO: Integración Real con YOLO + ONNX Runtime
//  * 
//  * Este archivo muestra cómo sería la implementación real del módulo AI
//  * cuando se integre ONNX Runtime con un modelo YOLO.
//  * 
//  * NO está activo actualmente - se usa ai.ts con simulación.
//  */

// import { emit } from "../infra/bus";
// import * as ort from "onnxruntime-node";

// type OnnxSetup = {
//   modelName: string;
//   umbral: number;
//   height: number;
//   width: number;
//   classNames: string[];
// };

// type Detection = {
//   cls: string;
//   conf: number;
//   bbox: [number, number, number, number];
// };

// export class AIModuleReal {
//   private session!: ort.InferenceSession;
//   private setup!: OnnxSetup;
//   private lastActive = 0;

//   /**
//    * Inicializa el modelo ONNX
//    */
//   async setOnnxModel(
//     modelName: string,
//     umbral: number,
//     height: number,
//     width: number,
//     classNames: string[]
//   ) {
//     this.setup = { modelName, umbral, height, width, classNames };

//     try {
//       // Cargar modelo desde carpeta models/
//       this.session = await ort.InferenceSession.create(`./models/${modelName}`, {
//         executionProviders: ["cpu"], // o ['cuda'] si hay GPU
//         graphOptimizationLevel: "all",
//       });

//       console.log("[AI] ONNX model loaded successfully:", {
//         modelName,
//         inputs: this.session.inputNames,
//         outputs: this.session.outputNames,
//       });
//     } catch (error) {
//       console.error("[AI] Error loading ONNX model:", error);
//       throw error;
//     }
//   }

//   /**
//    * Procesa un frame RGB y detecta objetos
//    * @param frame Buffer RGB (width * height * 3 bytes)
//    * @param classesFilter Clases que consideramos relevantes para activar grabación
//    */
//   async run(frame: Buffer, classesFilter: string[]): Promise<void> {
//     try {
//       // 1. Preprocesar: RGB Buffer → Tensor Float32 normalizado
//       const inputTensor = this.preprocessFrame(frame);

//       // 2. Inferencia
//       const outputs = await this.session.run({ images: inputTensor });

//       // 3. Post-procesamiento: extraer detecciones
//       const detections = this.processYoloOutput(outputs);

//       // 4. Filtrar por clases de interés y umbral
//       const relevant = detections.filter(
//         (d) => d.conf >= this.setup.umbral && classesFilter.includes(d.cls)
//       );

//       // 5. Emitir eventos según relevancia
//       const now = Date.now();

//       if (relevant.length > 0) {
//         // Primera detección relevante en un tiempo
//         if (now - this.lastActive > 1200) {
//           emit({ type: "ai.relevant-start", ts: new Date().toISOString() });
//         }

//         // Keepalive: confirma que sigue detectando
//         emit({ type: "ai.keepalive", ts: new Date().toISOString() });

//         // Enviar todas las detecciones (no solo las relevantes)
//         if (detections.length > 0) {
//           emit({
//             type: "ai.detections",
//             ts: new Date().toISOString(),
//             items: detections,
//           });
//         }

//         this.lastActive = now;
//       }
//       // Si no hay detección relevante, FSM se encarga con timeout
//     } catch (error) {
//       console.error("[AI] Error during inference:", error);
//     }
//   }

//   /**
//    * Preprocesa frame RGB → tensor normalizado
//    */
//   private preprocessFrame(frame: Buffer): ort.Tensor {
//     const { width, height } = this.setup;
//     const size = width * height;

//     // YOLOv8 espera: [1, 3, H, W] con valores [0, 1] o [-1, 1]
//     const float32Data = new Float32Array(3 * size);

//     for (let i = 0; i < size; i++) {
//       // RGB → canales separados, normalizar a [0, 1]
//       float32Data[i] = frame[i * 3] / 255.0; // R
//       float32Data[size + i] = frame[i * 3 + 1] / 255.0; // G
//       float32Data[2 * size + i] = frame[i * 3 + 2] / 255.0; // B
//     }

//     return new ort.Tensor("float32", float32Data, [1, 3, height, width]);
//   }

//   /**
//    * Post-procesa salida de YOLO: NMS, filtrado, formato
//    */
//   private processYoloOutput(outputs: ort.InferenceSession.OnnxValueMapType): Detection[] {
//     // Output típico de YOLOv8: [1, 84, 8400] (o similar)
//     // 84 = 4 bbox coords + 80 clases
//     const output = outputs[this.session.outputNames[0]];
//     const data = output.data as Float32Array;
//     const shape = output.dims; // [1, 84, N]

//     const numClasses = this.setup.classNames.length;
//     const numBoxes = shape[2];
//     const boxes: Detection[] = [];

//     // Extraer detecciones con confianza > umbral
//     for (let i = 0; i < numBoxes; i++) {
//       // YOLO formato: [x_center, y_center, width, height, conf_class0, conf_class1, ...]
//       const x = data[i];
//       const y = data[numBoxes + i];
//       const w = data[2 * numBoxes + i];
//       const h = data[3 * numBoxes + i];

//       // Encontrar clase con mayor confianza
//       let maxConf = 0;
//       let maxClassIdx = 0;

//       for (let c = 0; c < numClasses; c++) {
//         const conf = data[(4 + c) * numBoxes + i];
//         if (conf > maxConf) {
//           maxConf = conf;
//           maxClassIdx = c;
//         }
//       }

//       if (maxConf >= this.setup.umbral) {
//         boxes.push({
//           cls: this.setup.classNames[maxClassIdx] || `class_${maxClassIdx}`,
//           conf: maxConf,
//           bbox: [x, y, w, h],
//         });
//       }
//     }

//     // NMS (Non-Maximum Suppression) para eliminar duplicados
//     return this.applyNMS(boxes, 0.45); // IoU threshold 0.45
//   }

//   /**
//    * Non-Maximum Suppression
//    */
//   private applyNMS(boxes: Detection[], iouThreshold: number): Detection[] {
//     if (boxes.length === 0) return [];

//     // Ordenar por confianza (descendente)
//     boxes.sort((a, b) => b.conf - a.conf);

//     const keep: Detection[] = [];

//     while (boxes.length > 0) {
//       const current = boxes.shift()!;
//       keep.push(current);

//       boxes = boxes.filter((box) => {
//         const iou = this.calculateIoU(current.bbox, box.bbox);
//         return iou < iouThreshold;
//       });
//     }

//     return keep;
//   }

//   /**
//    * Calcula Intersection over Union entre dos bboxes
//    */
//   private calculateIoU(box1: [number, number, number, number], box2: [number, number, number, number]): number {
//     const [x1, y1, w1, h1] = box1;
//     const [x2, y2, w2, h2] = box2;

//     // Convertir de center-format a corners
//     const x1_min = x1 - w1 / 2;
//     const y1_min = y1 - h1 / 2;
//     const x1_max = x1 + w1 / 2;
//     const y1_max = y1 + h1 / 2;

//     const x2_min = x2 - w2 / 2;
//     const y2_min = y2 - h2 / 2;
//     const x2_max = x2 + w2 / 2;
//     const y2_max = y2 + h2 / 2;

//     // Intersección
//     const inter_x_min = Math.max(x1_min, x2_min);
//     const inter_y_min = Math.max(y1_min, y2_min);
//     const inter_x_max = Math.min(x1_max, x2_max);
//     const inter_y_max = Math.min(y1_max, y2_max);

//     const inter_w = Math.max(0, inter_x_max - inter_x_min);
//     const inter_h = Math.max(0, inter_y_max - inter_y_min);
//     const inter_area = inter_w * inter_h;

//     // Unión
//     const box1_area = w1 * h1;
//     const box2_area = w2 * h2;
//     const union_area = box1_area + box2_area - inter_area;

//     return inter_area / union_area;
//   }
// }

// /**
//  * INSTALACIÓN REQUERIDA:
//  * 
//  * npm install onnxruntime-node
//  * 
//  * DESCARGA DEL MODELO:
//  * 
//  * wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx
//  * mkdir -p models && mv yolov8n.onnx models/
//  * 
//  * USO:
//  * 
//  * En main.ts, reemplazar:
//  *   import { AIModule } from "./modules/ai";
//  * por:
//  *   import { AIModuleReal as AIModule } from "./modules/ai-real";
//  */

/**
 * AI Client Port - Interfaz para clientes de inferencia remota
 *
 * Define el contrato para comunicarse con workers de IA (TCP, HTTP, gRPC, etc.).
 * Abstrae el protocolo de transporte y framing del resto del sistema.
 */

/** Parámetros de inicialización que se envían al worker. */
export type InitArgs = {
  modelPath: string;
  width: number;
  height: number;
  conf: number;
  classes?: number[];
};

/** Resultado de inferencia normalizado para consumidores en Node. */
export type Result = {
  seq: number;
  tsIso: string;
  tsMonoNs: bigint;
  detections: Array<{
    cls: string;
    conf: number;
    bbox: [number, number, number, number];
    trackId?: string;
  }>;
};

/** API que expone el cliente para comunicación con el worker de IA. */
export interface AIClient {
  /** Abre el socket/conexión y deja el cliente listo para `init`. */
  connect(): Promise<void>;
  
  /** Envía configuración del modelo. Válido en estado CONNECTED o READY. */
  init(args: InitArgs): Promise<void>;
  
  /** Indica si hay crédito para enviar un frame (backpressure). */
  canSend(): boolean;
  
  /**
   * Encola/envía un frame RGB (pixFmt=RGB). Si no hay crédito,
   * aplica latest-wins y reemplaza el frame pendiente.
   */
  sendFrame(
    seq: number,
    tsIso: string,
    tsMonoNs: bigint,
    w: number,
    h: number,
    rgb: Buffer
  ): void;
  
  /** Suscribe callback para resultados de inferencia. */
  onResult(cb: (r: Result) => void): void;
  
  /** Suscribe callback para errores provenientes del worker/cliente. */
  onError(cb: (err: Error) => void): void;
  
  /** Cierra la conexión notificando shutdown al worker. */
  shutdown(): Promise<void>;
}

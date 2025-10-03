/**
 * Módulo de sincronización de tiempo RTSP
 * 
 * Versión simplificada: Asume que todos los servicios están sincronizados
 * con la misma zona horaria (UTC) mediante:
 * - TZ=UTC en todos los contenedores
 * - /etc/timezone y /etc/localtime montados desde el host
 * - Sincronización NTP habilitada en el host
 * 
 * No se realiza medición de offset ya que confiamos en la sincronización del sistema.
 */

interface RtspOffsetOptions {
  host: string;
  port: number;
  path: string;
  samples?: number;
  maxRttMs?: number;
}

/**
 * Retorna offset de 0 segundos asumiendo sincronización perfecta del sistema
 */
export const measureRtspOffset = async (
  _options: RtspOffsetOptions
): Promise<number> => {
  console.log(
    JSON.stringify({
      event: "rtsp_offset_skipped",
      message: "Confiando en sincronización de TZ del sistema (UTC)",
      offsetSeconds: 0,
    })
  );

  return 0.0;
};

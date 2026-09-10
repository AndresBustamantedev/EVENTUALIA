/**
 * StorageProvider — abstracción de almacenamiento de archivos.
 *
 * Implementación inicial: sistema de ficheros local.
 * La interfaz está diseñada para migrar a S3 sin tocar el código de los módulos.
 *
 * SEGURIDAD:
 * - Las rutas (storageKey) son opacas: nunca incluir DNI, nombre ni datos personales.
 * - El acceso a archivos se comprueba siempre desde el servidor (requirePermission).
 * - Los archivos nunca se exponen con rutas públicas directas.
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const STORAGE_ROOT =
  process.env.STORAGE_LOCAL_PATH ?? "/app/data/documents";

export interface StoredFileInfo {
  storageKey: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Escribe un buffer en el almacenamiento local.
 * Devuelve la clave opaca, el tamaño y el hash SHA-256.
 *
 * @param category Subcarpeta lógica (p.ej. "pdfs/jornada")
 * @param filename Nombre de archivo sugerido (se sanitiza)
 * @param data     Contenido binario
 */
export async function storeFile(
  category: string,
  filename: string,
  data: Buffer
): Promise<StoredFileInfo> {
  // Sanitizar: solo alfanuméricos, guión, punto y barra del category
  const safeCategory = category.replace(/[^a-zA-Z0-9/_-]/g, "");
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  const dir = path.join(STORAGE_ROOT, safeCategory);
  await fs.mkdir(dir, { recursive: true });

  const storageKey = `${safeCategory}/${safeFilename}`;
  const fullPath = path.join(STORAGE_ROOT, storageKey);

  await fs.writeFile(fullPath, data);

  const sha256 = crypto.createHash("sha256").update(data).digest("hex");

  return {
    storageKey,
    sizeBytes: data.length,
    sha256,
  };
}

/**
 * Lee un archivo del almacenamiento local.
 * Verifica que la ruta esté dentro de STORAGE_ROOT (path traversal guard).
 */
export async function readFile(storageKey: string): Promise<Buffer> {
  const fullPath = path.resolve(STORAGE_ROOT, storageKey);

  // Path traversal guard
  if (!fullPath.startsWith(path.resolve(STORAGE_ROOT))) {
    throw new Error("Acceso denegado: ruta fuera del directorio de datos.");
  }

  return fs.readFile(fullPath);
}

/**
 * Elimina un archivo del almacenamiento (soft delete no aplica aquí;
 * el registro en BD usa deleted_at).
 */
export async function deleteFile(storageKey: string): Promise<void> {
  const fullPath = path.resolve(STORAGE_ROOT, storageKey);
  if (!fullPath.startsWith(path.resolve(STORAGE_ROOT))) {
    throw new Error("Acceso denegado: ruta fuera del directorio de datos.");
  }
  await fs.unlink(fullPath).catch(() => {
    // Ignorar si ya no existe
  });
}

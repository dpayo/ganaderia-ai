import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Reduce la foto antes de subirla: en el campo la cobertura es mala y una foto de 12 MP
 * pesa 4-6 MB. A 1600 px el texto del crotal sigue siendo legible para el OCR.
 * También convierte HEIC (iPhone) a JPEG.
 */
export async function prepareForUpload(uri: string, width: number | undefined, maxSide = 1600): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (!width || width > maxSide) ctx.resize({ width: maxSide });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return out.uri;
}

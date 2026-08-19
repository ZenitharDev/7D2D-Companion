import type { ArmorSetData } from '../types.js';
import armorSetsJson from './armorSets.json' with { type: 'json' };

/** Los datos ya vienen tipados por el generador; este loader es el único punto
 * que conoce la ruta del JSON, para poder swappearlo (ej. cargar desde una API
 * o desde un archivo extraído del juego) sin tocar el resto del código. */
export function loadArmorSets(): ArmorSetData[] {
  return armorSetsJson as ArmorSetData[];
}

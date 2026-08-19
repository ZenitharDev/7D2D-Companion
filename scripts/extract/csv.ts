// Parser CSV mínimo (RFC4180-ish) para Localization.txt: comillas, comas
// dentro de comillas, comillas escapadas como "" y saltos de línea dentro
// de campos citados. No usa librerías externas porque es un formato simple
// y controlado.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Última fila si el archivo no termina en salto de línea.
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

/** Convierte Localization.txt (header + filas) en un mapa key -> texto en inglés. */
export function buildLocalizationMap(csvText: string): Map<string, string> {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return new Map();

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const keyIdx = header.indexOf('key');
  const englishIdx = header.indexOf('english');
  if (keyIdx === -1 || englishIdx === -1) {
    throw new Error(
      `Localization.txt: no se encontraron columnas "Key"/"english" en el header (${header.join(', ')}). ¿Cambió el formato del archivo?`,
    );
  }

  const map = new Map<string, string>();
  for (const row of rows.slice(1)) {
    const key = row[keyIdx];
    const value = row[englishIdx];
    if (key) map.set(key, value ?? '');
  }
  return map;
}

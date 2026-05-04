// Web App para Produccion Diaria
// - GET ?mode=ingredientes -> lista de codigos/nombres desde COSTO MATERIA PRIMA
// - GET ?mode=familias -> lista de familias desde hoja FAMILIA
// - POST body { responsable: "...", items: [{ fecha: "YYYY-MM-DD", codigo, ingrediente, familia, cantidad }] } -> agrega filas en PRODUCCION DIARIA
// Columnas destino:
// A=FECHA, B=CODIGO, C=INGREDIENTE
// D=UND PRINCIPAL (no se toca)
// E=FAMILIA
// F=CANTIDAD PRODUCIDA
// G=RESPONSABLE

const SPREADSHEET_ID = "1MQlP9wx199xW-gIYwf4FcjdANG9TLEkSjORiNmxJH5s";
const SOURCE_SHEET = "COSTO MATERIA PRIMA";
const FAMILIA_SHEET = "FAMILIA";
const TARGET_SHEET = "PRODUCCION DIARIA";
const CATALOG_CACHE_KEY = "produccion_diaria_catalog_v3";
const CATALOG_CACHE_TTL_SECONDS = 21600;
const ALLOWED_FAMILIES = ["HOJALDRE", "PANADERIA"];

function doGet(e) {
  const mode = (e && e.parameter && e.parameter.mode) || "";
  if (mode === "catalogo") {
    const catalog = getCatalogData();
    return json({ status: "ok", items: catalog.ingredients, familias: catalog.families });
  }
  if (mode === "ingredientes") {
    const items = getCatalogData().ingredients;
    return json({ status: "ok", items });
  }
  if (mode === "familias") {
    const items = getCatalogData().families;
    return json({ status: "ok", items });
  }
  return json({ status: "ok", message: "Produccion Diaria" });
}

function doOptions() {
  return json({ status: "ok" });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : "{}");
    const items = Array.isArray(body.items) ? body.items : [];
    const responsable = (body.responsable || "").toString().trim();

    if (!responsable) {
      return json({ status: "error", message: "Responsable requerido" }, 400);
    }

    if (!items.length) {
      return json({ status: "error", message: "Sin items" }, 400);
    }

    const ss = getSpreadsheet();
    const target = ss.getSheetByName(TARGET_SHEET) || ss.insertSheet(TARGET_SHEET);

    const catalog = getCatalogData();
    const sourceMap = catalog.sourceMap;
    const familias = catalog.families;
    const rows = items.map((item, idx) => {
      const pos = idx + 1;
      const fecha = parseIsoDate(item.fecha, pos);
      const codigo = (item.codigo || "").trim();
      const ingrediente = (item.ingrediente || sourceMap[codigo] || "").trim();
      const familia = (item.familia || "").trim();
      const cantidad = Number(item.cantidad);

      if (!codigo) {
        throw new Error(`Codigo requerido en fila ${pos}`);
      }
      if (!ingrediente) {
        throw new Error(`Ingrediente no encontrado en fila ${pos}`);
      }
      if (!familia) {
        throw new Error(`Familia requerida en fila ${pos}`);
      }
      if (familias.length && familias.indexOf(familia) === -1) {
        throw new Error(`Familia invalida en fila ${pos}`);
      }
      if (Number.isNaN(cantidad) || cantidad < 0) {
        throw new Error(`Cantidad invalida en fila ${pos}`);
      }

      return { fecha, codigo, ingrediente, familia, cantidad };
    });

    const startRow = target.getLastRow() + 1;

    // A-C: FECHA, CODIGO, INGREDIENTE
    target
      .getRange(startRow, 1, rows.length, 3)
      .setValues(rows.map((r) => [r.fecha, r.codigo, r.ingrediente]));

    // E: FAMILIA
    target.getRange(startRow, 5, rows.length, 1).setValues(rows.map((r) => [r.familia]));

    // F: CANTIDAD PRODUCIDA
    target.getRange(startRow, 6, rows.length, 1).setValues(rows.map((r) => [r.cantidad]));

    // G: RESPONSABLE
    target.getRange(startRow, 7, rows.length, 1).setValues(rows.map(() => [responsable]));

    return json({ status: "ok", message: `Se registraron ${rows.length} fila(s).` });
  } catch (err) {
    return json({ status: "error", message: err.message || "Error" }, 500);
  }
}

function parseIsoDate(value, pos) {
  if (!value) {
    throw new Error(`Fecha requerida en fila ${pos || 1}`);
  }

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }

  throw new Error(`Fecha invalida en fila ${pos || 1}. Usa AAAA-MM-DD.`);
}

function getIngredientes() {
  return getCatalogData().ingredients;
}

function getFamilias() {
  return getCatalogData().families;
}

function buildSourceMap() {
  return getCatalogData().sourceMap;
}

function getCatalogData() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CATALOG_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.ingredients) && Array.isArray(parsed.families)) {
        return parsed;
      }
    } catch (error) {
    }
  }

  const sheet = getSpreadsheet().getSheetByName(SOURCE_SHEET);
  const ingredients = [];
  const seenCodes = {};

  if (sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      values.forEach((row) => {
        const code = (row[0] || "").toString().trim();
        const name = (row[1] || "").toString().trim();

        if (code && name) {
          const upperCode = code.toUpperCase();
          const upperName = name.toUpperCase();
          if (upperCode !== "CODIGO" && upperName !== "ARTICULO" && !seenCodes[code]) {
            seenCodes[code] = true;
            ingredients.push({ code: code, name: name });
          }
        }
      });
    }
  }

  ingredients.sort((a, b) => a.code.localeCompare(b.code));
  const families = getFamiliasDesdeHoja_();

  const sourceMap = ingredients.reduce((acc, item) => {
    acc[item.code] = item.name;
    return acc;
  }, {});

  const payload = { ingredients, families, sourceMap };
  try {
    cache.put(CATALOG_CACHE_KEY, JSON.stringify(payload), CATALOG_CACHE_TTL_SECONDS);
  } catch (error) {
  }

  return payload;
}

function getFamiliasDesdeHoja_() {
  const sheet = getSpreadsheet().getSheetByName(FAMILIA_SHEET);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const seen = {};
  return values
    .map((row) => (row[0] || "").toString().trim().toUpperCase())
    .filter((name) => ALLOWED_FAMILIES.indexOf(name) !== -1)
    .filter((name) => {
      if (seen[name]) return false;
      seen[name] = true;
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActive();
}

function json(payload, code) {
  const out = ContentService.createTextOutput(JSON.stringify(payload));
  out.setMimeType(ContentService.MimeType.JSON);
  if (code) out.setResponseCode(code);
  return out;
}

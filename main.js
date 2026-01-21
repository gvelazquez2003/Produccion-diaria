const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzUA4zYSZXmobasY7L2XY-_rwQoMElA7My82FW6aUEO5Jjvhto0xJL4rwvIsxXlfZZf/exec"; // despliegue Apps Script produccion diaria
const MENU_LINK = "https://menu-ejemplo.vercel.app"; // reemplaza con la URL del menú principal

const form = document.getElementById("production-form");
const statusEl = document.getElementById("status");
const rowsContainer = document.getElementById("rows");
const addRowBtn = document.getElementById("add-row");
const menuLinkEl = document.getElementById("menu-link");
const datalistEl = document.getElementById("ingredientes-list");

menuLinkEl.href = MENU_LINK;

const setStatus = (message, type) => {
  statusEl.textContent = message;
  statusEl.className = `status ${type || ""}`.trim();
};

const todayIso = () => new Date().toISOString().slice(0, 10);

let cachedOptions = [];

const findMatch = (value) => {
  const val = (value || "").trim().toLowerCase();
  if (!val) return null;
  return cachedOptions.find((opt) => {
    const code = (opt.code || "").toLowerCase();
    const name = (opt.name || "").toLowerCase();
    return (
      code === val ||
      name === val ||
      `${code} · ${name}` === val ||
      `${name} · ${code}` === val
    );
  });
};

const renderDatalist = (options) => {
  const unique = [];
  const seen = new Set();
  options.forEach((opt) => {
    if (!opt.code || seen.has(opt.code)) return;
    seen.add(opt.code);
    unique.push(opt);
  });
  datalistEl.innerHTML = unique
    // Mostrar primero el ingrediente y luego el código en las sugerencias
    .map((opt) => `<option value="${opt.name}" label="${opt.name} · ${opt.code}"></option>`)
    .join("");
};

const createRow = () => {
  const row = document.createElement("div");
  row.className = "item-row";

  const inputFecha = document.createElement("input");
  inputFecha.type = "date";
  inputFecha.className = "input";
  inputFecha.required = true;
  inputFecha.value = todayIso();

  const inputIngrediente = document.createElement("input");
  inputIngrediente.name = "ingrediente";
  inputIngrediente.type = "text";
  inputIngrediente.required = true;
  inputIngrediente.placeholder = "Código o nombre";
  inputIngrediente.className = "input";
  inputIngrediente.setAttribute("list", "ingredientes-list");

  const codePill = document.createElement("div");
  codePill.className = "code-pill";
  codePill.textContent = "Código: —";

  const inputCantidad = document.createElement("input");
  inputCantidad.name = "cantidad";
  inputCantidad.type = "number";
  inputCantidad.min = "0";
  inputCantidad.step = "0.01";
  inputCantidad.required = true;
  inputCantidad.placeholder = "0.00";
  inputCantidad.className = "input";
  inputCantidad.inputMode = "decimal";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "✕";
  remove.title = "Eliminar fila";
  remove.addEventListener("click", () => {
    if (rowsContainer.children.length > 1) {
      row.remove();
    }
  });

  const updateCode = () => {
    const match = findMatch(inputIngrediente.value);
    codePill.textContent = match ? `Código: ${match.code}` : "Código: —";
  };

  inputIngrediente.addEventListener("input", updateCode);

  row.append(inputFecha, inputIngrediente, codePill, inputCantidad, remove);
  return row;
};

const ensureRows = (count = 1) => {
  if (!rowsContainer.children.length) {
    rowsContainer.appendChild(createRow());
  }
  while (rowsContainer.children.length < count) {
    rowsContainer.appendChild(createRow());
  }
};

addRowBtn.addEventListener("click", () => {
  rowsContainer.appendChild(createRow());
});

form.addEventListener("reset", () => {
  setTimeout(() => {
    rowsContainer.innerHTML = "";
    ensureRows(1);
    setStatus("", "");
  }, 0);
});

const getOptionsFromSheet = async () => {
  try {
    const res = await fetch(`${GAS_ENDPOINT}?mode=ingredientes`);
    if (!res.ok) throw new Error("No se pudo obtener la lista.");
    const data = await res.json();
    if (!Array.isArray(data.items)) throw new Error("Respuesta inesperada.");
    return data.items;
  } catch (err) {
    console.error(err);
    setStatus("No se pudo cargar la lista de ingredientes.", "error");
    return [];
  }
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = Array.from(rowsContainer.children).map((row) => {
    const inputs = row.querySelectorAll("input");
    const [fechaEl, ingredienteEl, cantidadEl] = inputs;
    const match = findMatch(ingredienteEl.value);

    return {
      fecha: (fechaEl.value || "").trim(),
      codigo: match ? match.code : "",
      ingrediente: match ? match.name : "",
      cantidad: Number((cantidadEl.value || "").trim()),
      matched: Boolean(match),
    };
  });

  const hasInvalid = payload.some(
    (item) => !item.fecha || !item.matched || Number.isNaN(item.cantidad) || item.cantidad < 0
  );

  if (!payload.length || hasInvalid) {
    setStatus("Completa fecha, ingrediente de la lista y cantidad (>= 0) en cada fila.", "error");
    return;
  }

  setStatus("Enviando...", "pending");

  try {
    const response = await fetch(GAS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        items: payload.map(({ fecha, codigo, ingrediente, cantidad }) => ({
          fecha,
          codigo,
          ingrediente,
          cantidad,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));
    if (data.status && data.status !== "ok") {
      throw new Error(data.message || "No se pudo guardar");
    }

    setStatus(data.message || "Producción registrada.", "success");
    form.reset();
  } catch (error) {
    console.error(error);
    setStatus("No se pudo guardar. Revisa la conexión o el endpoint.", "error");
  }
});

(async () => {
  setStatus("Cargando ingredientes...", "pending");
  cachedOptions = await getOptionsFromSheet();
  cachedOptions = cachedOptions.filter((opt) => {
    const code = (opt.code || "").trim();
    const name = (opt.name || "").trim();
    if (!code || !name) return false;
    const upperCode = code.toUpperCase();
    const upperName = name.toUpperCase();
    if (upperCode === "CODIGO" || upperName === "ARTICULO") return false;
    return true;
  });
  renderDatalist(cachedOptions);
  ensureRows(1);
  if (cachedOptions.length) {
    setStatus("Lista cargada. Puedes registrar.", "success");
  }
})();

const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzMe5fAUaccOQv6VJ9ozcNmfXuMufJSvHp5VQcDh5PnjP9jZCjT4DRM2ly3cuhlWLTU/exec"; // despliegue Apps Script produccion diaria
const MENU_LINK = "https://menu-ten-sigma.vercel.app/"; // URL del menú principal

const form = document.getElementById("production-form");
const statusEl = document.getElementById("status");
const rowsContainer = document.getElementById("rows");
const addRowBtn = document.getElementById("add-row");
const menuLinkEl = document.getElementById("menu-link");
const datalistEl = document.getElementById("ingredientes-list");
const responsableEl = document.getElementById("responsable");
const confirmOverlayEl = document.getElementById("confirm-overlay");
const confirmSummaryEl = document.getElementById("confirm-summary");
const confirmCheckEl = document.getElementById("confirm-check");
const confirmSubmitBtn = document.getElementById("confirm-submit");
const confirmCancelBtn = document.getElementById("confirm-cancel");
const confirmCloseBtn = document.getElementById("confirm-close");
const confirmResponsableEl = document.getElementById("confirm-responsable");

menuLinkEl.href = MENU_LINK;

const setStatus = (message, type) => {
  statusEl.textContent = message;
  statusEl.className = `status ${type || ""}`.trim();
};

const todayIso = () => new Date().toISOString().slice(0, 10);

let cachedOptions = [];
let pendingSubmission = null;
let isSubmitting = false;

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

const isValidDateInput = (dateText) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;
  const [year, month, day] = dateText.split("-").map(Number);
  const d = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
};

const closeConfirmation = () => {
  if (!confirmOverlayEl) return;
  confirmOverlayEl.hidden = true;
  document.body.style.overflow = "";
  if (confirmCheckEl) confirmCheckEl.checked = false;
  if (confirmSubmitBtn) confirmSubmitBtn.disabled = true;
  if (confirmCancelBtn) confirmCancelBtn.disabled = false;
  pendingSubmission = null;
};

const openConfirmation = ({ responsable, items }) => {
  if (!confirmOverlayEl || !confirmSummaryEl || !confirmCheckEl || !confirmSubmitBtn) {
    return;
  }

  confirmSummaryEl.innerHTML = "";
  if (confirmResponsableEl) {
    confirmResponsableEl.textContent = responsable.toUpperCase();
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "confirm-table__row";

    const codeCell = document.createElement("span");
    codeCell.textContent = item.codigo;
    const productCell = document.createElement("span");
    productCell.textContent = item.ingrediente;
    const unitCell = document.createElement("span");
    unitCell.textContent = item.unidad || "-";
    const quantityCell = document.createElement("span");
    quantityCell.textContent = String(item.cantidad);

    row.append(codeCell, productCell, unitCell, quantityCell);
    confirmSummaryEl.appendChild(row);
  });

  const total = items.reduce((sum, item) => sum + item.cantidad, 0);
  const totalRow = document.createElement("div");
  totalRow.className = "confirm-table__row confirm-table__total";
  totalRow.innerHTML = `<span class="confirm-table__total-label">Total de unidades</span><span>${total}</span>`;
  confirmSummaryEl.appendChild(totalRow);

  pendingSubmission = { responsable, items };
  confirmCheckEl.checked = false;
  confirmSubmitBtn.disabled = true;
  confirmOverlayEl.hidden = false;
  document.body.style.overflow = "hidden";
};

const validateFormData = () => {
  const responsable = (responsableEl && responsableEl.value ? responsableEl.value : "").trim();
  if (!responsable) {
    return {
      ok: false,
      message: "El campo Responsable es obligatorio.",
      focusEl: responsableEl,
      data: null,
    };
  }

  const rows = Array.from(rowsContainer.children);
  if (!rows.length) {
    return {
      ok: false,
      message: "Debes ingresar al menos una fila de producción.",
      focusEl: null,
      data: null,
    };
  }

  const items = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const fechaEl = row.querySelector('input[type="date"]');
    const ingredienteEl = row.querySelector('input[name="ingrediente"]');
    const cantidadEl = row.querySelector('input[name="cantidad"]');

    const fecha = (fechaEl && fechaEl.value ? fechaEl.value : "").trim();
    const ingredienteText = (ingredienteEl && ingredienteEl.value ? ingredienteEl.value : "").trim();
    const cantidadText = (cantidadEl && cantidadEl.value ? cantidadEl.value : "").trim();
    const cantidad = Number(cantidadText);
    const match = findMatch(ingredienteText);

    if (!isValidDateInput(fecha)) {
      return {
        ok: false,
        message: `Fila ${index + 1}: la fecha no es válida.`,
        focusEl: fechaEl,
        data: null,
      };
    }

    if (!match) {
      return {
        ok: false,
        message: `Fila ${index + 1}: el ingrediente/código debe existir en la lista.`,
        focusEl: ingredienteEl,
        data: null,
      };
    }

    if (cantidadText === "" || Number.isNaN(cantidad) || cantidad < 0) {
      return {
        ok: false,
        message: `Fila ${index + 1}: la cantidad debe ser numérica y mayor o igual a 0.`,
        focusEl: cantidadEl,
        data: null,
      };
    }

    items.push({
      fecha,
      codigo: match.code,
      ingrediente: match.name,
      cantidad,
    });
  }

  return {
    ok: true,
    message: "Validación previa completada. Revisa y confirma el envío.",
    focusEl: null,
    data: {
      responsable,
      items,
    },
  };
};

const submitData = async ({ responsable, items }) => {
  setStatus("Enviando...", "pending");

  const response = await fetch(GAS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ responsable, items }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  if (data.status && data.status !== "ok") {
    throw new Error(data.message || "No se pudo guardar");
  }

  return data;
};

addRowBtn.addEventListener("click", () => {
  rowsContainer.appendChild(createRow());
});

form.addEventListener("reset", () => {
  setTimeout(() => {
    closeConfirmation();
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
  if (isSubmitting) return;

  const validation = validateFormData();
  if (!validation.ok) {
    setStatus(validation.message, "error");
    if (validation.focusEl) validation.focusEl.focus();
    return;
  }

  setStatus(validation.message, "pending");
  openConfirmation(validation.data);
});

if (confirmCheckEl && confirmSubmitBtn) {
  confirmCheckEl.addEventListener("change", () => {
    confirmSubmitBtn.disabled = !confirmCheckEl.checked || isSubmitting;
  });
}

if (confirmCancelBtn) {
  confirmCancelBtn.addEventListener("click", () => {
    closeConfirmation();
    setStatus("Envío cancelado. Puedes ajustar y volver a enviar.", "pending");
  });
}

if (confirmCloseBtn) {
  confirmCloseBtn.addEventListener("click", () => {
    if (isSubmitting) return;
    closeConfirmation();
  });
}

if (confirmOverlayEl) {
  confirmOverlayEl.addEventListener("click", (event) => {
    if (event.target === confirmOverlayEl && !isSubmitting) {
      closeConfirmation();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && confirmOverlayEl && !confirmOverlayEl.hidden && !isSubmitting) {
    closeConfirmation();
  }
});

if (confirmSubmitBtn) {
  confirmSubmitBtn.addEventListener("click", async () => {
    if (!pendingSubmission || !confirmCheckEl || !confirmCheckEl.checked || isSubmitting) {
      return;
    }

    isSubmitting = true;
    confirmSubmitBtn.disabled = true;
    if (confirmCancelBtn) confirmCancelBtn.disabled = true;

    try {
      const data = await submitData(pendingSubmission);
      closeConfirmation();
      setStatus(data.message || "Producción registrada.", "success");
      form.reset();
    } catch (error) {
      console.error(error);
      setStatus("No se pudo guardar. Revisa la conexión o el endpoint.", "error");
      if (confirmCheckEl) {
        confirmSubmitBtn.disabled = !confirmCheckEl.checked;
      }
    } finally {
      isSubmitting = false;
      if (confirmCancelBtn) confirmCancelBtn.disabled = false;
    }
  });
}

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

function pnPrepare(s) {
  if (!s) return s;

  for (const p of s.pallets || []) {
    p.id ||= `PAL-${s.id}-${Number(p.number)}`;

    // Las tarimas anteriores conservan su número.
    // Las nuevas se crean expresamente con finalNumber: null.
    if (!Object.prototype.hasOwnProperty.call(p, "finalNumber")) {
      p.finalNumber = Number(p.number);
      p.numberingLocked = true;
    }
  }

  return s;
}

function pnLetters(n) {
  let text = "";

  for (
    n = Number(n);
    n > 0;
    n = Math.floor((n - 1) / 26)
  ) {
    text = String.fromCharCode(65 + (n - 1) % 26) + text;
  }

  return text;
}

function pnNumber(s, n) {
  pnPrepare(s);

  const p = s?.pallets?.find(
    p => Number(p.number) === Number(n)
  );

  if (!p) return "—";

  return p.finalNumber == null
    ? `provisional ${pnLetters(p.number)}`
    : String(p.finalNumber);
}

function pnValidate(rows) {
  const seen = new Set();

  for (const row of rows) {
    const n = Number(row.finalNumber || 0);

    if (
      !Number.isSafeInteger(n) ||
      n < 0 ||
      n > 999999
    ) {
      throw new Error(
        "Usa números enteros del 1 al 999999, o 0 para dejar pendiente."
      );
    }

    if (n && seen.has(n)) {
      throw new Error(
        `El número ${n} está repetido. No se guardó ningún cambio.`
      );
    }

    if (n) seen.add(n);
  }
}

function pnPlan(s) {
  pnPrepare(s);

  if (
    (s.pallets || []).some(
      p => p.status !== "Cerrada"
    )
  ) {
    throw new Error(
      "Primero cierra todas las tarimas. También puedes numerarlas después de finalizar el surtido."
    );
  }

  const rows = [];

  const pallets = [...s.pallets].sort(
    (a, b) => a.number - b.number
  );

  for (const p of pallets) {
    const moves = (s.movements || []).filter(
      m =>
        !m.deleted &&
        Number(m.pallet) === Number(p.number)
    );

    const kg = moves.reduce(
      (total, m) => total + Number(m.weight || 0),
      0
    );

    const codes = [
      ...new Set(moves.map(m => m.code))
    ].join(", ");

    const answer = window.prompt(
      `Tarima ${pnNumber(s, p.number)}\n` +
      `${p.createdBy || ""} · ${p.deviceId || ""}\n` +
      `${kg.toFixed(2)} kg · Claves: ${codes || "Sin material"}\n\n` +
      "Número final (0 = pendiente).\n" +
      "Cancelar descarta toda esta asignación.",
      String(p.finalNumber || 0)
    );

    if (answer === null) return null;

    if (!/^\d+$/.test(answer.trim())) {
      throw new Error(
        "Escribe únicamente un número entero."
      );
    }

    rows.push({
      id: p.id,
      previous: Number(p.finalNumber || 0),
      finalNumber: Number(answer.trim())
    });
  }

  pnValidate(rows);

  return rows;
}

function pnApply(s, rows, lock = false) {
  pnPrepare(s);
  pnValidate(rows);

  if (
    rows.length !== s.pallets.length ||
    new Set(rows.map(r => r.id)).size !== rows.length
  ) {
    throw new Error(
      "Cambió la lista de tarimas. Actualiza e inténtalo otra vez."
    );
  }

  // Primero se comprueba todo; después se aplica todo.
  for (const p of s.pallets) {
    const r = rows.find(r => r.id === p.id);

    if (
      !r ||
      Number(r.previous) !== Number(p.finalNumber || 0)
    ) {
      throw new Error(
        "Otra sesión cambió los números. Actualiza e inténtalo otra vez."
      );
    }

    if (p.status !== "Cerrada") {
      throw new Error(
        "Primero cierra todas las tarimas."
      );
    }
  }

  for (const p of s.pallets) {
    p.finalNumber =
      rows.find(r => r.id === p.id).finalNumber || null;

    p.numberingLocked = lock;

    delete p.requestedFinalNumber;
  }
}

function pnReport(s) {
  const copy = pnPrepare(
    JSON.parse(JSON.stringify(s))
  );

  pnValidate(copy.pallets);

  if (copy.pallets.some(p => !p.finalNumber)) {
    throw new Error(
      "Asigna los números finales de todas las tarimas antes de imprimir o generar el reporte."
    );
  }

  const numbers = new Map(
    copy.pallets.map(
      p => [Number(p.number), Number(p.finalNumber)]
    )
  );

  for (const m of copy.movements || []) {
    if (!numbers.has(Number(m.pallet))) {
      throw new Error(
        "Una captura no tiene una tarima válida."
      );
    }

    m.pallet = numbers.get(Number(m.pallet));
  }

  for (const p of copy.pallets) {
    p.number = Number(p.finalNumber);
  }

  return copy;
}
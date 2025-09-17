import React, { useMemo, useRef, useState, useEffect } from "react";

/**
 * LP 2D – Método Gráfico (Investigación Operativa)
 * -------------------------------------------------
 * • Ingrese restricciones en la forma: a x + b y (<=, >=, =) c
 * • Seleccione MAX o MIN para la función objetivo Z = cx x + cy y
 * • Pinte región factible, puntos vértice y línea iso-objetivo
 * • Calcula la solución óptima evaluando los vértices factibles
 *
 * Estilo: Tailwind CSS (ya disponible en el entorno del canvas)
 * Componentes: sin dependencias externas
 */

// Types
const Sense = { LE: "<=", GE: ">=", EQ: "=" };
const OptType = { MAX: "MAX", MIN: "MIN" };


function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function parseNum(v) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  // Permite comas decimales
  const s = String(v).replace(/,/, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Solve 2x2: a1 x + b1 y = c1; a2 x + b2 y = c2
function intersect(l1, l2) {
  const { ax: a1, by: b1, c: c1 } = l1;
  const { ax: a2, by: b2, c: c2 } = l2;
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-9) return null; // paralelas o coincidentes
  const x = (c1 * b2 - c2 * b1) / det;
  const y = (a1 * c2 - a2 * c1) / det;
  return { x, y };
}

function satisfies({ ax, by, sense, c }, p, eps = 1e-9) {
  const lhs = ax * p.x + by * p.y;
  if (sense === Sense.LE) return lhs <= c + eps;
  if (sense === Sense.GE) return lhs >= c - eps;
  return Math.abs(lhs - c) <= eps; // equality
}

function withinBounds(p, bounds) {
  return (
    p.x >= bounds.xmin - 1e-9 &&
    p.y >= bounds.ymin - 1e-9 &&
    p.x <= bounds.xmax + 1e-9 &&
    p.y <= bounds.ymax + 1e-9
  );
}

function uniquePoints(points, tol = 1e-6) {
  const out = [];
  for (const q of points) {
    if (!q) continue;
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    let dup = false;
    for (const p of out) {
      if (Math.hypot(p.x - q.x, p.y - q.y) < tol) {
        dup = true;
        break;
      }
    }
    if (!dup) out.push(q);
  }
  return out;
}

function computeVertices(restrictions, includeNonNegativity, bounds) {
  const linesEq = [];
  const feasible = (p) =>
    restrictions.every((r) => satisfies(r, p)) &&
    (!includeNonNegativity || (p.x >= -1e-9 && p.y >= -1e-9));

  // Intersecciones entre parejas de restricciones (igualando cada una)
  for (let i = 0; i < restrictions.length; i++) {
    for (let j = i + 1; j < restrictions.length; j++) {
      const A = restrictions[i];
      const B = restrictions[j];
      const p = intersect(
        { ax: A.ax, by: A.by, c: A.c },
        { ax: B.ax, by: B.by, c: B.c }
      );
      if (p && withinBounds(p, bounds) && feasible(p)) linesEq.push(p);
    }
  }

  // Intersecciones con ejes si non-negativity
  if (includeNonNegativity) {
    for (const r of restrictions) {
      // Con eje X (y=0): a x = c
      if (Math.abs(r.ax) > 1e-9) {
        const x = r.c / r.ax;
        const p = { x, y: 0 };
        if (withinBounds(p, bounds) && feasible(p)) linesEq.push(p);
      }
      // Con eje Y (x=0): b y = c
      if (Math.abs(r.by) > 1e-9) {
        const y = r.c / r.by;
        const p = { x: 0, y };
        if (withinBounds(p, bounds) && feasible(p)) linesEq.push(p);
      }
    }
    // origen
    const zero = { x: 0, y: 0 };
    if (feasible(zero)) linesEq.push(zero);
  }

  return uniquePoints(linesEq);
}

function optimize(vertices, objective, optType) {
  if (vertices.length === 0) return null;
  const evalZ = (p) => objective.cx * p.x + objective.cy * p.y;
  let best = {
    point: vertices[0],
    z: evalZ(vertices[0])
  };
  for (const p of vertices) {
    const z = evalZ(p);
    if (optType === OptType.MAX ? z > best.z + 1e-9 : z < best.z - 1e-9) {
      best = { point: p, z };
    }
  }
  return best;
}

function useAutoBounds(points, manualBounds) {
  return useMemo(() => {
    if (manualBounds) return manualBounds;
    let xs = points.map((p) => p.x);
    let ys = points.map((p) => p.y);
    if (xs.length === 0) xs = [0];
    if (ys.length === 0) ys = [0];
    const xmin = Math.min(0, ...xs);
    const ymin = Math.min(0, ...ys);
    const xmax = Math.max(5, ...xs);
    const ymax = Math.max(5, ...ys);
    const padX = Math.max(1, 0.1 * (xmax - xmin));
    const padY = Math.max(1, 0.1 * (ymax - ymin));
    return {
      xmin: xmin - padX,
      xmax: xmax + padX,
      ymin: ymin - padY,
      ymax: ymax + padY
    };
  }, [points, manualBounds]);
}

function worldToScreen({ x, y }, bounds, width, height, padding = 48) {
  const w = width - 2 * padding;
  const h = height - 2 * padding;
  const sx = padding + ((x - bounds.xmin) / (bounds.xmax - bounds.xmin)) * w;
  const sy =
    padding + (1 - (y - bounds.ymin) / (bounds.ymax - bounds.ymin)) * h;
  return { x: sx, y: sy };
}

function drawGrid(ctx, bounds, width, height, padding = 48) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#e5e7eb"; // gray-200
  ctx.fillStyle = "#6b7280"; // gray-500 for labels

  // axes
  const O = worldToScreen({ x: 0, y: 0 }, bounds, width, height, padding);
  // X axis
  ctx.beginPath();
  ctx.moveTo(padding, O.y);
  ctx.lineTo(width - padding, O.y);
  ctx.stroke();
  // Y axis
  ctx.beginPath();
  ctx.moveTo(O.x, padding);
  ctx.lineTo(O.x, height - padding);
  ctx.stroke();

  // ticks (nice step)
  const xRange = bounds.xmax - bounds.xmin;
  const yRange = bounds.ymax - bounds.ymin;
  const nice = (r) => {
    const raw = r / 10;
    const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
    const candidates = [1, 2, 5, 10].map((k) => k * pow10);
    let step = candidates[0];
    for (const c of candidates) if (Math.abs(raw - c) < Math.abs(raw - step)) step = c;
    return Math.max(step, 0.0001);
  };

  const xStep = nice(xRange);
  const yStep = nice(yRange);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system";

  for (let x = Math.ceil(bounds.xmin / xStep) * xStep; x <= bounds.xmax + 1e-9; x += xStep) {
    const p = worldToScreen({ x, y: 0 }, bounds, width, height, padding);
    ctx.beginPath();
    ctx.moveTo(p.x, padding);
    ctx.lineTo(p.x, height - padding);
    ctx.strokeStyle = "#f3f4f6"; // gray-100
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.fillText(Number(x.toFixed(4)).toString(), p.x, O.y + 4);
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = Math.ceil(bounds.ymin / yStep) * yStep; y <= bounds.ymax + 1e-9; y += yStep) {
    const p = worldToScreen({ x: 0, y }, bounds, width, height, padding);
    ctx.beginPath();
    ctx.moveTo(padding, p.y);
    ctx.lineTo(width - padding, p.y);
    ctx.strokeStyle = "#f3f4f6";
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.fillText(Number(y.toFixed(4)).toString(), O.x - 6, p.y);
  }

  // labels
  ctx.fillStyle = "#111827"; // gray-900
  ctx.textAlign = "right";
  ctx.fillText("x₁", width - padding + 20, O.y + 2);
  ctx.save();
  ctx.translate(O.x - 10, padding - 20);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "right";
  ctx.fillText("x₂", 0, 0);
  ctx.restore();

  ctx.restore();
}

function drawFeasible(ctx, restrictions, bounds, width, height, padding = 48) {
  // Construir polígono recortando un rectángulo grande por cada restricción
  // Aproximación: muestrear contorno con ray casting en una rejilla fina de ángulos alrededor del centro.
  // Para simplicidad y robustez, muestreamos direcciones y buscamos intersecciones con fronteras.
  const center = { x: (bounds.xmin + bounds.xmax) / 2, y: (bounds.ymin + bounds.ymax) / 2 };
  const rays = 720; // buena suavidad
  const pts = [];

  const borderLines = [
    { ax: 1, by: 0, c: bounds.xmin, side: Sense.GE },
    { ax: 1, by: 0, c: bounds.xmax, side: Sense.LE },
    { ax: 0, by: 1, c: bounds.ymin, side: Sense.GE },
    { ax: 0, by: 1, c: bounds.ymax, side: Sense.LE }
  ];

  const halfLines = restrictions.map((r) => ({ ...r }));

  for (let k = 0; k < rays; k++) {
    const ang = (2 * Math.PI * k) / rays;
    const dir = { x: Math.cos(ang), y: Math.sin(ang) };
    // Avanza desde el centro hasta que toque alguna frontera de media-plano
    let tMin = Infinity;
    // Encontrar la primera colisión con las fronteras activas del polígono factible
    const all = [...borderLines, ...halfLines];
    for (const L of all) {
      // Línea L: ax x + by y = c, buscamos t s.t. ax (cx + t dx) + by (cy + t dy) = c
      const num = L.c - (L.ax * center.x + L.by * center.y);
      const den = L.ax * dir.x + L.by * dir.y;
      if (Math.abs(den) < 1e-12) continue;
      const t = num / den;
      if (t <= 0) continue;
      const p = { x: center.x + t * dir.x, y: center.y + t * dir.y };
      // Debe cumplir todas las semirrectas <=/=>
      let ok = true;
      for (const R of halfLines) if (!satisfies(R, p)) { ok = false; break; }
      if (ok) tMin = Math.min(tMin, t);
    }
    if (tMin < Infinity) {
      pts.push({ x: center.x + tMin * dir.x, y: center.y + tMin * dir.y });
    }
  }

  if (pts.length < 3) return [];

  ctx.save();
  ctx.beginPath();
  const P0 = worldToScreen(pts[0], bounds, width, height, padding);
  ctx.moveTo(P0.x, P0.y);
  for (let i = 1; i < pts.length; i++) {
    const P = worldToScreen(pts[i], bounds, width, height, padding);
    ctx.lineTo(P.x, P.y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(59,130,246,0.12)"; // blue-500 @ 12%
  ctx.fill();
  ctx.restore();

  return pts;
}

function drawConstraintLines(ctx, restrictions, bounds, width, height, padding = 48) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#3b82f6"; // blue-500

  for (const r of restrictions) {
    // dibujar segmento de la recta dentro de bounds
    // hallar dos puntos de cruce con el rectángulo de dibujo
    const candidates = [];
    // x = xmin
    if (Math.abs(r.by) > 1e-12) {
      const y = (r.c - r.ax * bounds.xmin) / r.by;
      candidates.push({ x: bounds.xmin, y });
    }
    // x = xmax
    if (Math.abs(r.by) > 1e-12) {
      const y = (r.c - r.ax * bounds.xmax) / r.by;
      candidates.push({ x: bounds.xmax, y });
    }
    // y = ymin
    if (Math.abs(r.ax) > 1e-12) {
      const x = (r.c - r.by * bounds.ymin) / r.ax;
      candidates.push({ x, y: bounds.ymin });
    }
    // y = ymax
    if (Math.abs(r.ax) > 1e-12) {
      const x = (r.c - r.by * bounds.ymax) / r.ax;
      candidates.push({ x, y: bounds.ymax });
    }

    const inside = candidates.filter((p) => withinBounds(p, bounds));
    if (inside.length < 2) continue;

    const A = worldToScreen(inside[0], bounds, width, height, padding);
    const B = worldToScreen(inside[1], bounds, width, height, padding);

    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();

    // indicador de sentido (flechas pequeñas hacia la zona válida)
    // probamos un punto medio desplazado hacia el semiplano válido
    const mid = { x: (inside[0].x + inside[1].x) / 2, y: (inside[0].y + inside[1].y) / 2 };
    const n = { x: r.ax, y: r.by };
    const mag = Math.hypot(n.x, n.y) || 1;
    const step = 0.35;
    const test = { x: mid.x + (r.sense === Sense.LE ? -n.x : n.x) * (step / mag), y: mid.y + (r.sense === Sense.LE ? -n.y : n.y) * (step / mag) };
    const M = worldToScreen(mid, bounds, width, height, padding);
    const T = worldToScreen(test, bounds, width, height, padding);
    const dir = Math.atan2(T.y - M.y, T.x - M.x);

    ctx.beginPath();
    ctx.moveTo(M.x, M.y);
    ctx.lineTo(T.x, T.y);
    ctx.strokeStyle = "#93c5fd"; // blue-300
    ctx.stroke();

    // punta de flecha
    ctx.beginPath();
    const ah = 6;
    ctx.moveTo(T.x, T.y);
    ctx.lineTo(T.x - ah * Math.cos(dir - 0.3), T.y - ah * Math.sin(dir - 0.3));
    ctx.lineTo(T.x - ah * Math.cos(dir + 0.3), T.y - ah * Math.sin(dir + 0.3));
    ctx.closePath();
    ctx.fillStyle = "#93c5fd";
    ctx.fill();
  }

  ctx.restore();
}

function drawVertices(ctx, vertices, bounds, width, height, padding = 48) {
  ctx.save();
  ctx.fillStyle = "#ef4444"; // red-500
  for (const p of vertices) {
    const S = worldToScreen(p, bounds, width, height, padding);
    ctx.beginPath();
    ctx.arc(S.x, S.y, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawObjective(ctx, objective, zValue, bounds, width, height, padding = 48) {
  // dibuja recta cx x + cy y = zValue
  const { cx, cy } = objective;
  if (Math.abs(cx) < 1e-12 && Math.abs(cy) < 1e-12) return;
  const candidates = [];
  if (Math.abs(cy) > 1e-12) {
    const y1 = (zValue - cx * bounds.xmin) / cy;
    const y2 = (zValue - cx * bounds.xmax) / cy;
    candidates.push({ x: bounds.xmin, y: y1 }, { x: bounds.xmax, y: y2 });
  }
  if (Math.abs(cx) > 1e-12) {
    const x1 = (zValue - cy * bounds.ymin) / cx;
    const x2 = (zValue - cy * bounds.ymax) / cx;
    candidates.push({ x: x1, y: bounds.ymin }, { x: x2, y: bounds.ymax });
  }
  const inside = candidates.filter((p) => withinBounds(p, bounds));
  if (inside.length < 2) return;
  const A = worldToScreen(inside[0], bounds, width, height, padding);
  const B = worldToScreen(inside[1], bounds, width, height, padding);
  ctx.save();
  ctx.strokeStyle = "#10b981"; // emerald-500
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(B.x, B.y);
  ctx.stroke();
  ctx.restore();
}

// ---- UI ----
function NumberInput({ value, onChange, placeholder, className }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className ?? ""}`}
    />
  );
}

function Select({ value, onChange, options, className }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className ?? ""}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function ConstraintRow({ idx, row, onChange, onDelete }) {
  const update = (patch) => onChange(idx, { ...row, ...patch });
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <div className="col-span-2 flex items-center gap-1"><span className="text-sm text-gray-600">a{idx+1}</span><NumberInput value={row.ax} onChange={(v)=>update({ax:v})} placeholder="a"/></div>
      <div className="col-span-1 text-center font-medium">x₁ +</div>
      <div className="col-span-2 flex items-center gap-1"><span className="text-sm text-gray-600">b{idx+1}</span><NumberInput value={row.by} onChange={(v)=>update({by:v})} placeholder="b"/></div>
      <div className="col-span-1 text-center font-medium">x₂</div>
      <div className="col-span-2"><Select value={row.sense} onChange={(v)=>update({sense:v})} options={[Sense.LE, Sense.GE, Sense.EQ]}/></div>
      <div className="col-span-3 flex items-center gap-1"><span className="text-sm text-gray-600">c{idx+1}</span><NumberInput value={row.c} onChange={(v)=>update({c:v})} placeholder="c"/></div>
      <button onClick={()=>onDelete(idx)} className="col-span-1 text-red-600 hover:text-red-700 text-sm">Eliminar</button>
    </div>
  );
}

function ExamplePresetButton({ onLoad }) {
  const presets = [
    {
      name: "Ejemplo MAX (clásico)",
      obj: { type: OptType.MAX, cx: 3, cy: 5 },
      nn: true,
      rows: [
        { ax: 1, by: 0, sense: Sense.GE, c: 0 },
        { ax: 0, by: 1, sense: Sense.GE, c: 0 },
        { ax: 1, by: 2, sense: Sense.LE, c: 14 },
        { ax: 3, by: 2, sense: Sense.LE, c: 18 }
      ]
    },
    {
      name: "Ejemplo MIN (dieta)",
      obj: { type: OptType.MIN, cx: 2, cy: 1 },
      nn: true,
      rows: [
        { ax: 1, by: 1, sense: Sense.GE, c: 6 },
        { ax: 3, by: 1, sense: Sense.GE, c: 9 },
        { ax: 1, by: 0, sense: Sense.GE, c: 0 },
        { ax: 0, by: 1, sense: Sense.GE, c: 0 }
      ]
    }
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <button
          key={p.name}
          onClick={() => onLoad(p)}
          className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm"
        >{p.name}</button>
      ))}
    </div>
  );
}

export default function LP2DMetodoGrafico() {
  const [rows, setRows] = useState([
    { ax: "1", by: "2", sense: Sense.LE, c: "14" },
    { ax: "3", by: "2", sense: Sense.LE, c: "18" },
  ]);
  const [nonNegativity, setNonNegativity] = useState(true);
  const [optType, setOptType] = useState(OptType.MAX);
  const [cx, setCx] = useState("3");
  const [cy, setCy] = useState("5");
  const [zProbe, setZProbe] = useState(0); // valor de iso-objetivo a dibujar (arrastrable)

  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 520 });

  // Normalizar restricciones numéricas
  const restrictions = useMemo(() =>
    rows.map((r) => ({ ax: parseNum(r.ax), by: parseNum(r.by), sense: r.sense, c: parseNum(r.c) })),
  [rows]);

  const objective = useMemo(() => ({ cx: parseNum(cx), cy: parseNum(cy) }), [cx, cy]);

  // Candidatos de vértices y bounds auto
  const manualBounds = null; // podría exponerse en UI
  const candidateVertices = useMemo(() => computeVertices(restrictions, nonNegativity, { xmin: -1000, ymin: -1000, xmax: 1000, ymax: 1000 }), [restrictions, nonNegativity]);
  const bounds = useAutoBounds(candidateVertices, manualBounds);

  const best = useMemo(() => optimize(candidateVertices, objective, optType), [candidateVertices, objective, optType]);

  useEffect(() => {
    // si tenemos solución, ubicar zProbe a través de ese Z; si no, 0
    if (best) setZProbe(objective.cx * best.point.x + objective.cy * best.point.y);
  }, [best, objective.cx, objective.cy]);

  // Dibujo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { w, h } = size;

    // HiDPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // clear
    ctx.clearRect(0, 0, w, h);

    // grid + axes
    drawGrid(ctx, bounds, w, h);

    // feasible region (soft fill)
    const polyPts = drawFeasible(ctx, restrictions, bounds, w, h);

    // lines
    drawConstraintLines(ctx, restrictions, bounds, w, h);

    // vertices (computed)
    drawVertices(ctx, candidateVertices, bounds, w, h);

    // objective iso-line (at zProbe)
    drawObjective(ctx, objective, zProbe, bounds, w, h);

    // optimum marker
    if (best) {
      const S = worldToScreen(best.point, bounds, w, h);
      ctx.save();
      ctx.fillStyle = "#16a34a"; // green-600
      ctx.beginPath();
      ctx.arc(S.x, S.y, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillStyle = "#065f46";
      const zFmt = Number(best.z.toFixed(6)).toString();
      ctx.fillText(`${optType} Z* = ${zFmt}`, S.x + 10, S.y - 10);
      ctx.restore();
    }
  }, [restrictions, bounds, size, candidateVertices, zProbe, objective, optType, best]);

  // Drag de la línea objetivo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false;

    const onDown = (e) => {
      dragging = true;
    };
    const onMove = (e) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const y = clamp(e.clientY - rect.top, 0, rect.height);
      // Convertir un punto pantalla a mundo y proyectarlo sobre la iso-línea para obtener z
      // Tomamos el punto y calculamos z = cx x + cy y
      const padding = 48;
      const w = rect.width - 2 * padding;
      const h = rect.height - 2 * padding;
      const wx = bounds.xmin + ((x - padding) / w) * (bounds.xmax - bounds.xmin);
      const wy = bounds.ymin + (1 - (y - padding) / h) * (bounds.ymax - bounds.ymin);
      const z = objective.cx * wx + objective.cy * wy;
      setZProbe(z);
    };
    const onUp = () => { dragging = false; };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [bounds, objective]);

  const addRow = () => setRows((r) => [...r, { ax: "", by: "", sense: Sense.LE, c: "" }]);
  const updateRow = (i, row) => setRows((rs) => rs.map((r, k) => (k === i ? row : r)));
  const deleteRow = (i) => setRows((rs) => rs.filter((_, k) => k !== i));

  const loadPreset = (p) => {
    setRows(p.rows.map((r) => ({ ...r, ax: String(r.ax), by: String(r.by), c: String(r.c) })));
    setCx(String(p.obj.cx));
    setCy(String(p.obj.cy));
    setOptType(p.obj.type);
    setNonNegativity(p.nn);
  };

  const solutionList = useMemo(() => {
    const evalZ = (pt) => objective.cx * pt.x + objective.cy * pt.y;
    const rows = candidateVertices
      .map((p) => ({ ...p, z: evalZ(p) }))
      .sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    return rows;
  }, [candidateVertices, objective]);

  return (
    <div className="min-h-screen w-full bg-white text-gray-900">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Método Gráfico – LP en 2 Variables</h1>
            <p className="text-gray-600 text-sm">Traza restricciones, región factible, isocosto y calcula la solución óptima (vértices).</p>
          </div>
          <ExamplePresetButton onLoad={loadPreset} />
        </header>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Panel Izquierdo: Formulario */}
          <div className="space-y-5">
            <section className="p-4 border rounded-2xl shadow-sm">
              <h2 className="font-semibold mb-3">Función Objetivo</h2>
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3"><Select value={optType} onChange={setOptType} options={[OptType.MAX, OptType.MIN]} /></div>
                <div className="col-span-2 text-center font-medium">Z =</div>
                <div className="col-span-2 flex items-center gap-1"><span className="text-sm text-gray-600">c₁</span><NumberInput value={cx} onChange={setCx} placeholder="c1"/></div>
                <div className="col-span-1 text-center font-medium">x₁ +</div>
                <div className="col-span-2 flex items-center gap-1"><span className="text-sm text-gray-600">c₂</span><NumberInput value={cy} onChange={setCy} placeholder="c2"/></div>
                <div className="col-span-1 text-center font-medium">x₂</div>
              </div>
              <div className="mt-2 text-xs text-gray-500">Arrastra sobre el lienzo para mover la recta iso-{optType === OptType.MAX ? "utilidad" : "costo"} (valor Z).</div>
            </section>

            <section className="p-4 border rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Restricciones</h2>
                <button onClick={addRow} className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700">+ Agregar</button>
              </div>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <ConstraintRow key={i} idx={i} row={r} onChange={updateRow} onDelete={deleteRow} />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input id="nn" type="checkbox" checked={nonNegativity} onChange={(e)=>setNonNegativity(e.target.checked)} />
                <label htmlFor="nn" className="text-sm">Incluir no negatividad (x₁ ≥ 0, x₂ ≥ 0)</label>
              </div>
            </section>

            <section className="p-4 border rounded-2xl shadow-sm">
              <h2 className="font-semibold mb-2">Resultados</h2>
              {best ? (
                <div className="text-sm">
                  <div className="mb-2">Óptimo <span className="font-semibold">{optType}</span> en <span className="font-mono">(x₁*, x₂*) = ({best.point.x.toFixed(6)}, {best.point.y.toFixed(6)})</span></div>
                  <div>Valor óptimo: <span className="font-mono">Z* = {best.z.toFixed(6)}</span></div>
                </div>
              ) : (
                <div className="text-sm text-red-600">No hay solución óptima (región vacía o sin vértices).</div>
              )}

              <details className="mt-3">
                <summary className="text-sm cursor-pointer select-none">Ver vértices factibles ({solutionList.length})</summary>
                <div className="mt-2 max-h-48 overflow-auto border rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">x₁</th>
                        <th className="p-2 text-left">x₂</th>
                        <th className="p-2 text-left">Z</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solutionList.map((p, i) => (
                        <tr key={i} className="odd:bg-white even:bg-gray-50">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2 font-mono">{p.x.toFixed(6)}</td>
                          <td className="p-2 font-mono">{p.y.toFixed(6)}</td>
                          <td className="p-2 font-mono">{p.z.toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          </div>

          {/* Panel Derecho: Canvas */}
<div className="p-4 border rounded-2xl shadow-sm">
  <div className="flex items-center justify-between mb-2">
    <h2 className="font-semibold">Plano x₁–x₂</h2>
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span>Arrastra para mover la recta de Z</span>
    </div>
  </div>

  {/* 🔧 Contenedor que recorta y centra el canvas */}
  <div className="relative flex justify-center items-center overflow-hidden rounded-2xl border">
    <canvas
      ref={canvasRef}
      width={size.w}
      height={size.h}
      className="max-w-full h-auto shadow-md"
    />
  </div>

  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
    <div>
      <label className="block text-xs text-gray-600 mb-1">Ancho</label>
      <NumberInput
        value={size.w}
        onChange={(v) => setSize((s) => ({ ...s, w: parseNum(v) || 800 }))}
      />
    </div>
    <div>
      <label className="block text-xs text-gray-600 mb-1">Alto</label>
      <NumberInput
        value={size.h}
        onChange={(v) => setSize((s) => ({ ...s, h: parseNum(v) || 520 }))}
      />
    </div>
  </div>
</div>

</div>

<footer className="mt-6 text-xs text-gray-500">
  Sugerencia: Ingresa coeficientes fraccionarios (p. ej., "2.5") o enteros. Usa los presets para probar casos típicos de MAX y MIN.
</footer>
</div>
</div>
);
}

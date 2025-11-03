"use client";
import React, { useState } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";

const CANVAS_SIZE = 900;
const API_BASE = process.env.NEXT_PUBLIC_CRAFT_CREATE_API as string;

type DeptType = "dept" | "void";
type Closeness = "A" | "E" | "I" | "O" | "U" | "X";
type Mode = "CRAFT" | "CORELAP" | "ALDEP";

const CLOSENESS_WEIGHTS: Record<Closeness | "blank", number> = {
  A: 10, E: 8, I: 6, O: 4, U: 2, X: 0, blank: 0,
};

type Dept = {
  id: string; name: string; width: number; height: number; x: number; y: number;
  gridSize?: number; type: DeptType; locked?: boolean;
};

type DeptProto = {
  id: string;
  name: string;
  /** ใช้เป็นจำนวนช่อง (cells) */
  area?: number;
  fixed?: boolean;
};

function getMeter(gridSize: number) { return CANVAS_SIZE / gridSize; }

/* ---------- small helpers ---------- */
function sanitizeCloseness(names: string[], m: string[][]): string[][] {
  const n = names.length;
  const VALID = new Set(["", "A", "E", "I", "O", "U", "X"]);
  const out: string[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const v = (m?.[i]?.[j] ?? "").toString().trim().toUpperCase();
      return VALID.has(v) ? v : "";
    })
  );
  for (let i = 0; i < n; i++) out[i][i] = "X";
  return out;
}
function sumCells(protos: DeptProto[]) {
  return protos.reduce((s, p) => s + (p.area ?? 0), 0);
}

/* ---------- canvas pieces ---------- */
function DraggableDepartment({ dept }: { dept: Dept }) {
  const disabled = !!dept.locked;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: dept.id, disabled });
  const px = getMeter(dept.gridSize ?? 1);
  return (
    <div
      ref={setNodeRef}
      style={{
        position: "absolute",
        top: dept.y * px, left: dept.x * px, width: dept.width * px, height: dept.height * px,
        background: dept.type === "void"
          ? "repeating-linear-gradient(45deg, rgba(255,255,255,.15) 0 8px, rgba(255,255,255,.08) 8px 16px)"
          : "linear-gradient(135deg, #4ade80 80%, #15803d 100%)",
        borderRadius: "0.6rem", border: dept.type === "void" ? "2px dashed #94a3b8" : "2px solid #1e293b",
        boxShadow: "0 4px 16px 0 rgb(0 0 0 / 0.18)", color: "#002b5c", fontWeight: "bold",
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        cursor: disabled ? "not-allowed" : "grab", zIndex: 2,
      }}
      {...listeners} {...attributes}
      className="text-xs flex items-center justify-center select-none relative"
    >
      {dept.name}
      {dept.locked && <div className="absolute top-1 right-1 text-[10px] px-1 rounded bg-amber-500/80 text-white">LOCK</div>}
    </div>
  );
}
function GhostOverlay({ assignment, gridSize }: { assignment: Dept[]; gridSize: number; }) {
  if (!assignment?.length) return null;
  const m = getMeter(gridSize);
  return (
    <>
      {assignment.map((d) => (
        <div key={`ghost-${d.id || d.name}`}
          style={{
            position: "absolute", top: d.y * m, left: d.x * m, width: d.width * m, height: d.height * m,
            border: "2px dashed #22c55e", background: "rgba(34,197,94,0.18)", borderRadius: "0.6rem",
            pointerEvents: "none", zIndex: 3,
          }}
          title={`${d.name} → (${d.x}, ${d.y})`}
        />
      ))}
    </>
  );
}
function GridArea({
  layout, setLayout, gridSize, onLayoutChange, overlayAssignment, draggableEnabled = true,
}: {
  layout: Dept[]; setLayout: (v: Dept[]) => void; gridSize: number;
  onLayoutChange: (v: Dept[]) => void; overlayAssignment?: Dept[] | null; draggableEnabled?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: "layout" });
  function handleDragEnd(event: any) {
    if (!draggableEnabled) return;
    const { active, delta } = event;
    const i = layout.findIndex((d) => d.id === active.id);
    if (i === -1) return;
    const moved = layout[i]; if (moved.locked) return;
    const meter = getMeter(gridSize);
    const dx = Math.round(delta.x / meter), dy = Math.round(delta.y / meter);
    const nx = Math.max(0, Math.min(moved.x + dx, gridSize - moved.width));
    const ny = Math.max(0, Math.min(moved.y + dy, gridSize - moved.height));
    const next = [...layout]; next[i] = { ...moved, x: nx, y: ny };
    setLayout(next); onLayoutChange(next);
  }
  const gridColor = "rgba(220,227,240,0.18)", mainBorder = "rgba(255,255,255,0.08)";
  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div ref={setNodeRef} className="relative shadow-xl"
        style={{
          width: "100%", height: "100%", minHeight: CANVAS_SIZE, minWidth: CANVAS_SIZE,
          backgroundColor: "#002b5c",
          backgroundImage: `linear-gradient(to right, ${gridColor} 1px, transparent 1px),
                            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)`,
          backgroundSize: `${getMeter(gridSize)}px ${getMeter(gridSize)}px`,
          border: `2px solid ${mainBorder}`, borderRadius: "1.5rem",
        }}>
        <div style={{
          pointerEvents: "none", position: "absolute", inset: 0, borderRadius: "1.5rem",
          background: "linear-gradient(135deg,rgba(0,0,0,0.05) 30%,rgba(255,255,255,0.06) 100%)", zIndex: 1,
        }}/>
        {layout.map((d) => <DraggableDepartment key={d.id} dept={{ ...d, gridSize }} />)}
        {overlayAssignment?.length ? <GhostOverlay assignment={overlayAssignment} gridSize={gridSize} /> : null}
      </div>
    </DndContext>
  );
}

/* ---------- forms ---------- */
function AddDepartmentForm({ onAdd, gridSize }: { onAdd: (d: Dept) => void; gridSize: number; }) {
  const [name, setName] = useState(""); const [width, setWidth] = useState(""); const [height, setHeight] = useState("");
  const [x, setX] = useState(""); const [y, setY] = useState(""); const [isVoid, setIsVoid] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !width || !height || !x || !y) return alert("กรุณากรอกข้อมูลให้ครบ");
    const w = +width, h = +height, xx = +x, yy = +y;
    if (xx < 0 || yy < 0 || w <= 0 || h <= 0) return alert("ตำแหน่ง/ขนาดต้องเป็นค่าบวก");
    if (xx + w > gridSize || yy + h > gridSize) return alert("เกินพื้นที่");
    onAdd({ id: `dept_${Date.now()}`, name, width: w, height: h, x: xx, y: yy, type: isVoid ? "void" : "dept", gridSize });
    setName(""); setWidth(""); setHeight(""); setX(""); setY("");
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label className="block text-sm mb-1 text-[#f0f6fc]">ชื่อแผนก</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1"><label className="block text-sm mb-1 text-[#f0f6fc]">กว้าง (cells)</label>
          <input type="number" min={1} max={gridSize} value={width} onChange={(e) => setWidth(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
        <div className="flex-1"><label className="block text-sm mb-1 text-[#f0f6fc]">สูง (cells)</label>
          <input type="number" min={1} max={gridSize} value={height} onChange={(e) => setHeight(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1"><label className="block text-sm mb-1 text-[#f0f6fc]">ตำแหน่ง X</label>
          <input type="number" min={0} max={gridSize} value={x} onChange={(e) => setX(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
        <div className="flex-1"><label className="block text-sm mb-1 text-[#f0f6fc]">ตำแหน่ง Y</label>
          <input type="number" min={0} max={gridSize} value={y} onChange={(e) => setY(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input id="isVoid" type="checkbox" checked={isVoid} onChange={(e) => setIsVoid(e.target.checked)} />
        <label htmlFor="isVoid" className="text-[#f0f6fc] text-sm">เพิ่มเป็น “พื้นที่ว่าง” (void)</label>
      </div>
      <button className="w-full bg-gradient-to-r from-blue-500 to-green-400 text-white py-2 rounded-lg font-bold">+ เพิ่มแผนก</button>
    </form>
  );
}

function DepartmentList({ layout, onDelete, onToggleLock }: { layout: any[]; onDelete: (id: string) => void; onToggleLock: (id: string) => void; }) {
  return (
    <div>
      <div className="font-semibold text-[#f0f6fc] mb-2 mt-4">แผนก</div>
      <div className="bg-white/20 rounded-lg p-2 min-h-[40px]">
        {layout.length === 0 ? <p className="text-sm text-white/70">None</p> : (
          <ul className="space-y-1">
            {layout.map((d) => (
              <li key={d.id} className="flex justify-between items-center py-1 px-1 rounded hover:bg-white/30">
                <span className="font-medium text-[#e0f2fe]">
                  {d.name}{d.type === "void" && <em className="text-white/60"> (void)</em>}
                  {d.locked && <em className="text-amber-300 ml-1">[locked]</em>}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => onToggleLock(d.id)} className="text-xs px-2 py-1 rounded bg-amber-600/70 text-white">{d.locked ? "Unlock" : "Lock"}</button>
                  <button onClick={() => onDelete(d.id)} className="text-xs text-red-400 hover:text-red-600 font-semibold px-2 py-1 rounded">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- matrices ---------- */
function FlowMatrixInput({
  matrix, setMatrix, departmentNames,
}: { matrix: (number | string)[][]; setMatrix: (m: (number | string)[][]) => void; departmentNames: string[]; }) {
  const n = departmentNames.length;
  React.useEffect(() => { if (matrix.length !== n) setMatrix(Array.from({ length: n }, () => Array(n).fill(0))); }, [n]);
  function handleChange(i: number, j: number, val: string) {
    const v = Number(val); const next = matrix.map((r) => [...r]); next[i][j] = isNaN(v) ? 0 : v; setMatrix(next);
  }
  if (n === 0) return null;
  return (
    <div className="my-2">
      <div className="font-semibold text-[#f0f6fc] mb-2">Flow / Workload</div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse bg-white/10 text-xs text-[#e0f2fe]">
          <thead><tr><th className="border px-2 py-1 bg-[#334155]">To/From</th>{departmentNames.map((n, i) => <th key={i} className="border px-2 py-1 bg-[#334155]">{n}</th>)}</tr></thead>
          <tbody>
            {departmentNames.map((from, i) => (
              <tr key={i}>
                <th className="border px-2 py-1 bg-[#334155]">{from}</th>
                {departmentNames.map((to, j) => (
                  <td className="border px-1 py-1" key={j}>
                    <input type="number" value={(matrix[i]?.[j] ?? 0) as any} onChange={(e) => handleChange(i, j, e.target.value)} className="w-14 px-1 py-1 rounded text-[#0f172a] bg-white/80 text-center border"/>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const VALID = new Set(["A", "E", "I", "O", "U", "X", ""]);
function ClosenessMatrixInput({ matrix, setMatrix, departmentNames }: { matrix: string[][]; setMatrix: (m: string[][]) => void; departmentNames: string[]; }) {
  function handleChange(i: number, j: number, val: string) {
    const v = val.trim().toUpperCase(); const next = matrix.map((r) => [...r]);
    while (next.length <= i) next.push([]); while ((next[i] ?? []).length <= j) next[i].push("");
    next[i][j] = VALID.has(v as any) ? v : ""; setMatrix(next);
  }
  if (!departmentNames.length) return null;
  return (
    <div className="my-2">
      <div className="font-semibold text-[#f0f6fc] mb-2">Closeness (A/E/I/O/U/X)</div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse bg-white/10 text-xs text-[#e0f2fe]">
          <thead><tr><th className="border px-2 py-1 bg-[#334155]">To/From</th>{departmentNames.map((n, i) => <th key={i} className="border px-2 py-1 bg-[#334155]">{n}</th>)}</tr></thead>
          <tbody>
            {departmentNames.map((from, i) => (
              <tr key={i}>
                <th className="border px-2 py-1 bg-[#334155]">{from}</th>
                {departmentNames.map((to, j) => (
                  <td key={j} className="border px-1 py-1">
                    <input value={matrix[i]?.[j] ?? ""} onChange={(e) => handleChange(i, j, e.target.value)} placeholder="-" maxLength={1} className="w-12 px-1 py-1 rounded text-[#0f172a] bg-white/80 text-center border uppercase"/>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] mt-1 text-white/70">Diagonal ถูกตั้งเป็น X อัตโนมัติ</div>
    </div>
  );
}

/* ---------- Weights panel ---------- */
function WeightsPanel({
  weights, setWeights,
}: { weights: Record<"A" | "E" | "I" | "O" | "U" | "X" | "blank", number>; setWeights: (w: Record<"A" | "E" | "I" | "O" | "U" | "X" | "blank", number>) => void; }) {
  const F = (k: keyof typeof weights) => (
    <div className="flex items-center gap-2"><label className="w-12 text-[#f0f6fc] text-sm">{k}</label>
      <input type="number" value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} className="w-20 border px-2 py-1 rounded bg-white/80 text-[#002b5c]"/>
    </div>
  );
  return (<div className="space-y-2"><div className="font-semibold text-[#f0f6fc]">Weights</div>
    <div className="grid grid-cols-3 gap-2">{F("A")}{F("E")}{F("I")}{F("O")}{F("U")}{F("X")}{F("blank")}</div></div>);
}

/* ---------- Dept protos (cells) ---------- */
function DeptProtoPanel({
  protos, setProtos, cellSize, setCellSize, gridW, gridH, setGridW, setGridH,
}: {
  protos: DeptProto[];
  setProtos: React.Dispatch<React.SetStateAction<DeptProto[]>>;
  cellSize: number; setCellSize: (v: number) => void;
  gridW: number; gridH: number; setGridW: (v: number) => void; setGridH: (v: number) => void;
}) {
  const [row, setRow] = useState<{ name?: string; cells?: number; fixed?: boolean }>({});

  function add() {
    if (!row.name?.trim()) return alert("ใส่ชื่อแผนกก่อน");
    if (!row.cells || row.cells <= 0) return alert("กรอกจำนวนช่องให้ถูกต้อง");
    setProtos((prev) => [...prev, { id: `proto_${Date.now()}`, name: row.name!.trim(), area: Number(row.cells), fixed: !!row.fixed }]);
    setRow({});
  }
  function remove(id: string) { setProtos((prev) => prev.filter((p) => p.id !== id)); }

  const cellArea = cellSize * cellSize; // m²

  return (
    <div className="space-y-3">
      <div className="font-semibold text-[#f0f6fc]">กำหนดขนาด 1 Cell</div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs text-[#f0f6fc]">ด้านต่อด้าน (เมตร)</label>
          <input type="number" min={0.5} step={0.5} value={cellSize}
                 onChange={(e) => setCellSize(Number(e.target.value))}
                 className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]"/>
        </div>
        <div className="text-[#e0f2fe] text-sm pb-1">→ 1 cell = {cellSize}×{cellSize} m = {cellArea} m²</div>
      </div>

      <div className="font-semibold text-[#f0f6fc]">ขนาดแคนวาส (จำนวนช่อง)</div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-[#f0f6fc]">กว้าง (cells)</label>
          <input type="number" min={5} max={300} value={gridW} onChange={(e) => setGridW(Number(e.target.value))}
                 className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]"/>
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#f0f6fc]">สูง (cells)</label>
          <input type="number" min={5} max={300} value={gridH} onChange={(e) => setGridH(Number(e.target.value))}
                 className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]"/>
        </div>
      </div>

      <div className="font-semibold text-[#f0f6fc] mt-2">เพิ่มแผนก (ระบุจำนวนช่อง)</div>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="ชื่อแผนก" value={row.name || ""} onChange={(e) => setRow((r) => ({ ...r, name: e.target.value }))}
               className="border px-2 py-1 rounded bg-white/80 text-[#002b5c]"/>
        <input placeholder="จำนวนช่อง (cells)" type="number" min={1} value={row.cells ?? ""}
               onChange={(e) => setRow((r) => ({ ...r, cells: e.target.value ? Number(e.target.value) : undefined }))}
               className="border px-2 py-1 rounded bg-white/80 text-[#002b5c]"/>
        <div className="flex items-center gap-2 col-span-2">
          <input id="fixedproto" type="checkbox" checked={!!row.fixed}
                 onChange={(e) => setRow((r) => ({ ...r, fixed: e.target.checked }))}/>
          <label htmlFor="fixedproto" className="text-[#f0f6fc] text-sm">fixed?</label>
        </div>
        <button onClick={add} type="button" className="col-span-2 bg-gradient-to-r from-blue-500 to-green-400 text-white py-1 rounded font-bold">+ เพิ่ม</button>
      </div>

      <div className="bg-white/20 rounded p-2">
        {protos.length === 0 ? <div className="text-white/70 text-sm">ยังไม่มี prototype</div> : (
          <ul className="space-y-1">
            {protos.map((p) => (
              <li key={p.id} className="flex justify-between items-center text-[#e0f2fe] text-sm">
                <span>{p.name} (cells={p.area ?? 0}){p.fixed && <em className="text-amber-300 ml-1"> [fixed]</em>}</span>
                <button onClick={() => remove(p.id)} className="text-red-300 hover:text-red-500">ลบ</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- modal ---------- */
function ProjectModal({ open, defaultName = "", onSubmit }: { open: boolean; defaultName?: string; onSubmit: (p: { id: string; name: string }) => void; }) {
  const [name, setName] = React.useState(defaultName); const [loading, setLoading] = React.useState(false);
  React.useEffect(() => setName(defaultName), [defaultName]);
  if (!open) return null;
  async function handleCreate() {
    if (!name.trim()) return alert("กรุณากรอกชื่อโปรเจกต์");
    setLoading(true);
    const res = await fetch(`${API_BASE}/craft/project`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, userId: 1 }) });
    const data = await res.json(); setLoading(false);
    if (!data?.id) return alert("สร้างโปรเจกต์ไม่สำเร็จ");
    onSubmit({ id: data.id, name: data.name ?? name });
  }
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-black rounded-xl p-6 max-w-xs w-full shadow-2xl">
        <div className="font-bold text-lg mb-3 text-white">สร้างโปรเจกต์ใหม่</div>
        <input className="w-full border px-2 py-1 rounded mb-3 bg-white/90 text-slate-900" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <button onClick={handleCreate} className="bg-blue-600 text-white font-bold rounded px-4 py-2 disabled:opacity-60" disabled={loading}>{loading ? "กำลังสร้าง..." : "สร้างโปรเจกต์"}</button>
        </div>
      </div>
    </div>
  );
}

/* ======================== MAIN ======================== */
export default function PlantLayout() {
  const [mode, setMode] = useState<Mode>("CRAFT");

  // CRAFT
  const [layout, setLayout] = useState<Dept[]>([]);
  const [gridSize, setGridSize] = useState(30);
  const [distanceType, setDistanceType] = useState<"manhattan" | "euclidean">("manhattan");
  const [flowMatrix, setFlowMatrix] = useState<(number | string)[][]>([]);

  // CORELAP/ALDEP (build)
  const [deptProtos, setDeptProtos] = useState<DeptProto[]>([]);
  const [cellSize, setCellSize] = useState(5);     // meters per side
  const [gridW, setGridW] = useState(30);          // cells
  const [gridH, setGridH] = useState(30);          // cells
  const [weights, setWeights] = useState({ A: 10, E: 8, I: 6, O: 4, U: 2, X: 0, blank: 0 });

  // shared
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState(""); const [projectName, setProjectName] = useState("");
  const [showProjectModal, setShowProjectModal] = useState(true);
  const [layoutName, setLayoutName] = useState("");
  const [closenessMatrix, setClosenessMatrix] = useState<string[][]>([]);
  const departmentOnly = layout.filter((d) => d.type !== "void");

  const departmentNames = React.useMemo(() => (mode === "CRAFT" ? departmentOnly.map((d) => d.name) : deptProtos.map((d) => d.name)), [mode, departmentOnly, deptProtos]);

  React.useEffect(() => {
    const n = departmentNames.length;
    if (mode === "CRAFT") {
      setFlowMatrix((prev) => (prev.length === n && (n === 0 || prev[0]?.length === n) ? prev : Array.from({ length: n }, () => Array(n).fill(0))));
    }
  }, [departmentNames.length, mode]);

  React.useEffect(() => {
    const n = departmentNames.length;
    setClosenessMatrix((prev) => {
      if (prev.length === n && (n === 0 || prev[0]?.length === n)) return prev;
      const M = Array.from({ length: n }, () => Array(n).fill(""));
      for (let i = 0; i < n; i++) M[i][i] = "X";
      return M;
    });
  }, [departmentNames.length]);

  const [optimized, setOptimized] = useState<{ assignment: Dept[]; totalCost?: number; totalDistance?: number; } | null>(null);

  /* ---------- submit: CRAFT ---------- */
async function handleSubmitLayout() {
  setLoading(true); setResult(null); setOptimized(null);
  try {
    if (!projectId) { setShowProjectModal(true); setLoading(false); return; }
    if (layout.length === 0) { alert("โปรดเพิ่มแผนกอย่างน้อย 1 แผนก"); setLoading(false); return; }

    // normalize positions ให้เริ่มที่ 0,0
    const minX = Math.min(...layout.map((d) => d.x)), minY = Math.min(...layout.map((d) => d.y));
    const departments = layout.map(({ id, gridSize: _gs, ...rest }) => ({
      ...rest,
      x: rest.x - minX,
      y: rest.y - minY,
      type: (rest.type === "void" ? "void" : "dept") as "dept" | "void",
      locked: !!rest.locked,
    }));

    const n = departmentNames.length;

    const flow = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        const v = Number((flowMatrix?.[i]?.[j] ?? 0));
        return Number.isFinite(v) ? v : 0;
      })
    );

    if (!(flowMatrix.length === n && flowMatrix.every((r) => r.length === n)
       && closenessMatrix.length === n && closenessMatrix.every((r) => r.length === n))) {
      alert("Matrix size not match with n of depts");
      setLoading(false);
      return;
    }

    const payload = {
      name: layoutName || `Layout ${new Date().toLocaleString()}`,
      gridSize,
      projectId: Number(projectId) || projectId, // แปลงเป็นตัวเลข
      departments,
      flowMatrix: flow,
      closenessMatrix: close,
      metric: distanceType,
    };

    const createRes = await fetch(`${API_BASE}/craft/layout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await createRes.text();
    let createData: any = null;
    try { createData = raw ? JSON.parse(raw) : null; } catch { createData = { raw }; }

    if (!createRes.ok) {
      console.error("Create layout failed", createRes.status, createData);
      alert(createData?.error || createData?.message || `Create failed: HTTP ${createRes.status}`);
      setLoading(false);
      return;
    }

    const layoutId =
      createData?.layoutId ??
      createData?.id ??
      createData?.result?.layoutId ??
      createData?.layout?.id ??
      createData?.data?.layoutId ??
      createData?.data?.id ??
      createData?.resultJson?.layoutId ??
      null;

    if (!layoutId) {
      console.warn("Unknown createData shape:", createData);
      alert("Backend ไม่คืน layoutId");
      setLoading(false);
      return;
    }

    const res = await fetch(`${API_BASE}/craft/result?layoutId=${encodeURIComponent(layoutId)}`);
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      console.error("Fetch result failed", res.status, data);
      alert(data?.error || data?.message || `Fetch result failed: HTTP ${res.status}`);
      setLoading(false);
      return;
    }

    const assignmentRaw =
      (Array.isArray(data?.assignment) && data.assignment) ||
      (Array.isArray(data?.resultJson?.assignment) && data.resultJson.assignment) ||
      (Array.isArray(data?.placements) && data.placements) ||
      [];

    setResult({ ...data, assignment: assignmentRaw });

    if (assignmentRaw.length) {
      const overlay = assignmentRaw.map((d: any) => ({
        id: d.id || d.name,
        name: d.name,
        width: d.width,
        height: d.height,
        x: d.x,
        y: d.y,
        gridSize,
      }));
      setOptimized({
        assignment: overlay,
        totalCost: data?.totalCost ?? data?.resultJson?.totalCost ?? data?.score?.total,
        totalDistance: data?.totalDistance ?? data?.resultJson?.totalDistance ?? data?.score?.closeness,
      });
    }
  } catch (err) {
    console.error(err);
    alert("ส่ง layout หรือดึงผลลัพธ์ไม่สำเร็จ");
  } finally {
    setLoading(false);
  }
}

  /* ---------- generate: CORELAP/ALDEP (cells) ---------- */
  async function handleGenerateCorelapAldep() {
    try {
      setLoading(true); setResult(null); setOptimized(null);
      if (!projectId) { setShowProjectModal(true); setLoading(false); return; }
      if (deptProtos.length === 0) { alert("เพิ่ม Prototype แผนกก่อน"); setLoading(false); return; }

      const required = sumCells(deptProtos), capacity = gridW * gridH;
      if (required > capacity) { alert(`Grid เล็กเกินไป: ต้องใช้ ${required} cells แต่มี ${capacity} cells`); setLoading(false); return; }

      const M = sanitizeCloseness(departmentNames, closenessMatrix);
      const payload = {
        name: layoutName || `Generated ${new Date().toLocaleString()}`,
        projectId, gridWidth: gridW, gridHeight: gridH,
        algorithm: mode.toLowerCase(), // 'corelap' | 'aldep'
        departments: deptProtos.map((p) => ({ name: p.name, fixed: !!p.fixed, area: p.area })), // area = cells
        closenessMatrix: M, weights,
        cellSizeMeters: cellSize, // เผื่อ BE อยากเก็บ (ไม่บังคับ)
        settings: mode === "ALDEP" ? { aldep: { aisleWidth: 1, stripHeuristic: "row", seeds: 5 } } : { seedRule: "maxDegree", candidateCount: 8 },
        allowSplitting: true,
        maxFragmentsPerDept: 3,
      };

      const endpoint = mode === "CORELAP" ? `${API_BASE}/corelap/generate` : `${API_BASE}/aldep/generate`;
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
      if (!res.ok) { alert(data?.error || data?.message || text || `HTTP ${res.status}`); console.error(`${mode} ${res.status}`, { payload, data }); return; }

      const first = Array.isArray(data?.candidates) ? data.candidates[0] : data;
      const assignment = first?.placements || first?.assignment || [];
      if (!assignment?.length) { alert(data?.error || "ไม่พบผลลัพธ์จากตัวสร้างผัง"); return; }

      const canvasGrid = Math.max(gridW, gridH);
      const overlay = assignment.map((d: any) => ({
        id: d.id || d.name,
        name: d.name,
        width: d.width,
        height: d.height,
        x: d.x,
        y: d.y,
        gridSize: canvasGrid,
        type: "dept" as DeptType
      }));
      setOptimized({
        assignment: overlay,
        totalCost: first?.score?.total ?? undefined,
        totalDistance: first?.score?.closeness ?? undefined
      });
      setResult(first);
    } catch (e) {
      alert("Generate ล้มเหลว กรุณาตรวจ backend");
      console.error(e);
    } finally { setLoading(false); }
  }

  function handleProjectCreated(p: { id: string; name: string }) { setProjectId(p.id); setProjectName(p.name); setShowProjectModal(false); }
  function handleLogout() { window.location.href = "/login"; }
  function handleWheel(e: React.WheelEvent) { if (e.ctrlKey) { e.preventDefault(); setZoom((z) => Math.min(3, Math.max(0.5, z - e.deltaY * 0.001))); } }

  const handleAddDept = (d: Dept) => setLayout((prev) => [...prev, d]);
  const handleDeleteDept = (id: string) => setLayout((prev) => prev.filter((d) => d.id !== id));
  const handleToggleLock = (id: string) => setLayout((prev) => prev.map((d) => (d.id === id ? { ...d, locked: !d.locked } : d)));

  const diffs = React.useMemo(() => {
    if (!optimized?.assignment?.length) return [];
    return optimized.assignment.map((o) => {
      const cur = layout.find((l) => l.name === o.name);
      if (!cur) return null;
      if (cur.x !== o.x || cur.y !== o.y) return { name: o.name, from: { x: cur.x, y: cur.y }, to: { x: o.x, y: o.y } };
      return null;
    }).filter(Boolean) as any[];
  }, [optimized, layout]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#001d3d]">
      <ProjectModal open={showProjectModal} defaultName={projectName} onSubmit={handleProjectCreated} />

      <div className="flex-1 flex items-center justify-center overflow-auto bg-[#002b5c]" onWheel={handleWheel}>
        <div className="flex items-center justify-center w-full h-full" style={{ minHeight: CANVAS_SIZE, minWidth: CANVAS_SIZE }}>
          <div style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
            <GridArea
              layout={layout} setLayout={setLayout}
              gridSize={mode === "CRAFT" ? gridSize : Math.max(gridW, gridH)}
              onLayoutChange={() => {}} overlayAssignment={optimized?.assignment || null}
              draggableEnabled={mode === "CRAFT"}
            />
          </div>
        </div>
      </div>

      <div className="w-full max-w-[470px] min-w-[310px] h-full px-5 py-7 bg-white/20 backdrop-blur-md border-l border-white/30 shadow-2xl flex flex-col gap-6 overflow-y-auto">
        <div className="flex flex-wrap justify-between gap-2 items-center">
          <div className="flex gap-2 items-center">
            <span className="text-[#f0f6fc] font-semibold">Mode:</span>
            <select value={mode} onChange={(e) => { setMode(e.target.value as Mode); setOptimized(null); }} className="bg-white/80 text-slate-900 px-2 py-1 rounded">
              <option value="CRAFT">CRAFT (start from initial layout)</option>
              <option value="CORELAP">CORELAP (build from closeness)</option>
              <option value="ALDEP">ALDEP (strip/row heuristic)</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setShowProjectModal(true)} className="bg-slate-600 text-white font-bold px-4 py-2 rounded-lg shadow"> {projectName ? `Project: ${projectName}` : "Select Project"} </button>
            <button onClick={handleLogout} className="bg-gradient-to-r from-blue-600 to-green-400 text-white font-bold px-4 py-2 rounded-lg shadow">Logout</button>
            <button onClick={() => (mode === "CRAFT" ? handleSubmitLayout() : handleGenerateCorelapAldep())}
                    className="bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold px-4 py-2 rounded-lg shadow" disabled={loading}>
              {loading ? "Loading..." : mode === "CRAFT" ? "Submit Layout" : "Generate Layout"}
            </button>
          </div>
        </div>

        {optimized?.assignment?.length ? (
          <div className="p-3 rounded bg-emerald-900/20 border border-emerald-500/40 text-emerald-100 space-y-2">
            <div className="font-semibold">Optimized preview ready</div>
            <div className="text-sm">
              Moves: {diffs.length || 0}
              {"totalCost" in (result || {}) && (<div>New Total Cost: <span className="font-bold">{result?.totalCost ?? result?.score?.total ?? "-"}</span></div>)}
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded bg-emerald-600 text-white" onClick={() => {
                setLayout((prev) => {
                  const byName = new Map(prev.map((d) => [d.name, d]));
                  const gridApplied = mode === "CRAFT" ? gridSize : Math.max(gridW, gridH);
                  return optimized!.assignment.map((o) => {
                    const old = byName.get(o.name);
                    return { ...(old ?? o), ...o, gridSize: gridApplied, type: (old?.type ?? "dept") as DeptType, locked: old?.locked ?? false };
                  });
                });
                setOptimized(null);
              }}>Apply optimized layout</button>
              <button className="px-3 py-2 rounded bg-slate-600 text-white" onClick={() => setOptimized(null)}>Discard</button>
            </div>
          </div>
        ) : null}

        <div>
          <label className="block mb-1 font-semibold text-[#f0f6fc]">Layout Name</label>
          <input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} placeholder="Layout Name"
                 className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold mb-2"/>
        </div>

        {mode === "CRAFT" ? (
          <div>
            <label className="block mb-1 font-semibold text-[#f0f6fc]">ขนาดกริด (cells ต่อด้าน):</label>
            <input type="number" min={5} max={100} value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}
                   className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold"/>
          </div>
        ) : (
          <DeptProtoPanel
            protos={deptProtos} setProtos={setDeptProtos}
            cellSize={cellSize} setCellSize={setCellSize}
            gridW={gridW} gridH={gridH} setGridW={setGridW} setGridH={setGridH}
          />
        )}

        <div className="mt-2">
          <div className="flex gap-2 mb-2">
            <button className={`px-3 py-1 rounded ${mode === "CRAFT" ? "bg-white text-slate-900" : "bg-white/40 cursor-not-allowed"}`} disabled={mode !== "CRAFT"}>Flow/Workload Matrix</button>
            <button className="px-3 py-1 rounded bg-white/70 text-slate-900">Closeness Matrix</button>
          </div>
          {mode === "CRAFT" && (<FlowMatrixInput matrix={flowMatrix} setMatrix={setFlowMatrix} departmentNames={departmentNames} />)}
          <ClosenessMatrixInput matrix={closenessMatrix} setMatrix={setClosenessMatrix} departmentNames={departmentNames} />
        </div>

        {mode === "CRAFT" && (
          <div className="mb-3">
            <div className="font-semibold text-[#f0f6fc] mb-1">ระยะทาง</div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1 text-[#e0f2fe] text-sm"><input type="radio" name="distanceType" value="manhattan" checked={distanceType === "manhattan"} onChange={() => setDistanceType("manhattan")} /> Manhattan</label>
              <label className="flex items-center gap-1 text-[#e0f2fe] text-sm"><input type="radio" name="distanceType" value="euclidean" checked={distanceType === "euclidean"} onChange={() => setDistanceType("euclidean")} /> Euclidean</label>
            </div>
          </div>
        )}

        {mode !== "CRAFT" && <WeightsPanel weights={weights} setWeights={setWeights} />}

        <div>
          <div className="font-bold text-[#e0f2fe] mb-2">{mode === "CRAFT" ? "CRAFT Result" : "Generated Result"}</div>
          {loading && <div className="text-white/80 mb-2">Loading result...</div>}
          {result ? (
            <div className="bg-white/10 rounded-lg p-3 text-white space-y-1">
              {"totalCost" in result && <div>Total Cost: {result.totalCost ?? result?.score?.total}</div>}
              {"totalDistance" in result && <div>Total Distance: {result.totalDistance ?? result?.score?.closeness}</div>}
              {Array.isArray(result?.assignment || result?.placements) && (
                <div className="max-h-48 overflow-auto pr-1">
                  Assignment (preview):
                  {(result.assignment || result.placements).map((d: any, i: number) => (
                    <div key={i} className="ml-2">{d.name} ({d.x}, {d.y}) size {d.width}x{d.height}</div>
                  ))}
                </div>
              )}
            </div>
          ) : !loading ? <div className="text-white/50">ยังไม่มีผลลัพธ์</div> : null}
        </div>

        {mode === "CRAFT" && (
          <>
            <AddDepartmentForm onAdd={handleAddDept} gridSize={gridSize} />
            <DepartmentList layout={layout} onDelete={handleDeleteDept} onToggleLock={handleToggleLock} />
          </>
        )}
      </div>
    </div>
  );
}

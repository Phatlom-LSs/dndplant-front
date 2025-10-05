"use client";
import React, { useState } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";

const CANVAS_SIZE = 900;
const API_BASE = process.env.NEXT_PUBLIC_CRAFT_CREATE_API as string;

type DeptType = "dept" | "void";
type Closeness = "A" | "E" | "I" | "O" | "U" | "X";
type Mode = "CRAFT" | "CORELAP" | "ALDEP";

const CLOSENESS_WEIGHTS: Record<Closeness | "blank", number> = {
  A: 10,
  E: 8,
  I: 6,
  O: 4,
  U: 2,
  X: 0,
  blank: 0,
};

function toCostMatrixFromLetters(
  letters: (number | string)[][],
  allDepts: { name: string; type?: DeptType }[]
) {
  const n = allDepts.length;
  const out: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = letters?.[i]?.[j] ?? 0;
      if (allDepts[i]?.type === "void" || allDepts[j]?.type === "void") {
        out[i][j] = 0;
      } else if (typeof v === "number") {
        out[i][j] = v;
      } else {
        const key = (v?.toString()?.toUpperCase() || "") as Closeness;
        out[i][j] = CLOSENESS_WEIGHTS[key] ?? CLOSENESS_WEIGHTS.blank;
      }
    }
  }
  return out;
}

type Dept = {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  gridSize?: number;
  type: DeptType;
  locked?: boolean;
  relations?: Record<string, number>;
};

// --- NEW: Dept prototype for CORELAP/ALDEP (no x,y required)
type DeptProto = {
  id: string;
  name: string;
  area?: number;
  width?: number;
  height?: number;
  fixed?: boolean;
  minAspectRatio?: number;
  maxAspectRatio?: number;
};

function getMeter(gridSize: number) {
  return CANVAS_SIZE / gridSize;
}

function DraggableDepartment({ dept }: { dept: Dept }) {
  const disabled = !!dept.locked;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: dept.id,
    disabled,
  });
  const style: React.CSSProperties = {
    position: "absolute",
    top: dept.y * getMeter(dept.gridSize ?? 1),
    left: dept.x * getMeter(dept.gridSize ?? 1),
    width: dept.width * getMeter(dept.gridSize ?? 1),
    height: dept.height * getMeter(dept.gridSize ?? 1),
    background:
      dept.type === "void"
        ? "repeating-linear-gradient(45deg, rgba(255,255,255,.15) 0 8px, rgba(255,255,255,.08) 8px 16px)"
        : "linear-gradient(135deg, #4ade80 80%, #15803d 100%)",
    boxShadow: "0 4px 16px 0 rgb(0 0 0 / 0.18)",
    borderRadius: "0.6rem",
    color: "#002b5c",
    fontWeight: "bold",
    transform: transform
      ? `translate(${transform.x}px, ${transform.y}px)`
      : undefined,
    cursor: disabled ? "not-allowed" : "grab",
    zIndex: 2,
    border: dept.type === "void" ? "2px dashed #94a3b8" : "2px solid #1e293b",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="text-xs flex items-center justify-center select-none relative"
    >
      {dept.name}
      {dept.locked && (
        <div className="absolute top-1 right-1 text-[10px] px-1 rounded bg-amber-500/80 text-white">
          LOCK
        </div>
      )}
    </div>
  );
}

function GhostOverlay({
  assignment,
  gridSize,
}: {
  assignment: Dept[];
  gridSize: number;
}) {
  if (!assignment?.length) return null;
  const meter = getMeter(gridSize);
  return (
    <>
      {assignment.map((dep) => (
        <div
          key={`ghost-${dep.id || dep.name}`}
          style={{
            position: "absolute",
            top: dep.y * meter,
            left: dep.x * meter,
            width: dep.width * meter,
            height: dep.height * meter,
            border: "2px dashed #22c55e",
            background: "rgba(34,197,94,0.18)",
            borderRadius: "0.6rem",
            pointerEvents: "none",
            zIndex: 3,
          }}
          title={`${dep.name} → (${dep.x}, ${dep.y})`}
        />
      ))}
    </>
  );
}

function GridArea({
  layout,
  setLayout,
  gridSize,
  onLayoutChange,
  overlayAssignment,
  draggableEnabled = true,
}: {
  layout: Dept[];
  setLayout: (v: Dept[]) => void;
  gridSize: number;
  onLayoutChange: (v: Dept[]) => void;
  overlayAssignment?: Dept[] | null;
  draggableEnabled?: boolean; // NEW: disable dragging in build modes until applied
}) {
  const { setNodeRef } = useDroppable({ id: "layout" });

  function handleDragEnd(event: any) {
    if (!draggableEnabled) return;
    const { active, delta } = event;
    const deptIndex = layout.findIndex((d) => d.id === active.id);
    if (deptIndex === -1) return;
    const moved = layout[deptIndex];
    if (moved.locked) return;
    const meter = getMeter(gridSize);
    const dx = Math.round(delta.x / meter);
    const dy = Math.round(delta.y / meter);
    const newX = Math.max(0, moved.x + dx);
    const newY = Math.max(0, moved.y + dy);
    const boundedX = Math.min(newX, gridSize - moved.width);
    const boundedY = Math.min(newY, gridSize - moved.height);
    const newLayout = [...layout];
    newLayout[deptIndex] = { ...moved, x: boundedX, y: boundedY };
    setLayout(newLayout);
    onLayoutChange(newLayout);
  }

  const gridColor = "rgba(220,227,240,0.18)";
  const mainBorderColor = "rgba(255,255,255,0.08)";

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div
        ref={setNodeRef}
        className="relative shadow-xl"
        style={{
          width: "100%",
          height: "100%",
          minHeight: CANVAS_SIZE,
          minWidth: CANVAS_SIZE,
          backgroundColor: "#002b5c",
          backgroundImage: `
            linear-gradient(to right, ${gridColor} 1px, transparent 1px), 
            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)
          `,
          backgroundSize: `${getMeter(gridSize)}px ${getMeter(gridSize)}px`,
          border: `2px solid ${mainBorderColor}`,
          borderRadius: "1.5rem",
        }}
      >
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            borderRadius: "1.5rem",
            background:
              "linear-gradient(135deg,rgba(0,0,0,0.05) 30%,rgba(255,255,255,0.06) 100%)",
            zIndex: 1,
          }}
        />

        {layout.map((dept) => (
          <DraggableDepartment key={dept.id} dept={{ ...dept, gridSize }} />
        ))}

        {overlayAssignment?.length ? (
          <GhostOverlay assignment={overlayAssignment} gridSize={gridSize} />
        ) : null}

        {layout.length === 0 && !overlayAssignment?.length && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="rounded-lg px-8 py-4 text-center bg-white/20 text-white/90 text-xl font-bold shadow">
              ← Drag here
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}

function AddDepartmentForm({
  onAdd,
  gridSize,
}: {
  onAdd: (d: Dept) => void;
  gridSize: number;
}) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [isVoid, setIsVoid] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !width || !height || !x || !y)
      return alert("กรุณากรอกข้อมูลให้ครบ");
    const widthNum = Number(width);
    const heightNum = Number(height);
    const xNum = Number(x);
    const yNum = Number(y);
    if (xNum < 0 || yNum < 0 || widthNum <= 0 || heightNum <= 0)
      return alert("ตำแหน่งและขนาดต้องเป็นค่าบวก");
    if (xNum + widthNum > gridSize || yNum + heightNum > gridSize)
      return alert("ตำแหน่งและขนาดเกินพื้นที่ทั้งหมด");
    const newDept: Dept = {
      id: `dept_${Date.now()}`,
      name,
      width: widthNum,
      height: heightNum,
      x: xNum,
      y: yNum,
      type: isVoid ? "void" : "dept",
      gridSize,
    };
    onAdd(newDept);
    setName("");
    setWidth("");
    setHeight("");
    setX("");
    setY("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-[#f0f6fc]">
          ชื่อแผนก
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner focus:ring-2 focus:ring-[#4ade80]"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">กว้าง (ม.)</label>
          <input
            type="number"
            min={1}
            max={gridSize}
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            required
            className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">สูง (ม.)</label>
          <input
            type="number"
            min={1}
            max={gridSize}
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            required
            className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">ตำแหน่ง X</label>
          <input
            type="number"
            min={0}
            max={gridSize}
            value={x}
            onChange={(e) => setX(e.target.value)}
            required
            className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">ตำแหน่ง Y</label>
          <input
            type="number"
            min={0}
            max={gridSize}
            value={y}
            onChange={(e) => setY(e.target.value)}
            required
            className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="isVoid"
          type="checkbox"
          checked={isVoid}
          onChange={(e) => setIsVoid(e.target.checked)}
        />
        <label htmlFor="isVoid" className="text-[#f0f6fc] text-sm">
          เพิ่มเป็น “พื้นที่ว่าง” (void)
        </label>
      </div>
      <button
        type="submit"
        className="w-full bg-gradient-to-r from-blue-500 to-green-400 text-white py-2 rounded-lg font-bold shadow transition hover:scale-[1.03] hover:shadow-lg duration-150"
      >
        + เพิ่มแผนก
      </button>
    </form>
  );
}

function DepartmentList({
  layout,
  onDelete,
  onToggleLock,
}: {
  layout: any[];
  onDelete: (id: string) => void;
  onToggleLock: (id: string) => void;
}) {
  return (
    <div>
      <div className="font-semibold text-[#f0f6fc] mb-2 mt-4">แผนก</div>
      <div className="bg-white/20 rounded-lg p-2 min-h-[40px]">
        {layout.length === 0 ? (
          <p className="text-sm text-white/70">None</p>
        ) : (
          <ul className="space-y-1">
            {layout.map((d) => (
              <li
                key={d.id}
                className="flex justify-between items-center py-1 px-1 rounded hover:bg-white/30"
              >
                <span className="font-medium text-[#e0f2fe]">
                  {d.name}{" "}
                  {d.type === "void" && (
                    <em className="text-white/60"> (void)</em>
                  )}
                  {d.locked && <em className="text-amber-300 ml-1">[locked]</em>}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onToggleLock(d.id)}
                    className="text-xs px-2 py-1 rounded bg-amber-600/70 text-white"
                  >
                    {d.locked ? "Unlock" : "Lock"}
                  </button>
                  <button
                    onClick={() => onDelete(d.id)}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold px-2 py-1 rounded"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FlowMatrixInput({
  matrix,
  setMatrix,
  departmentNames,
}: {
  matrix: (number | string)[][];
  setMatrix: (m: (number | string)[][]) => void;
  departmentNames: string[];
}) {
  const n = departmentNames.length;
  React.useEffect(() => {
    if (matrix.length !== n) {
      setMatrix(Array.from({ length: n }, () => Array(n).fill(0)));
    }
  }, [n]);

  function handleChange(i: number, j: number, val: string) {
    const v = Number(val);
    const next = matrix.map((r) => [...r]);
    next[i][j] = isNaN(v) ? 0 : v;
    setMatrix(next);
  }

  if (n === 0) return null;
  return (
    <div className="my-2">
      <div className="font-semibold text-[#f0f6fc] mb-2">Flow / Workload</div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse bg-white/10 text-xs text-[#e0f2fe]">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-[#334155]">To/From</th>
              {departmentNames.map((name, i) => (
                <th className="border px-2 py-1 bg-[#334155]" key={i}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {departmentNames.map((from, i) => (
              <tr key={i}>
                <th className="border px-2 py-1 bg-[#334155]">{from}</th>
                {departmentNames.map((to, j) => (
                  <td className="border px-1 py-1" key={j}>
                    <input
                      type="number"
                      value={(matrix[i]?.[j] ?? 0) as any}
                      onChange={(e) => handleChange(i, j, e.target.value)}
                      className="w-14 px-1 py-1 rounded text-[#0f172a] bg-white/80 text-center border"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] mt-1 text-white/70">Full number only</div>
    </div>
  );
}

const VALID = new Set(["A", "E", "I", "O", "U", "X", ""]);
function ClosenessMatrixInput({
  matrix,
  setMatrix,
  departmentNames,
}: {
  matrix: string[][];
  setMatrix: (m: string[][]) => void;
  departmentNames: string[];
}) {
  function handleChange(i: number, j: number, val: string) {
    const v = val.trim().toUpperCase();
    const next = matrix.map((r) => [...r]);
    while (next.length <= i) next.push([]);
    while ((next[i] ?? []).length <= j) next[i].push("");
    const safe = VALID.has(v as any) ? v : "";
    next[i][j] = safe;
    setMatrix(next);
  }
  if (!departmentNames.length) return null;
  return (
    <div className="my-2">
      <div className="font-semibold text-[#f0f6fc] mb-2">
        Closeness (A/E/I/O/U/X)
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse bg-white/10 text-xs text-[#e0f2fe]">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-[#334155]">To/From</th>
              {departmentNames.map((name, i) => (
                <th className="border px-2 py-1 bg-[#334155]" key={i}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {departmentNames.map((from, i) => (
              <tr key={i}>
                <th className="border px-2 py-1 bg-[#334155]">{from}</th>
                {departmentNames.map((to, j) => (
                  <td key={j} className="border px-1 py-1">
                    <input
                      value={matrix[i]?.[j] ?? ""}
                      onChange={(e) => handleChange(i, j, e.target.value)}
                      placeholder="-"
                      maxLength={1}
                      className="w-12 px-1 py-1 rounded text-[#0f172a] bg-white/80 text-center border uppercase"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] mt-1 text-white/70">
        A/E/I/O/U/X or Empty - Not included void type
      </div>
    </div>
  );
}

// --- NEW: Weights panel for closeness ratings
function WeightsPanel({
  weights,
  setWeights,
}: {
  weights: Record<"A" | "E" | "I" | "O" | "U" | "X" | "blank", number>;
  setWeights: (w: Record<"A" | "E" | "I" | "O" | "U" | "X" | "blank", number>) => void;
}) {
  function field(k: keyof typeof weights, label: string) {
    return (
      <div className="flex items-center gap-2">
        <label className="w-12 text-[#f0f6fc] text-sm">{label}</label>
        <input
          type="number"
          value={weights[k]}
          onChange={(e) =>
            setWeights({ ...weights, [k]: Number(e.target.value) })
          }
          className="w-20 border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
        />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="font-semibold text-[#f0f6fc]">Weights</div>
      <div className="grid grid-cols-3 gap-2">
        {field("A", "A")}
        {field("E", "E")}
        {field("I", "I")}
        {field("O", "O")}
        {field("U", "U")}
        {field("X", "X")}
        {field("blank", "blank")}
      </div>
    </div>
  );
}

// --- NEW: DeptProto panel (for build-from-graph modes)
function DeptProtoPanel({
  protos,
  setProtos,
  gridWidth,
  gridHeight,
  setGridWidth,
  setGridHeight,
}: {
  protos: DeptProto[];
  setProtos: React.Dispatch<React.SetStateAction<DeptProto[]>>
  gridWidth: number;
  gridHeight: number;
  setGridWidth: (v: number) => void;
  setGridHeight: (v: number) => void;
}) {
  const [row, setRow] = useState<Partial<DeptProto>>({});

  function add() {
    if (!row.name?.trim()) return alert("ใส่ชื่อแผนกก่อน");
    setProtos((prev) => [
      ...prev,
      {
        id: `proto_${Date.now()}`,
        name: row.name!.trim(),
        area: row.area ? Number(row.area) : undefined,
        width: row.width ? Number(row.width) : undefined,
        height: row.height ? Number(row.height) : undefined,
        fixed: !!row.fixed,
        minAspectRatio: row.minAspectRatio
          ? Number(row.minAspectRatio)
          : undefined,
        maxAspectRatio: row.maxAspectRatio
          ? Number(row.maxAspectRatio)
          : undefined,
      },
    ]);
    setRow({});
  }

  function remove(id: string) {
    setProtos((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="font-semibold text-[#f0f6fc]">Grid size (for build)</div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-[#f0f6fc]">Width (cells)</label>
          <input
            type="number"
            min={5}
            max={200}
            value={gridWidth}
            onChange={(e) => setGridWidth(Number(e.target.value))}
            className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#f0f6fc]">Height (cells)</label>
          <input
            type="number"
            min={5}
            max={200}
            value={gridHeight}
            onChange={(e) => setGridHeight(Number(e.target.value))}
            className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
          />
        </div>
      </div>

      <div className="font-semibold text-[#f0f6fc] mt-2">Add prototypes</div>
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="ชื่อแผนก"
          value={row.name || ""}
          onChange={(e) => setRow((r) => ({ ...r, name: e.target.value }))}
          className="border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
        />
        <label className="text-[#f0f6fc] text-xs self-center">
          Use area *or* width/height
        </label>
        <input
          placeholder="area (cells)"
          type="number"
          value={row.area ?? ""}
          onChange={(e) =>
            setRow((r) => ({
              ...r,
              area: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
          className="border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
        />
        <div className="flex gap-2">
          <input
            placeholder="w"
            type="number"
            value={row.width ?? ""}
            onChange={(e) =>
              setRow((r) => ({
                ...r,
                width: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="border px-2 py-1 rounded bg-white/80 text-[#002b5c] w-20"
          />
          <input
            placeholder="h"
            type="number"
            value={row.height ?? ""}
            onChange={(e) =>
              setRow((r) => ({
                ...r,
                height: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="border px-2 py-1 rounded bg-white/80 text-[#002b5c] w-20"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="fixedproto"
            type="checkbox"
            checked={!!row.fixed}
            onChange={(e) => setRow((r) => ({ ...r, fixed: e.target.checked }))}
          />
          <label htmlFor="fixedproto" className="text-[#f0f6fc] text-sm">
            fixed?
          </label>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="min AR (w/h)"
            type="number"
            step="0.1"
            value={row.minAspectRatio ?? ""}
            onChange={(e) =>
              setRow((r) => ({
                ...r,
                minAspectRatio: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              }))
            }
            className="border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
          />
          <input
            placeholder="max AR"
            type="number"
            step="0.1"
            value={row.maxAspectRatio ?? ""}
            onChange={(e) =>
              setRow((r) => ({
                ...r,
                maxAspectRatio: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              }))
            }
            className="border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
          />
        </div>
        <button
          onClick={add}
          type="button"
          className="col-span-2 bg-gradient-to-r from-blue-500 to-green-400 text-white py-1 rounded font-bold"
        >
          + เพิ่ม
        </button>
      </div>

      <div className="bg-white/20 rounded p-2">
        {protos.length === 0 ? (
          <div className="text-white/70 text-sm">ยังไม่มี prototype</div>
        ) : (
          <ul className="space-y-1">
            {protos.map((p) => (
              <li
                key={p.id}
                className="flex justify-between items-center text-[#e0f2fe] text-sm"
              >
                <span>
                  {p.name}{" "}
                  {p.area
                    ? `(area=${p.area})`
                    : `(${p.width ?? "?"}x${p.height ?? "?"})`}{" "}
                  {p.fixed && <em className="text-amber-300 ml-1">[fixed]</em>}
                </span>
                <button
                  onClick={() => remove(p.id)}
                  className="text-red-300 hover:text-red-500"
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProjectModal({
  open,
  defaultName = "",
  onSubmit,
}: {
  open: boolean;
  defaultName?: string;
  onSubmit: (p: { id: string; name: string }) => void;
}) {
  const [name, setName] = React.useState(defaultName);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => setName(defaultName), [defaultName]);

  if (!open) return null;

  async function handleCreate() {
    if (!name.trim()) return alert("กรุณากรอกชื่อโปรเจกต์");
    setLoading(true);
    const userId = 1;
    const res = await fetch(`${API_BASE}/craft/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, userId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!data?.id) return alert("สร้างโปรเจกต์ไม่สำเร็จ");
    onSubmit({ id: data.id, name: data.name ?? name });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-black rounded-xl p-6 max-w-xs w-full shadow-2xl">
        <div className="font-bold text-lg mb-3 text-white">สร้างโปรเจกต์ใหม่</div>
        <input
          className="w-full border px-2 py-1 rounded mb-3 bg-white/90 text-slate-900"
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleCreate}
            className="bg-blue-600 text-white font-bold rounded px-4 py-2 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "กำลังสร้าง..." : "สร้างโปรเจกต์"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlantLayout() {
  // --- modes and shared states
  const [mode, setMode] = useState<Mode>("CRAFT");

  // CRAFT states
  const [layout, setLayout] = useState<Dept[]>([]);
  const [gridSize, setGridSize] = useState(30);
  const [distanceType, setDistanceType] = useState<"manhattan" | "euclidean">(
    "manhattan"
  );
  const [flowMatrix, setFlowMatrix] = useState<(number | string)[][]>([]);

  // CORELAP/ALDEP build states
  const [deptProtos, setDeptProtos] = useState<DeptProto[]>([]);
  const [gridWidth, setGridWidth] = useState(30);
  const [gridHeight, setGridHeight] = useState(30);
  const [weights, setWeights] = useState({
    A: 10,
    E: 8,
    I: 6,
    O: 4,
    U: 2,
    X: 0,
    blank: 0,
  });

  // shared
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [showProjectModal, setShowProjectModal] = useState(true);
  const [layoutName, setLayoutName] = useState("");

  const [closenessMatrix, setClosenessMatrix] = useState<string[][]>([]);
  const departmentOnly = layout.filter((d) => d.type !== "void");

  // --- departmentNames switches source by mode
  const departmentNames = React.useMemo(() => {
    if (mode === "CRAFT") {
      return departmentOnly.map((d) => d.name);
    }
    return deptProtos.map((d) => d.name);
  }, [mode, departmentOnly, deptProtos]);

  // Align matrices with names length
  React.useEffect(() => {
    const n = departmentNames.length;
    setFlowMatrix((prev) => {
      if (mode !== "CRAFT") return prev;
      if (prev.length === n && (n === 0 || prev[0]?.length === n)) return prev;
      return Array.from({ length: n }, () => Array(n).fill(0));
    });
  }, [departmentNames.length, mode]);

  React.useEffect(() => {
    const n = departmentNames.length;
    setClosenessMatrix((prev) => {
      if (prev.length === n && (n == 0 || prev[0]?.length === n)) return prev;
      return Array.from({ length: n }, () => Array(n).fill(""));
    });
  }, [departmentNames.length]);

  const [optimized, setOptimized] = useState<{
    assignment: Dept[];
    totalCost?: number;
    totalDistance?: number;
  } | null>(null);

  async function handleSubmitLayout() {
    // CRAFT: uses existing layout + flow/closeness as you already had
    setLoading(true);
    setResult(null);
    setOptimized(null);
    try {
      if (!projectId) {
        setShowProjectModal(true);
        setLoading(false);
        return;
      }
      if (layout.length === 0) {
        alert("โปรดเพิ่มแผนกอย่างน้อย 1 แผนก");
        setLoading(false);
        return;
      }

      const minX = Math.min(...layout.map((d) => d.x));
      const minY = Math.min(...layout.map((d) => d.y));
      const departments = layout.map(({ id, gridSize: _gs, ...rest }) => ({
        ...rest,
        x: rest.x - minX,
        y: rest.y - minY,
        type: (rest.type ?? "dept") as DeptType,
        locked: !!rest.locked,
      }));

      const payload = {
        name: layoutName || `Layout ${new Date().toLocaleString()}`,
        gridSize,
        projectId,
        departments,
        flowMatrix,
        closenessMatrix,
        metric: distanceType,
      };

      const n = departmentNames.length;
      const flowOK =
        flowMatrix.length === n && flowMatrix.every((r) => r.length === n);
      const closeOK =
        closenessMatrix.length === n &&
        closenessMatrix.every((r) => r.length === n);
      if (!flowOK || !closeOK) {
        alert("Matrix size not match with n of depts");
        setLoading(false);
        return;
      }

      const createRes = await fetch(`${API_BASE}/craft/layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const createData = await createRes.json();
      const layoutId =
        createData.layoutId ||
        createData.id ||
        createData?.result?.layoutId;
      if (!layoutId) {
        alert("Backend ไม่คืน layoutId กรุณาตรวจสอบ backend");
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/craft/result?layoutId=${layoutId}`);
      const data = await res.json();
      const assignmentRaw = Array.isArray(data.assignment)
        ? data.assignment
        : Array.isArray(data.resultJson?.assignment)
        ? data.resultJson.assignment
        : [];
      setResult({
        ...data,
        assignment: assignmentRaw,
      });

      if (assignmentRaw.length) {
        const overlay = assignmentRaw.map((dep: any) => ({
          id: dep.id || dep.name,
          name: dep.name,
          width: dep.width,
          height: dep.height,
          x: dep.x,
          y: dep.y,
          gridSize,
        }));
        setOptimized({
          assignment: overlay,
          totalCost: data.totalCost ?? data.resultJson?.totalCost,
          totalDistance: data.totalDistance ?? data.resultJson?.totalDistance,
        });
      }

      setLoading(false);
    } catch (err) {
      alert("ส่ง layout หรือดึงผลลัพธ์ไม่สำเร็จ");
      setLoading(false);
    }
  }

  // --- NEW: Generate for CORELAP/ALDEP (build-from-graph)
  async function handleGenerateCorelapAldep() {
    try {
      setLoading(true);
      setResult(null);
      setOptimized(null);

      if (!projectId) {
        setShowProjectModal(true);
        setLoading(false);
        return;
      }
      const n = departmentNames.length;
      const closeOK =
        closenessMatrix.length === n &&
        closenessMatrix.every((r) => r.length === n);
      if (!closeOK) {
        alert("Closeness matrix ต้องเป็น NxN ตามจำนวนแผนก");
        setLoading(false);
        return;
      }
      if (deptProtos.length === 0) {
        alert("เพิ่ม Prototype แผนกก่อน");
        setLoading(false);
        return;
      }

      const payload = {
        name: layoutName || `Generated ${new Date().toLocaleString()}`,
        projectId,
        gridWidth,
        gridHeight,
        algorithm: mode.toLowerCase(), // 'corelap' | 'aldep'
        departments: deptProtos.map((p) => ({
          name: p.name,
          fixed: !!p.fixed,
          width: p.width || undefined,
          height: p.height || undefined,
          area:
            !p.width || !p.height ? (p.area ?? undefined) : undefined,
          minAspectRatio: p.minAspectRatio ?? undefined,
          maxAspectRatio: p.maxAspectRatio ?? undefined,
        })),
        closenessMatrix,
        weights,
        settings:
          mode === "ALDEP"
            ? { aldep: { aisleWidth: 1, stripHeuristic: "row", seeds: 5 } }
            : { seedRule: "maxDegree", candidateCount: 8 },
      };

      const endpoint =
        mode === "CORELAP"
          ? `${API_BASE}/corelap/generate`
          : `${API_BASE}/aldep/generate`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      // accept either {candidates: [...] } or a single result
      const first = Array.isArray(data?.candidates) ? data.candidates[0] : data;
      const assignment = first?.placements || first?.assignment || [];
      if (!assignment.length) {
        alert("ไม่พบผลลัพธ์จากตัวสร้างผัง");
        setLoading(false);
        return;
      }

      // NOTE: canvas uses square gridSize; we render with max(gridWidth, gridHeight)
      const canvasGrid = Math.max(gridWidth, gridHeight);
      const overlay = assignment.map((dep: any) => ({
        id: dep.id || dep.name,
        name: dep.name,
        width: dep.width,
        height: dep.height,
        x: dep.x,
        y: dep.y,
        gridSize: canvasGrid,
        type: "dept" as DeptType,
      }));

      setOptimized({
        assignment: overlay,
        totalCost: first?.score?.total ?? undefined,
        totalDistance: first?.score?.closeness ?? undefined,
      });
      setResult(first);
    } catch (e) {
      alert("Generate ล้มเหลว กรุณาตรวจ backend");
    } finally {
      setLoading(false);
    }
  }

  function handleProjectCreated(p: { id: string; name: string }) {
    setProjectId(p.id);
    setProjectName(p.name);
    setShowProjectModal(false);
  }

  function handleLogout() {
    window.location.href = "/login";
  }

  function handleWheel(e: React.WheelEvent) {
    if (e.ctrlKey) {
      e.preventDefault();
      setZoom((z) => Math.min(3, Math.max(0.5, z - e.deltaY * 0.001)));
    }
  }

  const handleAddDept = (newDept: Dept) =>
    setLayout((prev) => [...prev, newDept]);
  const handleDeleteDept = (id: string) =>
    setLayout((prev) => prev.filter((d) => d.id !== id));

  const handleToggleLock = (id: string) => {
    setLayout((prev) =>
      prev.map((d) => (d.id === id ? { ...d, locked: !d.locked } : d))
    );
  };

  const diffs = React.useMemo(() => {
    if (!optimized?.assignment?.length) return [];
    return optimized.assignment
      .map((o) => {
        const cur = layout.find((l) => l.name === o.name);
        if (!cur) return null;
        if (cur.x !== o.x || cur.y !== o.y) {
          return {
            name: o.name,
            from: { x: cur.x, y: cur.y },
            to: { x: o.x, y: o.y },
          };
        }
        return null;
      })
      .filter(Boolean) as {
      name: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
    }[];
  }, [optimized, layout]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#001d3d]">
      <ProjectModal
        open={showProjectModal}
        defaultName={projectName}
        onSubmit={handleProjectCreated}
      />

      <div
        className="flex-1 flex items-center justify-center overflow-auto bg-[#002b5c]"
        onWheel={handleWheel}
      >
        <div
          className="flex items-center justify-center w-full h-full"
          style={{ minHeight: CANVAS_SIZE, minWidth: CANVAS_SIZE }}
        >
          <div
            style={{
              width: CANVAS_SIZE,
              height: CANVAS_SIZE,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <GridArea
              layout={layout}
              setLayout={setLayout}
              gridSize={
                mode === "CRAFT"
                  ? gridSize
                  : Math.max(gridWidth, gridHeight) // render preview on square canvas
              }
              onLayoutChange={() => {}}
              overlayAssignment={optimized?.assignment || null}
              draggableEnabled={mode === "CRAFT"} // disable drag for build modes until applied
            />
          </div>
        </div>
      </div>

      <div className="w-full max-w-[470px] min-w-[310px] h-full px-5 py-7 bg-white/20 backdrop-blur-md border-l border-white/30 shadow-2xl flex flex-col gap-6 overflow-y-auto">
        <div className="flex flex-wrap justify-between gap-2 items-center">
          {/* Mode switch */}
          <div className="flex gap-2 items-center">
            <span className="text-[#f0f6fc] font-semibold">Mode:</span>
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setOptimized(null);
              }}
              className="bg-white/80 text-slate-900 px-2 py-1 rounded"
              title="เลือกอัลกอริทึม"
            >
              <option value="CRAFT">CRAFT (start from initial layout)</option>
              <option value="CORELAP">CORELAP (build from closeness)</option>
              <option value="ALDEP">ALDEP (strip/row heuristic)</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowProjectModal(true)}
              className="bg-slate-600 text-white font-bold px-4 py-2 rounded-lg shadow hover:scale-[1.04] transition"
              title="Create/Change Project"
            >
              {projectName ? `Project: ${projectName}` : "Select Project"}
            </button>
            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-blue-600 to-green-400 text-white font-bold px-4 py-2 rounded-lg shadow hover:scale-[1.04] transition"
              title="Logout"
            >
              Logout
            </button>
            <button
              onClick={() => {
                if (mode === "CRAFT") return handleSubmitLayout();
                return handleGenerateCorelapAldep();
              }}
              className="bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold px-4 py-2 rounded-lg shadow hover:scale-[1.04] transition"
              title={mode === "CRAFT" ? "Submit Layout (CRAFT)" : "Generate Layout (CORELAP/ALDEP)"}
              disabled={loading}
            >
              {loading
                ? "Loading..."
                : mode === "CRAFT"
                ? "Submit Layout"
                : "Generate Layout"}
            </button>
          </div>
        </div>

        {optimized?.assignment?.length ? (
          <div className="p-3 rounded bg-emerald-900/20 border border-emerald-500/40 text-emerald-100 space-y-2">
            <div className="font-semibold">Optimized preview ready</div>
            <div className="text-sm">
              Moves: {diffs.length || 0}
              {"totalCost" in (result || {}) && (
                <div>
                  New Total Cost:{" "}
                  <span className="font-bold">
                    {result?.totalCost ?? result?.score?.total ?? "-"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-2 rounded bg-emerald-600 text-white"
                onClick={() => {
                  // Apply preview → create real layout items for editing/CRAFT
                  setLayout((prev) => {
                    const mapByName = new Map(prev.map((d) => [d.name, d]));
                    const gridApplied =
                      mode === "CRAFT" ? gridSize : Math.max(gridWidth, gridHeight);
                    return optimized.assignment.map((o) => {
                      const old = mapByName.get(o.name);
                      return {
                        ...(old ?? o),
                        ...o,
                        gridSize: gridApplied,
                        type: (old?.type ?? "dept") as DeptType,
                        locked: old?.locked ?? false,
                      };
                    });
                  });
                  setOptimized(null);
                }}
              >
                Apply optimized layout
              </button>
              <button
                className="px-3 py-2 rounded bg-slate-600 text-white"
                onClick={() => setOptimized(null)}
              >
                Discard
              </button>
            </div>
            {diffs.length > 0 && (
              <div className="text-xs mt-2 space-y-1">
                {diffs.slice(0, 6).map((d, i) => (
                  <div key={i}>
                    {d.name}: ({d.from.x},{d.from.y}) → ({d.to.x},{d.to.y})
                  </div>
                ))}
                {diffs.length > 6 && (
                  <div>...and {diffs.length - 6} more</div>
                )}
              </div>
            )}
          </div>
        ) : null}

        <div>
          <label className="block mb-1 font-semibold text-[#f0f6fc]">
            Layout Name
          </label>
          <input
            type="text"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            placeholder="Layout Name"
            className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold mb-2"
          />
        </div>

        {/* Grid size: CRAFT uses square gridSize; build modes set gridWidth/Height */}
        {mode === "CRAFT" ? (
          <div>
            <label className="block mb-1 font-semibold text-[#f0f6fc]">
              ขนาดกริด (เมตร):
            </label>
            <input
              type="number"
              min={5}
              max={100}
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold"
            />
          </div>
        ) : (
          <DeptProtoPanel
            protos={deptProtos}
            setProtos={setDeptProtos}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            setGridWidth={setGridWidth}
            setGridHeight={setGridHeight}
          />
        )}

        {/* Matrices */}
        <div className="mt-2">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => {}}
              className={`px-3 py-1 rounded ${
                mode === "CRAFT" ? "bg-white text-slate-900" : "bg-white/40 cursor-not-allowed"
              }`}
              disabled={mode !== "CRAFT"}
              title={mode !== "CRAFT" ? "Flow is for CRAFT only" : ""}
            >
              Flow/Workload Matrix
            </button>
            <button
              className={`px-3 py-1 rounded bg-white/70 text-slate-900`}
            >
              Closeness Matrix
            </button>
          </div>

          {mode === "CRAFT" ? (
            <FlowMatrixInput
              matrix={flowMatrix}
              setMatrix={setFlowMatrix}
              departmentNames={departmentNames}
            />
          ) : null}
          <ClosenessMatrixInput
            matrix={closenessMatrix}
            setMatrix={setClosenessMatrix}
            departmentNames={departmentNames}
          />
        </div>

        {/* Distance metric only for CRAFT */}
        {mode === "CRAFT" && (
          <div className="mb-3">
            <div className="font-semibold text-[#f0f6fc] mb-1">ระยะทาง</div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1 text-[#e0f2fe] text-sm">
                <input
                  type="radio"
                  name="distanceType"
                  value="manhattan"
                  checked={distanceType === "manhattan"}
                  onChange={() => setDistanceType("manhattan")}
                />{" "}
                Manhattan
              </label>
              <label className="flex items-center gap-1 text-[#e0f2fe] text-sm">
                <input
                  type="radio"
                  name="distanceType"
                  value="euclidean"
                  checked={distanceType === "euclidean"}
                  onChange={() => setDistanceType("euclidean")}
                />{" "}
                Euclidean
              </label>
            </div>
          </div>
        )}

        {/* Weights only matter for CORELAP/ALDEP */}
        {mode !== "CRAFT" && (
          <WeightsPanel weights={weights} setWeights={setWeights} />
        )}

        <div>
          <div className="font-bold text-[#e0f2fe] mb-2">
            {mode === "CRAFT" ? "CRAFT Result" : "Generated Result"}
          </div>
          {loading && <div className="text-white/80 mb-2">Loading result...</div>}
          {result ? (
            <div className="bg-white/10 rounded-lg p-3 text-white space-y-1">
              {"totalCost" in result && (
                <div>Total Cost: {result.totalCost ?? result?.score?.total}</div>
              )}
              {"totalDistance" in result && (
                <div>
                  Total Distance:{" "}
                  {result.totalDistance ?? result?.score?.closeness}
                </div>
              )}
              {Array.isArray(result?.assignment || result?.placements) && (
                <div className="max-h-48 overflow-auto pr-1">
                  Assignment (preview):
                  {(result.assignment || result.placements).map(
                    (d: any, i: number) => (
                      <div key={i} className="ml-2">
                        {d.name} ({d.x}, {d.y}) size {d.width}x{d.height}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ) : !loading ? (
            <div className="text-white/50">ยังไม่มีผลลัพธ์</div>
          ) : null}
        </div>

        {/* CRAFT-only side panel controls */}
        {mode === "CRAFT" && (
          <>
            <AddDepartmentForm onAdd={handleAddDept} gridSize={gridSize} />
            <DepartmentList
              layout={layout}
              onDelete={handleDeleteDept}
              onToggleLock={handleToggleLock}
            />
          </>
        )}
      </div>
    </div>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { useRouter } from "next/navigation";

const CANVAS_SIZE = 900;
const CANVAS_MIN_SIZE = 320;
const SIDEBAR_WIDTH = 470;
const CANVAS_PADDING = 64;
const API_BASE =
  process.env.NEXT_PUBLIC_CRAFT_CREATE_API?.replace(/\/craft$/, "") ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/auth$/, "") ??
  "http://localhost:4000";

type DeptType = "dept" | "void";
type Closeness = "A" | "E" | "I" | "O" | "U" | "X";
type Mode = "CRAFT" | "CORELAP" | "ALDEP";

const CLOSENESS_WEIGHTS: Record<Closeness | "blank", number> = {
  A: 10, E: 8, I: 6, O: 4, U: 2, X: 0, blank: 0,
};

type DeptBlock = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Dept = {
  id: string; name: string; width: number; height: number; x: number; y: number;
  blocks: DeptBlock[];
  targetCellCount: number;
  gridSize?: number; type: DeptType; locked?: boolean;
};

type DeptProto = {
  id: string;
  name: string;
  /** ใช้เป็นจำนวนช่อง (cells) */
  area?: number;
  fixed?: boolean;
};

type DepartmentImportInput = {
  dept?: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: DeptType;
  locked?: boolean;
};

type MatrixPairValueInput = {
  from: string;
  to: string;
  value: number;
};

type MatrixImportPayload = {
  departments?: string[];
  flows?: MatrixPairValueInput[];
  costs?: MatrixPairValueInput[];
};

function getBoardMetrics(
  gridWidth: number,
  gridHeight: number,
  maxWidth = CANVAS_SIZE,
  maxHeight = CANVAS_SIZE,
) {
  const safeWidth = Math.max(1, gridWidth);
  const safeHeight = Math.max(1, gridHeight);
  const usableWidth = Math.max(CANVAS_MIN_SIZE, maxWidth);
  const usableHeight = Math.max(CANVAS_MIN_SIZE, maxHeight);
  const cellSize = Math.max(
    1,
    Math.min(usableWidth / safeWidth, usableHeight / safeHeight),
  );
  return {
    cellSize,
    boardWidth: safeWidth * cellSize,
    boardHeight: safeHeight * cellSize,
  };
}

function getCellPixelSize(
  gridWidth: number,
  gridHeight: number,
  maxWidth = CANVAS_SIZE,
  maxHeight = CANVAS_SIZE,
) {
  return getBoardMetrics(gridWidth, gridHeight, maxWidth, maxHeight).cellSize;
}

function getDeptColor(seed: string) {
  const palette = [
    { fill: "#ef4444", border: "#7f1d1d", ghost: "rgba(239,68,68,0.22)", ghostBorder: "#dc2626" },
    { fill: "#3b82f6", border: "#1e3a8a", ghost: "rgba(59,130,246,0.22)", ghostBorder: "#2563eb" },
    { fill: "#22c55e", border: "#166534", ghost: "rgba(34,197,94,0.22)", ghostBorder: "#16a34a" },
    { fill: "#f59e0b", border: "#92400e", ghost: "rgba(245,158,11,0.22)", ghostBorder: "#d97706" },
    { fill: "#a855f7", border: "#6b21a8", ghost: "rgba(168,85,247,0.22)", ghostBorder: "#9333ea" },
    { fill: "#06b6d4", border: "#155e75", ghost: "rgba(6,182,212,0.22)", ghostBorder: "#0891b2" },
    { fill: "#84cc16", border: "#365314", ghost: "rgba(132,204,22,0.22)", ghostBorder: "#65a30d" },
    { fill: "#f97316", border: "#9a3412", ghost: "rgba(249,115,22,0.22)", ghostBorder: "#ea580c" },
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function getBoundsFromBlocks(blocks: DeptBlock[]) {
  const minX = Math.min(...blocks.map((b) => b.x));
  const minY = Math.min(...blocks.map((b) => b.y));
  const maxX = Math.max(...blocks.map((b) => b.x + b.width));
  const maxY = Math.max(...blocks.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function withDerivedBounds(dept: Omit<Dept, "x" | "y" | "width" | "height"> & Partial<Pick<Dept, "x" | "y" | "width" | "height">>): Dept {
  const bounds = getBoundsFromBlocks(dept.blocks);
  return { ...dept, ...bounds };
}

function deptFromCells(
  base: Omit<Dept, "x" | "y" | "width" | "height" | "blocks"> & Partial<Pick<Dept, "x" | "y" | "width" | "height">>,
  cells: string[],
): Dept {
  const unique = Array.from(new Set(cells));
  const blocks = unique.map((cell) => {
    const [x, y] = cell.split(",").map(Number);
    return { x, y, width: 1, height: 1 };
  });
  return withDerivedBounds({ ...base, targetCellCount: unique.length, blocks });
}

function canonicalizeDepartment(dept: Dept): Dept {
  return deptFromCells(dept, departmentCells(dept));
}

function createRectDepartment(input: {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: DeptType;
  gridSize?: number;
  locked?: boolean;
}): Dept {
  return canonicalizeDepartment({
    ...input,
    targetCellCount: input.width * input.height,
    blocks: [{ x: input.x, y: input.y, width: input.width, height: input.height }],
  });
}

function parseDepartmentImport(raw: string, gridWidth: number, gridHeight: number) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON format" } as const;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "JSON must be a non-empty array" } as const;
  }

  const departments: Dept[] = [];
  const gridSize = Math.max(gridWidth, gridHeight);
  const importKey = Date.now();

  for (let index = 0; index < parsed.length; index++) {
    const item = parsed[index] as DepartmentImportInput | null;
    if (!item || typeof item !== "object") {
      return { error: `Row ${index + 1} is not a valid object` } as const;
    }

    const name = typeof item.dept === "string" && item.dept.trim()
      ? item.dept.trim()
      : typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : "";

    const x = Number(item.x);
    const y = Number(item.y);
    const width = Number(item.width);
    const height = Number(item.height);

    if (!name) {
      return { error: `Row ${index + 1} is missing dept/name` } as const;
    }
    if (![x, y, width, height].every(Number.isFinite)) {
      return { error: `Row ${index + 1} has invalid x, y, width, or height` } as const;
    }

    const normalizedX = Math.max(0, Math.floor(x));
    const normalizedY = Math.max(0, Math.floor(y));
    const normalizedWidth = Math.max(1, Math.ceil(width));
    const normalizedHeight = Math.max(1, Math.ceil(height));

    if (normalizedX + normalizedWidth > gridWidth || normalizedY + normalizedHeight > gridHeight) {
      return { error: `Department "${name}" exceeds the plant area` } as const;
    }

    departments.push(
      createRectDepartment({
        id: `dept_import_${importKey}_${index}`,
        name,
        x: normalizedX,
        y: normalizedY,
        width: normalizedWidth,
        height: normalizedHeight,
        type: item.type === "void" ? "void" : "dept",
        gridSize,
        locked: !!item.locked,
      })
    );
  }

  return { departments } as const;
}

function parseMatrixImport(
  raw: string,
  section: "flows" | "costs",
  departmentNames: string[],
  defaultValue: number,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON format" } as const;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "JSON must be an object with departments and matrix data" } as const;
  }

  const payload = parsed as MatrixImportPayload;
  const departmentSource = Array.isArray(payload.departments) && payload.departments.length
    ? payload.departments
    : departmentNames;

  if (!departmentNames.length) {
    return { error: "Add departments before importing matrix data" } as const;
  }

  const missingInLayout = departmentSource.filter((name) => !departmentNames.includes(name));
  if (missingInLayout.length) {
    return { error: `These departments are not in the current layout: ${missingInLayout.join(", ")}` } as const;
  }

  const rows = payload[section];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: `JSON is missing a non-empty "${section}" array` } as const;
  }

  const indexMap = new Map(departmentNames.map((name, index) => [name, index]));
  const next = Array.from({ length: departmentNames.length }, () => Array(departmentNames.length).fill(defaultValue));

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row || typeof row !== "object") {
      return { error: `Row ${index + 1} in "${section}" is not a valid object` } as const;
    }

    const from = typeof row.from === "string" ? row.from.trim() : "";
    const to = typeof row.to === "string" ? row.to.trim() : "";
    const value = Number(row.value);

    if (!from || !to || !Number.isFinite(value)) {
      return { error: `Row ${index + 1} in "${section}" must contain from, to, and numeric value` } as const;
    }

    const fromIndex = indexMap.get(from);
    const toIndex = indexMap.get(to);
    if (fromIndex === undefined || toIndex === undefined) {
      return { error: `Row ${index + 1} references unknown department "${from}" or "${to}"` } as const;
    }

    next[fromIndex][toIndex] = value;
  }

  return { matrix: next } as const;
}

function shiftDepartment(dept: Dept, dx: number, dy: number): Dept {
  const shifted = departmentCells(dept).map((cell) => {
    const [x, y] = cell.split(",").map(Number);
    return `${x + dx},${y + dy}`;
  });
  return deptFromCells(dept, shifted);
}

function expandBlock(block: DeptBlock) {
  const cells: string[] = [];
  for (let y = block.y; y < block.y + block.height; y++) {
    for (let x = block.x; x < block.x + block.width; x++) {
      cells.push(`${x},${y}`);
    }
  }
  return cells;
}

function departmentCells(dept: Dept) {
  return dept.blocks.flatMap(expandBlock);
}

function isConnectedCells(cells: string[]) {
  if (cells.length <= 1) return true;
  const all = new Set(cells);
  const queue = [cells[0]];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const [x, y] = current.split(",").map(Number);
    const neighbors = [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`];
    for (const next of neighbors) {
      if (all.has(next) && !visited.has(next)) queue.push(next);
    }
  }

  return visited.size === all.size;
}

function hasInternalOverlap(dept: Dept) {
  const seen = new Set<string>();
  for (const key of departmentCells(dept)) {
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function departmentWithinGrid(dept: Dept, gridWidth: number, gridHeight: number) {
  return dept.blocks.every(
    (block) =>
      block.x >= 0 &&
      block.y >= 0 &&
      block.x + block.width <= gridWidth &&
      block.y + block.height <= gridHeight
  );
}

function departmentsOverlap(a: Dept, b: Dept) {
  const seen = new Set(departmentCells(a));
  return departmentCells(b).some((cell) => seen.has(cell));
}

function canPlaceDepartment(candidate: Dept, layout: Dept[], gridWidth: number, gridHeight: number) {
  if (!departmentWithinGrid(candidate, gridWidth, gridHeight)) return false;
  if (hasInternalOverlap(candidate)) return false;
  if (!isConnectedCells(departmentCells(candidate))) return false;
  return !layout.some((dept) => dept.id !== candidate.id && departmentsOverlap(candidate, dept));
}

function extendDepartmentShape(
  dept: Dept,
  direction: "left" | "right" | "top" | "bottom",
  startOffset: number,
  span: number,
  extendBy: number,
) {
  if (extendBy < 1 || span < 1 || startOffset < 0) return null;
  let newBlock: DeptBlock | null = null;
  if (direction === "left" || direction === "right") {
    if (startOffset + span > dept.height) return null;
    const y = dept.y + startOffset;
    newBlock = {
      x: direction === "left" ? dept.x - extendBy : dept.x + dept.width,
      y,
      width: extendBy,
      height: span,
    };
  } else {
    if (startOffset + span > dept.width) return null;
    const x = dept.x + startOffset;
    newBlock = {
      x,
      y: direction === "top" ? dept.y - extendBy : dept.y + dept.height,
      width: span,
      height: extendBy,
    };
  }
  const nextCells = [...departmentCells(dept), ...expandBlock(newBlock).map((cell) => `${cell}`)];
  return deptFromCells(dept, nextCells);
}

function normalizeDepartmentForPayload(dept: Dept, offsetX: number, offsetY: number) {
  const shiftedBlocks = departmentCells(dept).map((cell) => {
    const [x, y] = cell.split(",").map(Number);
    return {
      x: x - offsetX,
      y: y - offsetY,
      width: 1,
      height: 1,
    };
  });
  const bounds = getBoundsFromBlocks(shiftedBlocks);
  return {
    name: dept.name,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    blocks: shiftedBlocks,
    type: (dept.type === "void" ? "void" : "dept") as "dept" | "void",
    locked: !!dept.locked,
  };
}

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
function DraggableDepartment({
  dept,
  selected = false,
  onSelect,
}: { dept: Dept; selected?: boolean; onSelect?: (id: string) => void; }) {
  const disabled = !!dept.locked;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: dept.id, disabled });
  const px = (dept as Dept & { cellPixelSize?: number }).cellPixelSize ?? 1;
  const colors = getDeptColor(dept.name);
  return (
    <div
      ref={setNodeRef}
      style={{
        position: "absolute",
        top: dept.y * px, left: dept.x * px, width: dept.width * px, height: dept.height * px,
        borderRadius: "0.6rem",
        border: selected ? "2px solid #facc15" : "2px solid transparent",
        boxShadow: selected ? "0 0 0 2px rgba(250,204,21,.25)" : "none", color: "#002b5c", fontWeight: "bold",
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        cursor: disabled ? "not-allowed" : "grab", zIndex: 2,
      }}
      onClick={() => onSelect?.(dept.id)}
      {...listeners} {...attributes}
      className="text-xs select-none relative"
    >
      {dept.blocks.map((block, index) => (
        <div
          key={`${dept.id}-block-${index}`}
          style={{
            position: "absolute",
            top: (block.y - dept.y) * px, left: (block.x - dept.x) * px, width: block.width * px, height: block.height * px,
            background: dept.type === "void"
              ? "repeating-linear-gradient(45deg, rgba(255,255,255,.15) 0 8px, rgba(255,255,255,.08) 8px 16px)"
              : colors.fill,
            borderRadius: "0.6rem", border: dept.type === "void" ? "2px dashed #94a3b8" : `2px solid ${colors.border}`,
            boxShadow: "0 4px 16px 0 rgb(0 0 0 / 0.18)",
          }}
        />
      ))}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">{dept.name}</div>
      {dept.locked && <div className="absolute top-1 right-1 text-[10px] px-1 rounded bg-amber-500/80 text-white">LOCK</div>}
    </div>
  );
}
function GhostOverlay({
  assignment,
  gridWidth,
  gridHeight,
  maxWidth = CANVAS_SIZE,
  maxHeight = CANVAS_SIZE,
}: { assignment: Dept[]; gridWidth: number; gridHeight: number; maxWidth?: number; maxHeight?: number; }) {
  if (!assignment?.length) return null;
  const m = getCellPixelSize(gridWidth, gridHeight, maxWidth, maxHeight);
  return (
    <>
      {assignment.map((d) => (
        <div key={`ghost-${d.id || d.name}`}
          style={{
            position: "absolute", top: d.y * m, left: d.x * m, width: d.width * m, height: d.height * m,
            border: `2px dashed ${getDeptColor(d.name).ghostBorder}`, background: getDeptColor(d.name).ghost, borderRadius: "0.6rem",
            pointerEvents: "none", zIndex: 3,
          }}
          title={`${d.name} → (${d.x}, ${d.y})`}
        />
      ))}
    </>
  );
}
function GridArea({
  layout, setLayout, gridWidth, gridHeight, onLayoutChange, overlayAssignment, draggableEnabled = true, maxWidth = CANVAS_SIZE, maxHeight = CANVAS_SIZE,
}: {
  layout: Dept[]; setLayout: (v: Dept[]) => void; gridWidth: number; gridHeight: number;
  onLayoutChange: (v: Dept[]) => void; overlayAssignment?: Dept[] | null; draggableEnabled?: boolean; maxWidth?: number; maxHeight?: number;
}) {
  const { setNodeRef } = useDroppable({ id: "layout" });
  function handleDragEnd(event: any) {
    if (!draggableEnabled) return;
    const { active, delta } = event;
    const i = layout.findIndex((d) => d.id === active.id);
    if (i === -1) return;
    const moved = layout[i]; if (moved.locked) return;
    const meter = getCellPixelSize(gridWidth, gridHeight, maxWidth, maxHeight);
    const dx = Math.round(delta.x / meter), dy = Math.round(delta.y / meter);
    const nx = Math.max(0, Math.min(moved.x + dx, gridWidth - moved.width));
    const ny = Math.max(0, Math.min(moved.y + dy, gridHeight - moved.height));
    const next = [...layout]; next[i] = { ...moved, x: nx, y: ny };
    setLayout(next); onLayoutChange(next);
  }
  const { cellSize, boardWidth, boardHeight } = getBoardMetrics(gridWidth, gridHeight, maxWidth, maxHeight);
  const gridColor = "rgba(220,227,240,0.18)", mainBorder = "rgba(255,255,255,0.08)";
  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div ref={setNodeRef} className="relative shadow-xl"
        style={{
          width: boardWidth, height: boardHeight, minHeight: boardHeight, minWidth: boardWidth,
          backgroundColor: "#002b5c",
          backgroundImage: `linear-gradient(to right, ${gridColor} 1px, transparent 1px),
                            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)`,
          backgroundSize: `${cellSize}px ${cellSize}px`,
          border: `2px solid ${mainBorder}`, borderRadius: "1.5rem",
        }}>
        <div style={{
          pointerEvents: "none", position: "absolute", inset: 0, borderRadius: "1.5rem",
          background: "linear-gradient(135deg,rgba(0,0,0,0.05) 30%,rgba(255,255,255,0.06) 100%)", zIndex: 1,
        }}/>
        {layout.map((d) => (
          <DraggableDepartment key={d.id} dept={{ ...d, cellPixelSize: cellSize } as Dept} />
        ))}
        {overlayAssignment?.length ? (
          <GhostOverlay assignment={overlayAssignment} gridWidth={gridWidth} gridHeight={gridHeight} maxWidth={maxWidth} maxHeight={maxHeight} />
        ) : null}
      </div>
    </DndContext>
  );
}

function CraftGridArea({
  layout,
  setLayout,
  gridWidth,
  gridHeight,
  overlayAssignment,
  selectedDeptId,
  onSelectDept,
  maxWidth = CANVAS_SIZE,
  maxHeight = CANVAS_SIZE,
}: {
  layout: Dept[];
  setLayout: (v: Dept[]) => void;
  gridWidth: number;
  gridHeight: number;
  overlayAssignment?: Dept[] | null;
  selectedDeptId?: string | null;
  onSelectDept?: (id: string) => void;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const { setNodeRef } = useDroppable({ id: "craft-layout" });
  const { cellSize, boardWidth, boardHeight } = getBoardMetrics(gridWidth, gridHeight, maxWidth, maxHeight);
  const gridColor = "rgba(220,227,240,0.18)";
  const mainBorder = "rgba(255,255,255,0.08)";

  function handleDragEnd(event: any) {
    const { active, delta } = event;
    const dept = layout.find((item) => item.id === active.id);
    if (!dept || dept.locked) return;
    const dx = Math.round(delta.x / cellSize);
    const dy = Math.round(delta.y / cellSize);
    const shifted = shiftDepartment(dept, dx, dy);
    if (!canPlaceDepartment(shifted, layout, gridWidth, gridHeight)) return;
    setLayout(layout.map((item) => (item.id === dept.id ? shifted : item)));
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div
        ref={setNodeRef}
        className="relative shadow-xl"
        style={{
          width: boardWidth,
          height: boardHeight,
          minHeight: boardHeight,
          minWidth: boardWidth,
          backgroundColor: "#002b5c",
          backgroundImage: `linear-gradient(to right, ${gridColor} 1px, transparent 1px),
                            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)`,
          backgroundSize: `${cellSize}px ${cellSize}px`,
          border: `2px solid ${mainBorder}`,
          borderRadius: "1.5rem",
        }}
      >
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            borderRadius: "1.5rem",
            background: "linear-gradient(135deg,rgba(0,0,0,0.05) 30%,rgba(255,255,255,0.06) 100%)",
            zIndex: 1,
          }}
        />
        {layout.map((dept) => (
          <DraggableDepartment
            key={dept.id}
            dept={{ ...dept, cellPixelSize: cellSize } as Dept}
            selected={selectedDeptId === dept.id}
            onSelect={onSelectDept}
          />
        ))}
        {overlayAssignment?.length ? (
          <CraftGhostOverlay assignment={overlayAssignment} gridWidth={gridWidth} gridHeight={gridHeight} maxWidth={maxWidth} maxHeight={maxHeight} />
        ) : null}
      </div>
    </DndContext>
  );
}

function CraftGhostOverlay({
  assignment,
  gridWidth,
  gridHeight,
  maxWidth = CANVAS_SIZE,
  maxHeight = CANVAS_SIZE,
}: { assignment: Dept[]; gridWidth: number; gridHeight: number; maxWidth?: number; maxHeight?: number; }) {
  if (!assignment?.length) return null;
  const m = getCellPixelSize(gridWidth, gridHeight, maxWidth, maxHeight);
  return (
    <>
      {assignment.map((dept) => (
        <React.Fragment key={`craft-ghost-${dept.id || dept.name}`}>
          {dept.blocks.map((block, index) => (
            <div
              key={`craft-ghost-${dept.id || dept.name}-${index}`}
              style={{
                position: "absolute",
                top: block.y * m,
                left: block.x * m,
                width: block.width * m,
                height: block.height * m,
                border: `2px dashed ${getDeptColor(dept.name).ghostBorder}`,
                background: getDeptColor(dept.name).ghost,
                borderRadius: "0.6rem",
                pointerEvents: "none",
                zIndex: 3,
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              top: dept.y * m,
              left: dept.x * m,
              width: dept.width * m,
              height: dept.height * m,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              pointerEvents: "none",
              zIndex: 4,
            }}
          >
            {dept.name}
          </div>
        </React.Fragment>
      ))}
    </>
  );
}

/* ---------- forms ---------- */
function AddDepartmentForm({
  onAdd,
  gridWidth,
  gridHeight,
}: { onAdd: (d: Dept) => void; gridWidth: number; gridHeight: number; }) {
  const gridSize = Math.max(gridWidth, gridHeight);
  const [name, setName] = useState(""); const [width, setWidth] = useState(""); const [height, setHeight] = useState("");
  const [x, setX] = useState(""); const [y, setY] = useState(""); const [isVoid, setIsVoid] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !width || !height || !x || !y) return alert("กรุณากรอกข้อมูลให้ครบ");
    const w = Math.max(1, Math.ceil(+width));
    const h = Math.max(1, Math.ceil(+height));
    const xx = Math.max(0, Math.floor(+x));
    const yy = Math.max(0, Math.floor(+y));
    if (xx + w > gridWidth || yy + h > gridHeight) return alert("Department exceeds the plant area");
    if (xx < 0 || yy < 0 || w <= 0 || h <= 0) return alert("ตำแหน่ง/ขนาดต้องเป็นค่าบวก");
    if (xx + w > gridSize || yy + h > gridSize) return alert("เกินพื้นที่");
    onAdd(createRectDepartment({ id: `dept_${Date.now()}`, name, width: w, height: h, x: xx, y: yy, type: isVoid ? "void" : "dept", gridSize }));
    setName(""); setWidth(""); setHeight(""); setX(""); setY("");
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label className="block text-sm mb-1 text-[#f0f6fc]">ชื่อแผนก</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1"><label className="block text-sm mb-1 text-[#f0f6fc]">กว้าง (cells)</label>
          <input type="number" min={1} step={1} value={width} onChange={(e) => setWidth(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
        <div className="flex-1"><label className="block text-sm mb-1 text-[#f0f6fc]">สูง (cells)</label>
          <input type="number" min={1} step={1} value={height} onChange={(e) => setHeight(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1"><label className="block text-sm mb-1 text-[#f0f6fc]">ตำแหน่ง X</label>
          <input type="number" min={0} max={gridWidth} step={1} value={x} onChange={(e) => setX(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
        <div className="flex-1"><label className="block text-sm mb-1 text-[#f0f6fc]">ตำแหน่ง Y</label>
          <input type="number" min={0} max={gridHeight} step={1} value={y} onChange={(e) => setY(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
      </div>
      <div className="text-xs text-white/70">CRAFT uses a fixed scale of 1 meter per cell.</div>
      <div className="flex items-center gap-2">
        <input id="isVoid" type="checkbox" checked={isVoid} onChange={(e) => setIsVoid(e.target.checked)} />
        <label htmlFor="isVoid" className="text-[#f0f6fc] text-sm">เพิ่มเป็น “พื้นที่ว่าง” (void)</label>
      </div>
      <button className="w-full bg-gradient-to-r from-blue-500 to-green-400 text-white py-2 rounded-lg font-bold">+ เพิ่มแผนก</button>
    </form>
  );
}

function DepartmentList({ layout, selectedDeptId, onDelete, onToggleLock, onSelect }: { layout: any[]; selectedDeptId?: string | null; onDelete: (id: string) => void; onToggleLock: (id: string) => void; onSelect?: (id: string) => void; }) {
  return (
    <div>
      <div className="font-semibold text-[#f0f6fc] mb-2 mt-4">แผนก</div>
      <div className="bg-white/20 rounded-lg p-2 min-h-[40px]">
        {layout.length === 0 ? <p className="text-sm text-white/70">None</p> : (
          <ul className="space-y-1">
            {layout.map((d) => (
              <li key={d.id} className={`flex justify-between items-center py-1 px-1 rounded hover:bg-white/30 ${selectedDeptId === d.id ? "bg-amber-400/20" : ""}`}>
                <span className="font-medium text-[#e0f2fe]">
                  <span
                    className="inline-block w-3 h-3 rounded-sm mr-2 align-middle"
                    style={{ background: getDeptColor(d.name).fill, border: `1px solid ${getDeptColor(d.name).border}` }}
                  />
                  {d.name}{d.type === "void" && <em className="text-white/60"> (void)</em>}
                  {d.locked && <em className="text-amber-300 ml-1">[locked]</em>}
                  <em className="text-white/60 ml-1">[{d.blocks?.length ?? 1} block(s)]</em>
                </span>
                <div className="flex gap-2">
                  <button onClick={() => onSelect?.(d.id)} className="text-xs px-2 py-1 rounded bg-sky-600/70 text-white">Edit</button>
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
function MatrixJsonImport({
  label,
  section,
  departmentNames,
  defaultValue,
  onImport,
}: {
  label: string;
  section: "flows" | "costs";
  departmentNames: string[];
  defaultValue: number;
  onImport: (matrix: (number | string)[][]) => void;
}) {
  const [jsonText, setJsonText] = useState("");

  const handleImport = () => {
    if (!jsonText.trim()) {
      alert(`Paste JSON before importing ${label.toLowerCase()}`);
      return;
    }

    const parsed = parseMatrixImport(jsonText, section, departmentNames, defaultValue);
    if ("error" in parsed) {
      alert(parsed.error);
      return;
    }

    onImport(parsed.matrix);
  };

  return (
    <div className="mt-3 border border-white/15 rounded-xl p-3 bg-black/10 space-y-2">
      <div className="font-medium text-[#f0f6fc]">Paste JSON for {label}</div>
      <div className="text-xs text-white/70">
        Reads <code>departments</code> plus <code>{section}</code> entries shaped like <code>{`{ "from": "A", "to": "B", "value": 120 }`}</code>.
      </div>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        rows={8}
        placeholder={`{
  "departments": ["A", "B"],
  "${section}": [
    { "from": "A", "to": "B", "value": ${defaultValue === 0 ? "120" : "0.015"} }
  ]
}`}
        className="w-full rounded-lg border px-3 py-2 bg-white/85 text-[#002b5c] font-mono text-xs"
      />
      <button
        type="button"
        onClick={handleImport}
        className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-semibold"
      >
        Import {label} JSON
      </button>
    </div>
  );
}

function FlowMatrixInput({
  matrix, setMatrix, departmentNames,
}: { matrix: (number | string)[][]; setMatrix: (m: (number | string)[][]) => void; departmentNames: string[]; }) {
  const n = departmentNames.length;
  React.useEffect(() => {
    if (matrix.length !== n) {
      setMatrix(Array.from({ length: n }, () => Array(n).fill(0)));
    }
  }, [matrix.length, n, setMatrix]);
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
      <MatrixJsonImport
        label="Flow / Workload"
        section="flows"
        departmentNames={departmentNames}
        defaultValue={0}
        onImport={setMatrix}
      />
    </div>
  );
}

function AddDepartmentFormFixed({
  onAdd,
  onImport,
  gridWidth,
  gridHeight,
}: {
  onAdd: (d: Dept) => void;
  onImport: (departments: Dept[]) => { ok: boolean; message?: string };
  gridWidth: number;
  gridHeight: number;
}) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [isVoid, setIsVoid] = useState(false);
  const [bulkJson, setBulkJson] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !width || !height || !x || !y) {
      alert("Please fill in all department fields");
      return;
    }

    const w = Math.max(1, Math.ceil(+width));
    const h = Math.max(1, Math.ceil(+height));
    const xx = Math.max(0, Math.floor(+x));
    const yy = Math.max(0, Math.floor(+y));
    if (xx + w > gridWidth || yy + h > gridHeight) {
      alert("Department exceeds the plant area");
      return;
    }

    onAdd(
      createRectDepartment({
        id: `dept_${Date.now()}`,
        name,
        width: w,
        height: h,
        x: xx,
        y: yy,
        type: isVoid ? "void" : "dept",
        gridSize: Math.max(gridWidth, gridHeight),
      })
    );
    setName("");
    setWidth("");
    setHeight("");
    setX("");
    setY("");
    setIsVoid(false);
  };

  const importFromJson = () => {
    if (!bulkJson.trim()) {
      alert("Paste JSON before importing");
      return;
    }

    const parsed = parseDepartmentImport(bulkJson, gridWidth, gridHeight);
    if ("error" in parsed) {
      alert(parsed.error);
      return;
    }

    const result = onImport(parsed.departments);
    if (!result.ok) {
      alert(result.message || "Import failed");
      return;
    }

    setBulkJson("");
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm mb-1 text-[#f0f6fc]">Department Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">Width (m)</label>
          <input type="number" min={1} step={1} value={width} onChange={(e) => setWidth(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">Height (m)</label>
          <input type="number" min={1} step={1} value={height} onChange={(e) => setHeight(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">X (m)</label>
          <input type="number" min={0} max={gridWidth} step={1} value={x} onChange={(e) => setX(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">Y (m)</label>
          <input type="number" min={0} max={gridHeight} step={1} value={y} onChange={(e) => setY(e.target.value)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
      </div>
      <div className="text-xs text-white/70">CRAFT uses a fixed scale of 1 meter per cell.</div>
      <div className="flex items-center gap-2">
        <input id="isVoidFixed" type="checkbox" checked={isVoid} onChange={(e) => setIsVoid(e.target.checked)} />
        <label htmlFor="isVoidFixed" className="text-[#f0f6fc] text-sm">Create as empty / void area</label>
      </div>
      <button className="w-full bg-gradient-to-r from-blue-500 to-green-400 text-white py-2 rounded-lg font-bold">+ Add Department</button>
      <div className="border border-white/15 rounded-xl p-3 bg-black/10 space-y-2">
        <div className="font-semibold text-[#f0f6fc]">Paste JSON</div>
        <div className="text-xs text-white/70">
          Supports <code>dept</code> or <code>name</code> plus x, y, width, height. Decimal values are rounded to the current cell grid automatically.
        </div>
        <textarea
          value={bulkJson}
          onChange={(e) => setBulkJson(e.target.value)}
          rows={8}
          placeholder={`[
  { "dept": "A", "x": 0, "y": 0, "width": 6, "height": 12.5 },
  { "dept": "B", "x": 6, "y": 0, "width": 7, "height": 3.86 }
]`}
          className="w-full rounded-lg border px-3 py-2 bg-white/85 text-[#002b5c] font-mono text-xs"
        />
        <button
          type="button"
          onClick={importFromJson}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-semibold"
        >
          Import Departments from JSON
        </button>
      </div>
    </form>
  );
}

function ShapeEditorPanel({
  selectedDept,
  layout,
  gridWidth,
  gridHeight,
  onApply,
}: {
  selectedDept: Dept | null;
  layout: Dept[];
  gridWidth: number;
  gridHeight: number;
  onApply: (dept: Dept) => void;
}) {
  const [direction, setDirection] = useState<"left" | "right" | "top" | "bottom">("right");
  const [startOffset, setStartOffset] = useState(0);
  const [span, setSpan] = useState(1);
  const [extendBy, setExtendBy] = useState(1);
  const [paintMode, setPaintMode] = useState<"fill" | "erase">("fill");

  React.useEffect(() => {
    setStartOffset(0);
    setExtendBy(1);
    setSpan(selectedDept ? (direction === "left" || direction === "right" ? selectedDept.height : selectedDept.width) : 1);
  }, [selectedDept, direction]);

  if (!selectedDept) {
    return <div className="text-sm text-white/60">Click a department to edit its shape.</div>;
  }

  const maxSpan = direction === "left" || direction === "right" ? selectedDept.height : selectedDept.width;

  function applyExtension() {
    if (selectedDept.locked) {
      alert("Unlock this department before editing the shape");
      return;
    }
    const next = extendDepartmentShape(selectedDept, direction, startOffset, span, extendBy);
    if (!next) {
      alert("Invalid extension range");
      return;
    }
    if (!canPlaceDepartment(next, layout, gridWidth, gridHeight)) {
      alert("This extension would go out of bounds, overlap, or break connectivity");
      return;
    }
    onApply(canonicalizeDepartment(next));
  }

  const editorMinX = Math.max(0, selectedDept.x - 2);
  const editorMinY = Math.max(0, selectedDept.y - 2);
  const editorMaxX = Math.min(gridWidth - 1, selectedDept.x + selectedDept.width + 1);
  const editorMaxY = Math.min(gridHeight - 1, selectedDept.y + selectedDept.height + 1);

  function toggleCell(cellX: number, cellY: number) {
    if (selectedDept.locked) {
      alert("Unlock this department before editing the shape");
      return;
    }
    const currentCells = new Set(departmentCells(selectedDept));
    const key = `${cellX},${cellY}`;

    if (paintMode === "fill") {
      currentCells.add(key);
    } else {
      if (!currentCells.has(key)) return;
      if (currentCells.size === 1) {
        alert("A department must contain at least one cell");
        return;
      }
      currentCells.delete(key);
    }

    const next = deptFromCells(selectedDept, Array.from(currentCells));
    if (!canPlaceDepartment(next, layout, gridWidth, gridHeight)) {
      alert("This shape would go out of bounds, overlap, or break connectivity");
      return;
    }
    onApply(next);
  }

  return (
    <div className="space-y-3 rounded-lg bg-white/10 p-3">
      <div className="font-semibold text-[#f0f6fc]">Edit Shape: {selectedDept.name}</div>
      <div className="text-xs text-white/70">Current size: {departmentCells(selectedDept).length} cells. System will use this latest size on submit.</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="block text-sm mb-1 text-[#f0f6fc]">Direction</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value as any)} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]">
            <option value="left">Extend Left</option>
            <option value="right">Extend Right</option>
            <option value="top">Extend Top</option>
            <option value="bottom">Extend Bottom</option>
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1 text-[#f0f6fc]">Start Offset</label>
          <input type="number" min={0} max={Math.max(0, maxSpan - 1)} value={startOffset} onChange={(e) => setStartOffset(Number(e.target.value))} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
        <div>
          <label className="block text-sm mb-1 text-[#f0f6fc]">Span</label>
          <input type="number" min={1} max={maxSpan} value={span} onChange={(e) => setSpan(Number(e.target.value))} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm mb-1 text-[#f0f6fc]">Extend By (cells)</label>
          <input type="number" min={1} value={extendBy} onChange={(e) => setExtendBy(Number(e.target.value))} className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]" />
        </div>
      </div>
      <div className="text-xs text-white/70">Shape stays connected and cannot overlap other departments.</div>
      <button onClick={applyExtension} className="w-full bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 py-2 rounded-lg font-bold">Apply Extension</button>
      <div className="border-t border-white/10 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-[#f0f6fc]">Freeform Cell Editor</div>
          <select value={paintMode} onChange={(e) => setPaintMode(e.target.value as "fill" | "erase")} className="border px-2 py-1 rounded bg-white/80 text-[#002b5c] text-sm">
            <option value="fill">Fill cell</option>
            <option value="erase">Erase cell</option>
          </select>
        </div>
        <div className="overflow-auto rounded border border-white/10 p-2 bg-slate-950/20">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${editorMaxX - editorMinX + 1}, minmax(20px, 1fr))`,
              gap: 4,
            }}
          >
            {Array.from({ length: editorMaxY - editorMinY + 1 }, (_, row) =>
              Array.from({ length: editorMaxX - editorMinX + 1 }, (_, col) => {
                const x = editorMinX + col;
                const y = editorMinY + row;
                const key = `${x},${y}`;
                const occupied = departmentCells(selectedDept).includes(key);
                const colors = getDeptColor(selectedDept.name);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleCell(x, y)}
                    className="h-6 w-6 rounded border text-[10px]"
                    style={{
                      background: occupied ? colors.fill : "rgba(255,255,255,0.08)",
                      borderColor: occupied ? colors.border : "rgba(255,255,255,0.18)",
                    }}
                    title={`(${x}, ${y})`}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TransportCostMatrixInput({
  matrix, setMatrix, departmentNames,
}: { matrix: (number | string)[][]; setMatrix: (m: (number | string)[][]) => void; departmentNames: string[]; }) {
  const n = departmentNames.length;
  React.useEffect(() => {
    if (matrix.length !== n) {
      setMatrix(Array.from({ length: n }, () => Array(n).fill(1)));
    }
  }, [matrix.length, n, setMatrix]);
  function handleChange(i: number, j: number, val: string) {
    const v = Number(val);
    const next = matrix.map((r) => [...r]);
    next[i][j] = isNaN(v) ? 0 : v;
    setMatrix(next);
  }
  if (n === 0) return null;
  return (
    <div className="my-2">
      <div className="font-semibold text-[#f0f6fc] mb-2">Transport Cost / Move</div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse bg-white/10 text-xs text-[#e0f2fe]">
          <thead><tr><th className="border px-2 py-1 bg-[#334155]">To/From</th>{departmentNames.map((n, i) => <th key={i} className="border px-2 py-1 bg-[#334155]">{n}</th>)}</tr></thead>
          <tbody>
            {departmentNames.map((from, i) => (
              <tr key={i}>
                <th className="border px-2 py-1 bg-[#334155]">{from}</th>
                {departmentNames.map((to, j) => (
                  <td className="border px-1 py-1" key={j}>
                    <input type="number" min={0} step={0.01} value={(matrix[i]?.[j] ?? 1) as any} onChange={(e) => handleChange(i, j, e.target.value)} className="w-14 px-1 py-1 rounded text-[#0f172a] bg-white/80 text-center border"/>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MatrixJsonImport
        label="Transport Cost"
        section="costs"
        departmentNames={departmentNames}
        defaultValue={1}
        onImport={setMatrix}
      />
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

function ProjectModalFixed({ open, defaultName = "", onSubmit }: { open: boolean; defaultName?: string; onSubmit: (p: { id: string; name: string }) => void; }) {
  const [name, setName] = React.useState(defaultName);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => setName(defaultName), [defaultName]);
  if (!open) return null;

  async function handleCreate() {
    if (!name.trim()) {
      alert("Please enter a project name");
      return;
    }

    setLoading(true);
    const res = await fetch(`${API_BASE}/craft/project`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
    setLoading(false);

    if (!res.ok || !data?.id) {
      const message = Array.isArray(data?.message) ? data.message.join("\n") : data?.message;
      alert(message || data?.error || "Failed to create project");
      return;
    }

    onSubmit({ id: data.id, name: data.name ?? name });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-black rounded-xl p-6 max-w-xs w-full shadow-2xl">
        <div className="font-bold text-lg mb-3 text-white">Create Project</div>
        <input className="w-full border px-2 py-1 rounded mb-3 bg-white/90 text-slate-900" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <button onClick={handleCreate} className="bg-blue-600 text-white font-bold rounded px-4 py-2 disabled:opacity-60" disabled={loading}>{loading ? "Creating..." : "Create Project"}</button>
        </div>
      </div>
    </div>
  );
}

/* ======================== MAIN ======================== */
export default function PlantLayout() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("CRAFT");
  const [viewportSize, setViewportSize] = useState({ width: CANVAS_SIZE, height: CANVAS_SIZE });

  // CRAFT
  const [layout, setLayout] = useState<Dept[]>([]);
  const craftCellSizeMeters = 1;
  const [plantWidthMeters, setPlantWidthMeters] = useState(150);
  const [plantHeightMeters, setPlantHeightMeters] = useState(150);
  const [distanceType, setDistanceType] = useState<"manhattan" | "euclidean">("manhattan");
  const [flowMatrix, setFlowMatrix] = useState<(number | string)[][]>([]);
  const [transportCostMatrix, setTransportCostMatrix] = useState<(number | string)[][]>([]);

  // CORELAP/ALDEP (build)
  const [deptProtos, setDeptProtos] = useState<DeptProto[]>([]);
  const [cellSize, setCellSize] = useState(5);     // meters per side
  const [gridW, setGridW] = useState(30);          // cells
  const [gridH, setGridH] = useState(30);          // cells
  const [weights, setWeights] = useState({ A: 10, E: 8, I: 6, O: 4, U: 2, X: 0, blank: 0 });

  // === ALDEP params ===
  const [aldepLowerBound, setAldepLowerBound] =
    useState<"" | "A" | "E" | "I" | "O" | "U" | "X">("A");
  const [aldepStripWidth, setAldepStripWidth] = useState<number>(2);
  const [aldepSeeds, setAldepSeeds] = useState<number>(8);
  const [aldepAllowSplit, setAldepAllowSplit] = useState<boolean>(true);
  const [aldepMaxFrags, setAldepMaxFrags] = useState<number>(3);

  // shared
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(""); const [projectName, setProjectName] = useState("");
  const [showProjectModal, setShowProjectModal] = useState(true);
  const [layoutName, setLayoutName] = useState("");
  const [closenessMatrix, setClosenessMatrix] = useState<string[][]>([]);
  const departmentOnly = layout.filter((d) => d.type !== "void");

  const departmentNames = React.useMemo(
    () => (mode === "CRAFT" ? departmentOnly.map((d) => d.name) : deptProtos.map((d) => d.name)),
    [mode, departmentOnly, deptProtos]
  );

  React.useEffect(() => {
    const n = departmentNames.length;
    if (mode === "CRAFT") {
      setFlowMatrix((prev) => (prev.length === n && (n === 0 || prev[0]?.length === n) ? prev : Array.from({ length: n }, () => Array(n).fill(0))));
      setTransportCostMatrix((prev) => (prev.length === n && (n === 0 || prev[0]?.length === n) ? prev : Array.from({ length: n }, () => Array(n).fill(1))));
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
  const craftGridWidth = Math.max(1, Math.ceil(plantWidthMeters));
  const craftGridHeight = Math.max(1, Math.ceil(plantHeightMeters));
  const activeGridWidth = mode === "CRAFT" ? craftGridWidth : gridW;
  const activeGridHeight = mode === "CRAFT" ? craftGridHeight : gridH;
  const canvasMaxWidth = Math.max(
    CANVAS_MIN_SIZE,
    viewportSize.width - SIDEBAR_WIDTH - CANVAS_PADDING,
  );
  const canvasMaxHeight = Math.max(
    CANVAS_MIN_SIZE,
    viewportSize.height - CANVAS_PADDING,
  );
  const { boardWidth: activeBoardWidth, boardHeight: activeBoardHeight } = getBoardMetrics(
    activeGridWidth,
    activeGridHeight,
    canvasMaxWidth,
    canvasMaxHeight,
  );
  const selectedDept = React.useMemo(
    () => layout.find((dept) => dept.id === selectedDeptId) ?? null,
    [layout, selectedDeptId]
  );

  useEffect(() => {
    function updateViewportSize() {
      if (typeof window === "undefined") return;
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    }

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  React.useEffect(() => {
    let active = true;

    async function checkAuth() {
      try {
        const res = await fetch(`${API_BASE}/main`, {
          credentials: "include",
        });
        if (!res.ok && active) {
          router.replace("/login");
        }
      } catch {
        if (active) {
          router.replace("/login");
        }
      }
    }

    void checkAuth();
    return () => {
      active = false;
    };
  }, [router]);

  function handleResetMain() {
    if (!window.confirm("Reset the current layout and form data on this page?")) return;

    setMode("CRAFT");
    setLayout([]);
    setPlantWidthMeters(150);
    setPlantHeightMeters(150);
    setDistanceType("manhattan");
    setFlowMatrix([]);
    setTransportCostMatrix([]);

    setDeptProtos([]);
    setCellSize(5);
    setGridW(30);
    setGridH(30);
    setWeights({ A: 10, E: 8, I: 6, O: 4, U: 2, X: 0, blank: 0 });

    setAldepLowerBound("A");
    setAldepStripWidth(2);
    setAldepSeeds(8);
    setAldepAllowSplit(true);
    setAldepMaxFrags(3);

    setZoom(1);
    setResult(null);
    setLoading(false);
    setSelectedDeptId(null);
    setLayoutName("");
    setClosenessMatrix([]);
    setOptimized(null);
  }

  /* ---------- submit: CRAFT ---------- */
  async function handleSubmitLayout() {
    setLoading(true); setResult(null); setOptimized(null);
    try {
      if (!projectId) { setShowProjectModal(true); setLoading(false); return; }
      if (layout.length === 0) { alert("โปรดเพิ่มแผนกอย่างน้อย 1 แผนก"); setLoading(false); return; }

      // normalize positions ให้เริ่มที่ 0,0
      const invalidDept = layout.find((dept) => !canPlaceDepartment(dept, layout, craftGridWidth, craftGridHeight));
      if (invalidDept) {
        alert(`Department "${invalidDept.name}" has an invalid shape or overlaps another department`);
        setLoading(false);
        return;
      }
      const minX = Math.min(...layout.flatMap((d) => d.blocks.map((block) => block.x)));
      const minY = Math.min(...layout.flatMap((d) => d.blocks.map((block) => block.y)));
      const departments = layout.map((dept) => normalizeDepartmentForPayload(dept, minX, minY));

      const n = departmentNames.length;

      const flow = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
          const v = Number((flowMatrix?.[i]?.[j] ?? 0));
          return Number.isFinite(v) ? v : 0;
        })
      );
      const transportCost = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
          const v = Number((transportCostMatrix?.[i]?.[j] ?? 1));
          return Number.isFinite(v) ? v : 0;
        })
      );

      if (!(flowMatrix.length === n && flowMatrix.every((r) => r.length === n)
        && transportCostMatrix.length === n && transportCostMatrix.every((r) => r.length === n)
        && closenessMatrix.length === n && closenessMatrix.every((r) => r.length === n))) {
        alert("Matrix size not match with n of depts");
        setLoading(false);
        return;
      }

      const payload = {
        name: layoutName || `Layout ${new Date().toLocaleString()}`,
        plantWidthMeters,
        plantHeightMeters,
        cellSizeMeters: craftCellSizeMeters,
        projectId,
        departments,
        flowMatrix: flow,
        transportCostMatrix: transportCost,
        closenessMatrix,
        metric: distanceType,
      };

      console.log("CRAFT payload", payload);

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
        const message = Array.isArray(createData?.message)
          ? createData.message.join("\n")
          : createData?.message;
        alert(createData?.error || message || `Create failed: HTTP ${createRes.status}`);
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
        const message = Array.isArray(data?.message) ? data.message.join("\n") : data?.message;
        alert(data?.error || message || `Fetch result failed: HTTP ${res.status}`);
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
        const overlay = assignmentRaw.map((d: any) => withDerivedBounds({
          id: d.id || d.name,
          name: d.name,
          targetCellCount: Array.isArray(d.blocks) && d.blocks.length ? d.blocks.length : (d.width * d.height),
          blocks: Array.isArray(d.blocks) && d.blocks.length ? d.blocks : [{ x: d.x, y: d.y, width: d.width, height: d.height }],
          gridSize: Math.max(craftGridWidth, craftGridHeight),
          type: (d.type ?? "dept") as DeptType,
          locked: !!d.locked,
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

      let endpoint = "";
      let payload: any = null;

      if (mode === "CORELAP") {
        endpoint = `${API_BASE}/corelap/generate`;
        payload = {
          name: layoutName || `Generated ${new Date().toLocaleString()}`,
          projectId,
          gridWidth: gridW, gridHeight: gridH,
          departments: deptProtos.map((p) => ({
            name: p.name, fixed: !!p.fixed, area: p.area
          })),
          closenessMatrix: M,
          weights,                // CORELAP ใช้ key 'weights'
          cellSizeMeters: cellSize,
          allowSplitting: true,
          maxFragmentsPerDept: 3,
        };
      } else {
        // === ALDEP ===
        endpoint = `${API_BASE}/aldep/generate`;
        payload = {
          name: layoutName || `ALDEP ${new Date().toLocaleString()}`,
          projectId,
          gridWidth: gridW, gridHeight: gridH,
          departments: deptProtos.map((p) => ({
            name: p.name, fixed: !!p.fixed, area: p.area
          })),
          closenessMatrix: M,
          closenessWeights: weights,  // ALDEP ใช้ key 'closenessWeights'
          cellSizeMeters: cellSize,
          // Heuristics/params
          lowerBound: aldepLowerBound,   // 'A'|'E'|'I'|'O'|'U'|'X'|''
          stripWidth: aldepStripWidth,   // จำนวนคอลัมน์ต่อแถบ (wide sweep = จำนวนคอลัมน์ต่อ strip)
          seeds: aldepSeeds,             // จำนวนครั้งสุ่ม seed (wide sweep)
          allowSplitting: aldepAllowSplit,
          maxFragmentsPerDept: aldepMaxFrags,
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = null; try { data = JSON.parse(text); } catch {}

      if (!res.ok) {
        alert(data?.error || data?.message || text || `HTTP ${res.status}`);
        console.error(`${mode} ${res.status}`, { payload, data });
        return;
      }

      // รองรับหลายโครงสร้างผลลัพธ์
      const first = Array.isArray(data?.candidates) ? data.candidates[0] : data;
      const assignment = first?.placements || first?.assignment || [];
      if (!assignment?.length) { alert(data?.error || "ไม่พบผลลัพธ์จากตัวสร้างผัง"); return; }

      const canvasGrid = Math.max(gridW, gridH);
      const overlay = assignment.map((d: any) => withDerivedBounds({
        id: d.id || d.name,
        name: d.name,
        targetCellCount: Array.isArray(d.blocks) && d.blocks.length ? d.blocks.length : (d.width * d.height),
        blocks: Array.isArray(d.blocks) && d.blocks.length ? d.blocks : [{ x: d.x, y: d.y, width: d.width, height: d.height }],
        gridSize: canvasGrid,
        type: "dept" as DeptType,
        locked: false,
      }));
      setOptimized({
        assignment: overlay,
        totalCost: first?.score?.total ?? first?.totalCost ?? undefined,
        totalDistance: first?.score?.closeness ?? first?.totalDistance ?? undefined
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

  const handleAddDept = (d: Dept) => {
    if (!canPlaceDepartment(d, layout, craftGridWidth, craftGridHeight)) {
      alert("This department overlaps another one or exceeds the plant area");
      return;
    }
    setLayout((prev) => [...prev, d]);
    setSelectedDeptId(d.id);
  };
  const handleImportDepts = (departments: Dept[]) => {
    const nextLayout = [...layout];
    for (const dept of departments) {
      if (!canPlaceDepartment(dept, nextLayout, craftGridWidth, craftGridHeight)) {
        return {
          ok: false,
          message: `Department "${dept.name}" overlaps another one or exceeds the plant area`,
        };
      }
      nextLayout.push(dept);
    }
    setLayout(nextLayout);
    setSelectedDeptId(departments[departments.length - 1]?.id ?? null);
    return { ok: true };
  };
  const handleDeleteDept = (id: string) => {
    setLayout((prev) => prev.filter((d) => d.id !== id));
    setSelectedDeptId((prev) => (prev === id ? null : prev));
  };
  const handleToggleLock = (id: string) => setLayout((prev) => prev.map((d) => (d.id === id ? { ...d, locked: !d.locked } : d)));
  const handleShapeApply = (nextDept: Dept) => {
    setLayout((prev) => prev.map((dept) => (dept.id === nextDept.id ? canonicalizeDepartment(nextDept) : dept)));
  };

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
      <ProjectModalFixed open={showProjectModal} defaultName={projectName} onSubmit={handleProjectCreated} />

      <div className="flex-1 flex items-center justify-center overflow-auto bg-[#002b5c]" onWheel={handleWheel}>
        <div className="flex items-center justify-center w-full h-full px-6 py-8" style={{ minHeight: "100vh" }}>
          <div
            style={{
              width: activeBoardWidth,
              height: activeBoardHeight,
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            {mode === "CRAFT" ? (
              <CraftGridArea
                layout={layout}
                setLayout={setLayout}
                gridWidth={craftGridWidth}
                gridHeight={craftGridHeight}
                maxWidth={canvasMaxWidth}
                maxHeight={canvasMaxHeight}
                overlayAssignment={optimized?.assignment || null}
                selectedDeptId={selectedDeptId}
                onSelectDept={setSelectedDeptId}
              />
            ) : (
              <GridArea
                layout={layout} setLayout={setLayout}
                gridWidth={gridW}
                gridHeight={gridH}
                maxWidth={canvasMaxWidth}
                maxHeight={canvasMaxHeight}
                onLayoutChange={() => {}} overlayAssignment={optimized?.assignment || null}
                draggableEnabled={false}
              />
            )}
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
            <button onClick={handleResetMain} className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-lg shadow">Reset</button>
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
                  const gridApplied = mode === "CRAFT"
                    ? Math.max(craftGridWidth, craftGridHeight)
                    : Math.max(gridW, gridH);
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

        {mode === "CRAFT" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={plantWidthMeters}
                onChange={(e) => setPlantWidthMeters(Number(e.target.value))}
                className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold"
                placeholder="Width (m)"
              />
              <input
                type="number"
                min={1}
                step={1}
                value={plantHeightMeters}
                onChange={(e) => setPlantHeightMeters(Number(e.target.value))}
                className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold"
                placeholder="Length (m)"
              />
            </div>
            <div className="text-sm text-white/70 rounded border border-white/10 px-3 py-2">
              Fixed scale: 1 meter = 1 cell
            </div>
            <div>
              <label className="block mb-1 font-semibold text-[#f0f6fc]">Distance Metric</label>
              <select
                value={distanceType}
                onChange={(e) => setDistanceType(e.target.value as "manhattan" | "euclidean")}
                className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold"
              >
                <option value="manhattan">Manhattan</option>
                <option value="euclidean">Euclidean</option>
              </select>
            </div>
          </div>
        )}

        {mode === "CRAFT" ? (
          <div>
            <label className="block mb-1 font-semibold text-[#f0f6fc]">ขนาดกริด (cells ต่อด้าน):</label>
            <input type="text" readOnly value={`${craftGridWidth} x ${craftGridHeight} cells`}
                   className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold"/>
          </div>
        ) : (
          <DeptProtoPanel
            protos={deptProtos} setProtos={setDeptProtos}
            cellSize={cellSize} setCellSize={setCellSize}
            gridW={gridW} gridH={gridH} setGridW={setGridW} setGridH={setGridH}
          />
        )}

        {/* === ALDEP Settings (เฉพาะตอนเลือก ALDEP) === */}
        {mode === "ALDEP" && (
          <div className="space-y-3 mt-2">
            <div className="font-semibold text-[#f0f6fc]">ALDEP Settings</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-[#f0f6fc]">Lower Bound</label>
                <select
                  value={aldepLowerBound}
                  onChange={(e) => setAldepLowerBound(e.target.value as any)}
                  className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
                >
                  {["A","E","I","O","U","X",""].map((k) => (
                    <option key={k} value={k}>{k || "(blank)"}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#f0f6fc]">Strip Width (columns)</label>
                <input
                  type="number" min={1}
                  value={aldepStripWidth}
                  onChange={(e) => setAldepStripWidth(Number(e.target.value))}
                  className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
                />
              </div>
              <div>
                <label className="text-xs text-[#f0f6fc]">Seeds (wide sweep)</label>
                <input
                  type="number" min={1}
                  value={aldepSeeds}
                  onChange={(e) => setAldepSeeds(Number(e.target.value))}
                  className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
                />
              </div>
              <div>
                <label className="text-xs text-[#f0f6fc]">Max Fragments / dept</label>
                <input
                  type="number" min={1}
                  value={aldepMaxFrags}
                  onChange={(e) => setAldepMaxFrags(Number(e.target.value))}
                  className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c]"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  id="aldepSplit"
                  type="checkbox"
                  checked={aldepAllowSplit}
                  onChange={(e) => setAldepAllowSplit(e.target.checked)}
                />
                <label htmlFor="aldepSplit" className="text-[#f0f6fc] text-sm">
                  Allow splitting
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="mt-2">
          <div className="flex gap-2 mb-2">
            <button className={`px-3 py-1 rounded ${mode === "CRAFT" ? "bg-white text-slate-900" : "bg-white/40 cursor-not-allowed"}`} disabled={mode !== "CRAFT"}>Flow/Workload Matrix</button>
            <button className={`px-3 py-1 rounded ${mode === "CRAFT" ? "bg-white text-slate-900" : "bg-white/40 cursor-not-allowed"}`} disabled={mode !== "CRAFT"}>Transport Cost Matrix</button>
            <button className="px-3 py-1 rounded bg-white/70 text-slate-900">Closeness Matrix</button>
          </div>
          {mode === "CRAFT" && (<FlowMatrixInput matrix={flowMatrix} setMatrix={setFlowMatrix} departmentNames={departmentNames} />)}
          {mode === "CRAFT" && (<TransportCostMatrixInput matrix={transportCostMatrix} setMatrix={setTransportCostMatrix} departmentNames={departmentNames} />)}
          <ClosenessMatrixInput matrix={closenessMatrix} setMatrix={setClosenessMatrix} departmentNames={departmentNames} />
        </div>

        {mode !== "CRAFT" && <WeightsPanel weights={weights} setWeights={setWeights} />}

        <div>
          <div className="font-bold text-[#e0f2fe] mb-2">{mode === "CRAFT" ? "CRAFT Result" : "Generated Result"}</div>
          {loading && <div className="text-white/80 mb-2">Loading result...</div>}
          {result ? (
            <div className="bg-white/10 rounded-lg p-3 text-white space-y-1">
              {"totalCost" in result && <div>Total Cost: {result.totalCost ?? result?.score?.total}</div>}
              {"totalDistance" in result && <div>Total Distance: {result.totalDistance ?? result?.score?.closeness}</div>}
              {Array.isArray(result?.order) && (
                <div className="text-xs">Order: {result.order.join(" → ")}</div>
              )}
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
            <AddDepartmentFormFixed
              onAdd={handleAddDept}
              onImport={handleImportDepts}
              gridWidth={craftGridWidth}
              gridHeight={craftGridHeight}
            />
            <ShapeEditorPanel
              selectedDept={selectedDept}
              layout={layout}
              gridWidth={craftGridWidth}
              gridHeight={craftGridHeight}
              onApply={handleShapeApply}
            />
            <DepartmentList
              layout={layout}
              selectedDeptId={selectedDeptId}
              onDelete={handleDeleteDept}
              onToggleLock={handleToggleLock}
              onSelect={setSelectedDeptId}
            />
          </>
        )}
      </div>
    </div>
  );
}

"use client";
import React, { useState } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";

// --- CONFIG ---
const CANVAS_SIZE = 900; // px, ปรับตามต้องการ

function getMeter(gridSize: number) {
  return CANVAS_SIZE / gridSize;
}

function DraggableDepartment({ dept }: { dept: any }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: dept.id,
  });

  const style = {
    position: "absolute" as const,
    top: dept.y * getMeter(dept.gridSize),
    left: dept.x * getMeter(dept.gridSize),
    width: dept.width * getMeter(dept.gridSize),
    height: dept.height * getMeter(dept.gridSize),
    background: "linear-gradient(135deg, #4ade80 80%, #15803d 100%)",
    boxShadow: "0 4px 16px 0 rgb(0 0 0 / 0.18)",
    borderRadius: "0.6rem",
    color: "#002b5c",
    fontWeight: "bold" as const,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    cursor: "grab",
    zIndex: 2,
    border: "2px solid #1e293b"
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
    </div>
  );
}

function GridArea({
  layout,
  setLayout,
  gridSize,
  onLayoutChange,
}: {
  layout: any[];
  setLayout: (l: any[]) => void;
  gridSize: number;
  onLayoutChange: (next: any[]) => void;
}) {
  const { setNodeRef } = useDroppable({ id: "layout" });

  function handleDragEnd(event: any) {
    const { active, delta } = event;
    const deptIndex = layout.findIndex((d) => d.id === active.id);
    if (deptIndex === -1) return;
    const moved = layout[deptIndex];

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
    onLayoutChange(newLayout); // Sync to backend ทุกครั้งที่ drag
  }

  // grid background, fade effect
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
        {/* fade layer */}
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
          <DraggableDepartment key={dept.id} dept={dept} />
        ))}
        {/* hint */}
        {layout.length === 0 && (
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

function AddDepartmentForm({ onAdd, layout, onDelete, gridSize }: { onAdd: (dept: any) => void; layout: any[]; onDelete: (id: string) => void; gridSize: number }) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !width || !height || !x || !y) return alert("กรุณากรอกข้อมูลให้ครบ");

    const widthNum = Number(width);
    const heightNum = Number(height);
    const xNum = Number(x);
    const yNum = Number(y);

    if (xNum < 0 || yNum < 0 || widthNum <= 0 || heightNum <= 0) {
      return alert("ตำแหน่งและขนาดต้องเป็นค่าบวก");
    }
    if (xNum + widthNum > gridSize || yNum + heightNum > gridSize) {
      return alert("ตำแหน่งและขนาดเกินพื้นที่ทั้งหมด");
    }

    const newDept = {
      id: `dept_${Date.now()}`,
      name,
      width: widthNum,
      height: heightNum,
      x: xNum,
      y: yNum,
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
        <label className="block text-sm font-medium mb-1 text-[#f0f6fc]">ชื่อแผนก</label>
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
      <button
        type="submit"
        className="w-full bg-gradient-to-r from-blue-500 to-green-400 text-white py-2 rounded-lg font-bold shadow transition hover:scale-[1.03] hover:shadow-lg duration-150"
      >
        + เพิ่มแผนก
      </button>
    </form>
  );
}

function DepartmentList({ layout, onDelete }: { layout: any[]; onDelete: (id: string) => void }) {
  return (
    <div>
      <div className="font-semibold text-[#f0f6fc] mb-2 mt-4">แผนก</div>
      <div className="bg-white/20 rounded-lg p-2 min-h-[40px]">
        {layout.length === 0 ? (
          <p className="text-sm text-white/70">None</p>
        ) : (
          <ul className="space-y-1">
            {layout.map((dept) => (
              <li key={dept.id} className="flex justify-between items-center py-1 px-1 rounded hover:bg-white/30 transition">
                <span className="font-medium text-[#e0f2fe]">{dept.name}</span>
                <button
                  onClick={() => onDelete(dept.id)}
                  className="text-xs text-red-400 hover:text-red-600 font-semibold px-2 py-1 rounded transition"
                  title="Delete"
                  type="button"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


export default function PlantLayout() {
  const [layout, setLayout] = useState<any[]>([]);
  const [gridSize, setGridSize] = useState(30);
  const [zoom, setZoom] = useState(1);

  async function syncLayoutToBackend(nextLayout: any[]) {
    try {
      await fetch('/api/plant-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextLayout),
      });
    } catch (err) {
      console.error("Sync layout failed:", err);
    }
  }

  const handleAddDept = (newDept: any) => {
    const next = [...layout, newDept];
    setLayout(next);
    syncLayoutToBackend(next);
  };
  const handleDeleteDept = (id: string) => {
    const next = layout.filter((d) => d.id !== id);
    setLayout(next);
    syncLayoutToBackend(next);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      setZoom(z => Math.min(3, Math.max(0.5, z - e.deltaY * 0.001)));
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#001d3d]">
      <div className="flex-1 flex items-center justify-center overflow-auto bg-[#002b5c]" onWheel={handleWheel}>
        <div
          className="flex items-center justify-center w-full h-full"
          style={{ minHeight: CANVAS_SIZE, minWidth: CANVAS_SIZE }}
        >
          <div style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
            <GridArea
              layout={layout}
              setLayout={setLayout}
              gridSize={gridSize}
              onLayoutChange={syncLayoutToBackend}
            />
          </div>
        </div>
      </div>
      <div className="w-full max-w-[390px] min-w-[310px] h-full px-5 py-7 bg-white/20 backdrop-blur-md border-l border-white/30 shadow-2xl flex flex-col gap-7">
        <div>
          <h1 className="text-2xl font-extrabold text-[#f0f6fc] tracking-wide mb-3">Plant Design</h1>
          <div className="mb-6">
            <label className="block mb-1 font-semibold text-[#f0f6fc]">ขนาดกริด (เมตร):</label>
            <input
              type="number"
              min={5}
              max={100}
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold"
            />
          </div>
          <div className="border-b border-white/30 my-2" />
        </div>
        <AddDepartmentForm onAdd={handleAddDept} layout={layout} onDelete={handleDeleteDept} gridSize={gridSize} />
        <DepartmentList layout={layout} onDelete={handleDeleteDept} />
      </div>
    </div>
  );
}

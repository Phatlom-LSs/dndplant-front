"use client";
import React, { useState } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";

const CANVAS_SIZE = 900;
const API_BASE = process.env.NEXT_PUBLIC_CRAFT_CREATE_API

// ----------- Utils -----------
function getMeter(gridSize) {
  return CANVAS_SIZE / gridSize;
}

// ----------- DraggableDepartment -----------
function DraggableDepartment({ dept }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: dept.id });
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
    fontWeight: "bold",
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    cursor: "grab",
    zIndex: 2,
    border: "2px solid #1e293b",
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

// ----------- GridArea -----------
function GridArea({ layout, setLayout, gridSize, onLayoutChange }) {
  const { setNodeRef } = useDroppable({ id: "layout" });
  function handleDragEnd(event) {
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
            background: "linear-gradient(135deg,rgba(0,0,0,0.05) 30%,rgba(255,255,255,0.06) 100%)",
            zIndex: 1,
          }}
        />
        {layout.map((dept) => (
          <DraggableDepartment key={dept.id} dept={dept} />
        ))}
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

// ----------- AddDepartmentForm -----------
function AddDepartmentForm({ onAdd, layout, onDelete, gridSize }) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !width || !height || !x || !y) return alert("กรุณากรอกข้อมูลให้ครบ");
    const widthNum = Number(width);
    const heightNum = Number(height);
    const xNum = Number(x);
    const yNum = Number(y);
    if (xNum < 0 || yNum < 0 || widthNum <= 0 || heightNum <= 0) return alert("ตำแหน่งและขนาดต้องเป็นค่าบวก");
    if (xNum + widthNum > gridSize || yNum + heightNum > gridSize) return alert("ตำแหน่งและขนาดเกินพื้นที่ทั้งหมด");
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
    setName(""); setWidth(""); setHeight(""); setX(""); setY("");
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-[#f0f6fc]">ชื่อแผนก</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner focus:ring-2 focus:ring-[#4ade80]" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">กว้าง (ม.)</label>
          <input type="number" min={1} max={gridSize} value={width} onChange={(e) => setWidth(e.target.value)} required className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner" />
        </div>
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">สูง (ม.)</label>
          <input type="number" min={1} max={gridSize} value={height} onChange={(e) => setHeight(e.target.value)} required className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">ตำแหน่ง X</label>
          <input type="number" min={0} max={gridSize} value={x} onChange={(e) => setX(e.target.value)} required className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner" />
        </div>
        <div className="flex-1">
          <label className="block text-sm mb-1 text-[#f0f6fc]">ตำแหน่ง Y</label>
          <input type="number" min={0} max={gridSize} value={y} onChange={(e) => setY(e.target.value)} required className="w-full border px-2 py-1 rounded bg-white/80 text-[#002b5c] shadow-inner" />
        </div>
      </div>
      <button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-400 text-white py-2 rounded-lg font-bold shadow transition hover:scale-[1.03] hover:shadow-lg duration-150">
        + เพิ่มแผนก
      </button>
    </form>
  );
}

// ----------- DepartmentList -----------
function DepartmentList({ layout, onDelete }) {
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
                <button onClick={() => onDelete(dept.id)} className="text-xs text-red-400 hover:text-red-600 font-semibold px-2 py-1 rounded transition" title="Delete" type="button">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ----------- FlowMatrixInput -----------
function FlowMatrixInput({ matrix, setMatrix, departmentNames }) {
  const n = departmentNames.length;
  React.useEffect(() => {
    if (matrix.length !== n) {
      setMatrix(Array(n).fill(0).map(() => Array(n).fill(0)));
    }
  }, [n]);
  function handleChange(i, j, v) {
    const newMatrix = matrix.map((row) => [...row]);
    newMatrix[i][j] = Number(v);
    setMatrix(newMatrix);
  }
  if (n === 0) return null;
  return (
    <div className="my-2">
      <div className="font-semibold text-[#f0f6fc] mb-2">
        Flow/Cost Matrix (ระหว่างแผนก)
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse bg-white/10 text-xs text-[#e0f2fe]">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-[#334155]">To/From</th>
              {departmentNames.map((name, i) => (
                <th className="border px-2 py-1 bg-[#334155]" key={i}>{name}</th>
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
                      min={0}
                      value={matrix[i]?.[j] ?? 0}
                      onChange={e => handleChange(i, j, e.target.value)}
                      className="w-14 px-1 py-1 rounded text-[#0f172a] bg-white/80 text-center border"
                    />
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

// ----------- ProjectModal -----------
function ProjectModal({ open, onSubmit }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  async function handleCreate() {
    if (!name) return alert("กรุณากรอกชื่อโปรเจกต์");
    setLoading(true);
    const userId = 1; // สมมติ user id
    const res = await fetch(`${API_BASE}/craft/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, userId }),
    });
    const data = await res.json();
    onSubmit(data.id); // backend ต้องคืน { id }
    setLoading(false);
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-black rounded-xl p-6 max-w-xs w-full shadow-2xl flex flex-col">
        <div className="font-bold text-lg mb-3 text-blue-900">สร้างโปรเจกต์ใหม่</div>
        <input
          className="border px-2 py-1 rounded mb-3"
          placeholder="Project name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <button
          onClick={handleCreate}
          className="bg-blue-600 text-white font-bold rounded px-4 py-2"
          disabled={loading}
        >
          {loading ? "กำลังสร้าง..." : "สร้างโปรเจกต์"}
        </button>
      </div>
    </div>
  );
}

// ----------- Main PlantLayout Component -----------
export default function PlantLayout() {
  const [layout, setLayout] = useState([]);
  const [gridSize, setGridSize] = useState(30);
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // modal project
  const [projectId, setProjectId] = useState("");
  const [showProjectModal, setShowProjectModal] = useState(true);
  const [layoutName, setLayoutName] = useState(""); // ตั้งชื่อ layout

  // flow matrix
  const [flowMatrix, setFlowMatrix] = useState([]);
  const departmentNames = layout.map((d) => d.name);

  // distance type
  const [distanceType, setDistanceType] = useState("manhattan");

  React.useEffect(() => {
    setFlowMatrix((prev) => {
      if (prev.length !== layout.length) {
        return Array(layout.length).fill(0).map(() => Array(layout.length).fill(0));
      }
      return prev;
    });
  }, [layout.length]);

  async function handleSubmitLayout() {
    setLoading(true);
    setResult(null);
    try {
      if (!projectId) {
        alert("ต้องสร้างโปรเจกต์ก่อน");
        setLoading(false);
        return;
      }
      const departments = layout.map(({ id, gridSize, ...rest }) => rest);
      const payload = {
        name: layoutName,
        gridSize,
        projectId,
        departments,
        costMatrix: flowMatrix,
        metric: distanceType,
      };
      // POST layout
      const createRes = await fetch(`${API_BASE}/craft/layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const createData = await createRes.json();
      console.log('createData:', createData)
      // ดึง layoutId จาก backend
      const layoutId = createData.layoutId || createData.id || createData?.result?.layoutId;
      if (!layoutId) {
        alert("Backend ไม่คืน layoutId กรุณาตรวจสอบ backend");
        setLoading(false);
        return;
      }
      // GET CRAFT result
      const res = await fetch(`${API_BASE}/craft/result?layoutId=${layoutId}`);
      const data = await res.json();
      console.log("Result data from API:", data);
      setResult(data);
      setLoading(false);
    } catch (err) {
      alert("ส่ง layout หรือดึงผลลัพธ์ไม่สำเร็จ");
      setLoading(false);
    }
  }

  function handleProjectCreated(id) {
    setProjectId(id);
    setShowProjectModal(false);
  }

  function handleLogout() {
    window.location.href = "/login";
  }

  function handleWheel(e) {
    if (e.ctrlKey) {
      e.preventDefault();
      setZoom((z) => Math.min(3, Math.max(0.5, z - e.deltaY * 0.001)));
    }
  }

  const handleAddDept = (newDept) => {
    const next = [...layout, newDept];
    setLayout(next);
  };
  const handleDeleteDept = (id) => {
    const next = layout.filter((d) => d.id !== id);
    setLayout(next);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#001d3d]">
      <ProjectModal open={showProjectModal} onSubmit={handleProjectCreated} />
      <div className="flex-1 flex items-center justify-center overflow-auto bg-[#002b5c]" onWheel={handleWheel}>
        <div className="flex items-center justify-center w-full h-full" style={{ minHeight: CANVAS_SIZE, minWidth: CANVAS_SIZE }}>
          <div style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
            <GridArea layout={layout} setLayout={setLayout} gridSize={gridSize} onLayoutChange={() => {}} />
          </div>
        </div>
      </div>
      <div className="w-full max-w-[430px] min-w-[310px] h-full px-5 py-7 bg-white/20 backdrop-blur-md border-l border-white/30 shadow-2xl flex flex-col gap-6 overflow-y-auto">
        <div className="flex justify-end gap-2">
          <button onClick={handleLogout} className="bg-gradient-to-r from-blue-600 to-green-400 text-white font-bold px-4 py-2 rounded-lg shadow hover:scale-[1.04] transition" title="Logout">Logout</button>
          <button onClick={handleSubmitLayout} className="bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold px-4 py-2 rounded-lg shadow hover:scale-[1.04] transition" title="Submit Layout" disabled={loading}>
            {loading ? "Loading..." : "Submit Layout"}
          </button>
        </div>
        <div className="mb-2">
          <label className="block mb-1 font-semibold text-[#f0f6fc]">Layout Name</label>
          <input type="text" value={layoutName} onChange={e => setLayoutName(e.target.value)} placeholder="Layout Name" className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold mb-2" />
        </div>
        <div>
          <label className="block mb-1 font-semibold text-[#f0f6fc]">ขนาดกริด (เมตร):</label>
          <input type="number" min={5} max={100} value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))} className="w-full border px-2 py-1 rounded shadow-inner bg-white/70 text-[#002b5c] font-semibold" />
        </div>
        <div className="border-b border-white/30 my-2" />
        <FlowMatrixInput matrix={flowMatrix} setMatrix={setFlowMatrix} departmentNames={departmentNames} />
        <div className="mb-3">
          <div className="font-semibold text-[#f0f6fc] mb-1">ระยะทาง</div>
          <div className="flex gap-4">
            <label className="flex items-center gap-1 text-[#e0f2fe] text-sm">
              <input type="radio" name="distanceType" value="manhattan" checked={distanceType === "manhattan"} onChange={() => setDistanceType("manhattan")} /> Manhattan
            </label>
            <label className="flex items-center gap-1 text-[#e0f2fe] text-sm">
              <input type="radio" name="distanceType" value="euclidean" checked={distanceType === "euclidean"} onChange={() => setDistanceType("euclidean")} /> Euclidean
            </label>
          </div>
        </div>
        <div>
          <div className="font-bold text-[#e0f2fe] mb-2">CRAFT Result</div>
          {loading && <div className="text-white/80 mb-2">Loading result...</div>}
          {result ? (
            <div className="bg-white/10 rounded-lg p-3 text-white space-y-1">
              <div>Total Cost: {result.totalCost}</div>
              <div>Total Distance: {result.totalDistance}</div>
              <div>
                Assignment:{" "}
                {result.assignment && result.assignment.map((d, i) =>
                  <div key={i} className="ml-2">
                    {d.name} ({d.x}, {d.y}) size {d.width}x{d.height}
                  </div>
                )}
              </div>
            </div>
          ) : !loading && <div className="text-white/50">ยังไม่มีผลลัพธ์</div>}
        </div>
        <AddDepartmentForm onAdd={handleAddDept} layout={layout} onDelete={handleDeleteDept} gridSize={gridSize} />
        <DepartmentList layout={layout} onDelete={handleDeleteDept} />
      </div>
    </div>
  );
}

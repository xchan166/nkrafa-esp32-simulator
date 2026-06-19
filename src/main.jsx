import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Play,
  Plus,
  Save,
  Share2,
  Trash2,
  RotateCw,
  X
} from "lucide-react";
import "./style.css";

const APP_NAME = "NKRAFA ESP32 Simulator";
const STORAGE_KEY = "nkrafa-esp32-simulator-diagram";
const GRID_SIZE = 10;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;


const starterSketch = `void setup() {
  Serial.begin(115200);
  Serial.println("Hello, ESP32!");
}

void loop() {
  delay(10);
}`;

const templates = {
  "nk-led": { type: "nk-led", attrs: { color: "red" } },
  "nk-resistor": { type: "nk-resistor", attrs: { value: "1000" } },
  "nk-pushbutton": { type: "nk-pushbutton", attrs: { color: "green" } },
  "nk-dht22": { type: "nk-dht22", attrs: {} },
  "nk-hc-sr04": { type: "nk-hc-sr04", attrs: {} },
  "nk-lcd1602-i2c": { type: "nk-lcd1602-i2c", attrs: { address: "0x27" } },
  "nk-ssd1306": { type: "nk-ssd1306", attrs: { i2cAddress: "0x3C" } }
};

const initialDiagram = {
  version: 1,
  platform: APP_NAME,
  parts: [
    {
      type: "nk-esp32-devkit-c-v4",
      id: "esp",
      top: 165,
      left: 260,
      attrs: {}
    }
  ],
  connections: [
    ["esp:TX", "$serialMonitor:RX", "", []],
    ["esp:RX", "$serialMonitor:TX", "", []]
  ],
  dependencies: {}
};

function pinDefs(part) {
  if (part.type.includes("esp32")) {
    const left = [
      "3V3",
      "EN",
      "VP",
      "VN",
      "34",
      "35",
      "32",
      "33",
      "25",
      "26",
      "27",
      "14",
      "12",
      "GND",
      "13",
      "D2",
      "D3",
      "CMD",
      "5V"
    ];

    const right = [
      "GND",
      "23",
      "22",
      "TX",
      "RX",
      "21",
      "GND.3",
      "19",
      "18",
      "5",
      "17",
      "16",
      "4",
      "0",
      "2",
      "15",
      "D1",
      "D0",
      "CLK"
    ];

    return [
      ...left.map((name, i) => ({
        name,
        x: 4,
        y: 70 + i * 11
      })),
      ...right.map((name, i) => ({
        name,
        x: 146,
        y: 70 + i * 11
      }))
    ];
  }

  if (part.type === "nk-led") {
    return [
      { name: "A", x: 17, y: 82 },
      { name: "C", x: 31, y: 82 }
    ];
  }

  if (part.type.includes("resistor")) {
    return [
      { name: "1", x: 0, y: 22 },
      { name: "2", x: 110, y: 22 }
    ];
  }

  if (part.type.includes("pushbutton")) {
    return [
      { name: "1.l", x: 0, y: 14 },
      { name: "1.r", x: 76, y: 14 },
      { name: "2.l", x: 0, y: 42 },
      { name: "2.r", x: 76, y: 42 }
    ];
  }

  if (part.type.includes("lcd") || part.type.includes("ssd1306")) {
    return [
      { name: "GND", x: 16, y: 62 },
      { name: "VCC", x: 48, y: 62 },
      { name: "SCL", x: 82, y: 62 },
      { name: "SDA", x: 116, y: 62 }
    ];
  }

  if (part.type.includes("dht22")) {
    return [
      { name: "VCC", x: 18, y: 58 },
      { name: "SDA", x: 43, y: 58 },
      { name: "GND", x: 68, y: 58 }
    ];
  }

  if (part.type.includes("hc-sr04")) {
    return [
      { name: "VCC", x: 12, y: 58 },
      { name: "TRIG", x: 42, y: 58 },
      { name: "ECHO", x: 72, y: 58 },
      { name: "GND", x: 98, y: 58 }
    ];
  }

  return [];
}

function getPinPoint(diagram, ref) {
  const [id, pinName] = ref.split(":");
  const part = diagram.parts.find((p) => p.id === id);

  if (!part) return null;

  const pin = pinDefs(part).find((p) => p.name === pinName);

  if (!pin) return null;

  return {
    x: part.left + pin.x,
    y: part.top + pin.y
  };
}

function snapPoint(p, grid = GRID_SIZE) {
  return {
    x: Math.round(p.x / grid) * grid,
    y: Math.round(p.y / grid) * grid
  };
}

function makePolylinePath(points) {
  if (!points || points.length < 2) return "";

  const [first, ...rest] = points;

  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((p) => `L ${p.x} ${p.y}`)
  ].join(" ");
}

function makeSmartWirePoints(start, waypoints, end) {
  const points = [
    snapPoint(start),
    ...(waypoints || []).map((p) => snapPoint(p)),
    snapPoint(end)
  ];

  if (points.length < 2) return [];

  const pathPoints = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = pathPoints[pathPoints.length - 1];
    const next = points[i];

    if (prev.x === next.x || prev.y === next.y) {
      pathPoints.push(next);
    } else {
      pathPoints.push({
        x: next.x,
        y: prev.y
      });

      pathPoints.push(next);
    }
  }

  return cleanWirePathPoints(pathPoints);
}

function makeSmartWirePath(start, waypoints, end) {
  return makePolylinePath(makeSmartWirePoints(start, waypoints, end));
}

function cleanWirePathPoints(points) {
  if (!Array.isArray(points) || points.length <= 2) return points || [];

  const deduped = [];

  for (const p of points) {
    const last = deduped[deduped.length - 1];

    if (!last || last.x !== p.x || last.y !== p.y) {
      deduped.push(p);
    }
  }

  if (deduped.length <= 2) return deduped;

  const cleaned = [deduped[0]];

  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = cleaned[cleaned.length - 1];
    const current = deduped[i];
    const next = deduped[i + 1];

    const sameVertical = prev.x === current.x && current.x === next.x;
    const sameHorizontal = prev.y === current.y && current.y === next.y;

    if (!sameVertical && !sameHorizontal) {
      cleaned.push(current);
    }
  }

  cleaned.push(deduped[deduped.length - 1]);

  return cleaned;
}

function bendWireSegmentInDiagram(diagram, wireIndex, segmentIndex, rawPoint) {
  const connection = diagram.connections[wireIndex];

  if (!connection || connection[0]?.includes("$") || connection[1]?.includes("$")) {
    return diagram;
  }

  const start = getPinPoint(diagram, connection[0]);
  const end = getPinPoint(diagram, connection[1]);

  if (!start || !end) return diagram;

  const waypoints = Array.isArray(connection[3]) ? connection[3] : [];
  const pathPoints = makeSmartWirePoints(start, waypoints, end);

  if (segmentIndex < 0 || segmentIndex >= pathPoints.length - 1) {
    return diagram;
  }

  const p0 = pathPoints[segmentIndex];
  const p1 = pathPoints[segmentIndex + 1];
  const p = snapPoint(rawPoint);

  let replacement;

  if (p0.x === p1.x) {
    replacement = [
      { x: p.x, y: p0.y },
      { x: p.x, y: p1.y }
    ];
  } else {
    replacement = [
      { x: p0.x, y: p.y },
      { x: p1.x, y: p.y }
    ];
  }

  const nextPathPoints = [
    ...pathPoints.slice(0, segmentIndex),
    ...replacement,
    ...pathPoints.slice(segmentIndex + 2)
  ];

  const cleaned = cleanWirePathPoints(nextPathPoints);
  const nextWaypoints = cleaned.slice(1, -1);

  const nextConnections = diagram.connections.map((c, i) =>
    i === wireIndex ? [c[0], c[1], c[2] || "green", nextWaypoints] : c
  );

  return {
    ...diagram,
    connections: nextConnections
  };
}

function partClass(type) {
  if (type.includes("esp32")) return "esp32-board";
  if (type.includes("led")) return "led-part";
  if (type.includes("resistor")) return "resistor-part";
  if (type.includes("pushbutton")) return "button-part";
  if (type.includes("lcd")) return "lcd-part";
  if (type.includes("ssd1306")) return "oled-part";
  return "sensor-part";
}

function PartView({
  part,
  selected,
  onSelect,
  onDragStart,
  onPinClick,
  onPinHover,
  onPinLeave
}) {
  const pins = pinDefs(part);
  const color = part.attrs?.color || "red";

  return (
    <div
      className={`part ${partClass(part.type)} ${
        selected ? "selected" : ""
      }`}
      style={{
        left: part.left,
        top: part.top,
        transform: part.rotate
          ? `rotate(${part.rotate}deg)`
          : undefined
      }}
      onMouseDown={(e) => onDragStart(e, part.id)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(part.id);
      }}
    >
      {part.type.includes("esp32") && (
        <>
          <div className="antenna" />
          <div className="esp-module">
            ESP32
            <div className="wifi">◔</div>
          </div>
          <div className="usb" />
          <div className="chip" />
        </>
      )}

      {part.type === "nk-led" && (
        <>
          <div
            className="led-head"
            style={{
              background: color,
              boxShadow: `0 0 14px ${color}`
            }}
          />
          <div className="led-leg a" />
          <div className="led-leg c" />
        </>
      )}

      {part.type.includes("resistor") && (
        <>
          <div className="res-wire" />
          <div className="res-body">
            <span>{part.attrs?.value || "1k"}</span>
          </div>
        </>
      )}

      {part.type.includes("pushbutton") && (
        <div
          className="button-core"
          style={{ background: color }}
        />
      )}

      {part.type.includes("lcd") && (
        <div className="lcd-screen">LCD 16x2</div>
      )}

      {part.type.includes("ssd1306") && (
        <div className="oled-screen">OLED</div>
      )}

      {part.type.includes("dht22") && (
        <div className="sensor-label">DHT22</div>
      )}

      {part.type.includes("hc-sr04") && (
        <div className="sensor-label">HC-SR04</div>
      )}

      {pins.map((pin) => (
        <button
          key={pin.name}
          className="pin"
          title={`${part.id}:${pin.name}`}
          style={{
            left: pin.x - 6,
            top: pin.y - 6
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={(e) => {
            e.stopPropagation();

            const rect = e.currentTarget.getBoundingClientRect();
            const simRect = document
              .querySelector(".sim-area")
              .getBoundingClientRect();

            onPinHover({
              ref: `${part.id}:${pin.name}`,
              label: pin.name,
              x: rect.left - simRect.left + 12,
              y: rect.top - simRect.top - 8
            });
          }}
          onMouseLeave={(e) => {
            e.stopPropagation();
            onPinLeave();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onPinClick(`${part.id}:${pin.name}`);
          }}
        />
      ))}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState("code");
  const [sketch, setSketch] = useState(starterSketch);
  const [diagram, setDiagram] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
        initialDiagram
      );
    } catch {
      return initialDiagram;
    }
  });

  const [selectedId, setSelectedId] = useState(null);
  const [selectedWireId, setSelectedWireId] = useState(null);
  const [hoveredWireId, setHoveredWireId] = useState(null);
  const [hoveredPin, setHoveredPin] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [dragPoint, setDragPoint] = useState(null);

  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const [partsOpen, setPartsOpen] = useState(false);

  const [wireStart, setWireStart] = useState(null);
  const [wirePoints, setWirePoints] = useState([]);
  const [mousePoint, setMousePoint] = useState(null);

  const [serial, setSerial] = useState("Serial Monitor: Ready...");
  const [jsonText, setJsonText] = useState(
    JSON.stringify(diagram, null, 2)
  );

  const dragRef = useRef(null);

  const editorText = tab === "json" ? jsonText : sketch;
  const lineCount = editorText.split("\n").length;

  function applyDiagram(next) {
    setDiagram(next);
    setJsonText(JSON.stringify(next, null, 2));
  }

  function updateDiagram(next, options = { saveHistory: true }) {
    if (options.saveHistory) {
      setHistory((old) => [
        ...old,
        JSON.stringify(diagram)
      ].slice(-50));
      setRedoStack([]);
    }

    applyDiagram(next);
  }

  function undo() {
    if (!history.length) {
      setSerial("Nothing to undo");
      return;
    }

    const previous = history[history.length - 1];

    setRedoStack((old) => [
      ...old,
      JSON.stringify(diagram)
    ].slice(-50));

    setHistory((old) => old.slice(0, -1));
    applyDiagram(JSON.parse(previous));
    setSelectedId(null);
    setSelectedWireId(null);
    cancelWire();
    setSerial("Undo");
  }

  function redo() {
    if (!redoStack.length) {
      setSerial("Nothing to redo");
      return;
    }

    const next = redoStack[redoStack.length - 1];

    setHistory((old) => [
      ...old,
      JSON.stringify(diagram)
    ].slice(-50));

    setRedoStack((old) => old.slice(0, -1));
    applyDiagram(JSON.parse(next));
    setSelectedId(null);
    setSelectedWireId(null);
    cancelWire();
    setSerial("Redo");
  }

  function makeUniquePartId(type) {
    const base = type
      .replace(/^nk-/, "")
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 10)
      .toLowerCase();

    let n = diagram.parts.length + 1;
    let id = `${base}${n}`;

    while (diagram.parts.some((p) => p.id === id)) {
      n += 1;
      id = `${base}${n}`;
    }

    return id;
  }

  function duplicateSelected() {
    if (!selectedId) return;

    const part = diagram.parts.find((p) => p.id === selectedId);
    if (!part) return;

    const copy = {
      ...part,
      id: makeUniquePartId(part.type),
      left: snapPoint({ x: part.left + 30, y: part.top + 30 }).x,
      top: snapPoint({ x: part.left + 30, y: part.top + 30 }).y,
      attrs: { ...(part.attrs || {}) }
    };

    updateDiagram({
      ...diagram,
      parts: [...diagram.parts, copy]
    });

    setSelectedId(copy.id);
    setSelectedWireId(null);
    setSerial(`Duplicated ${part.id} → ${copy.id}`);
  }

  function zoomIn() {
    setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.1) * 10) / 10));
  }

  function zoomOut() {
    setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.1) * 10) / 10));
  }

  function resetZoom() {
    setZoom(1);
  }

  function beginWireControlDrag(e, wireIndex, segmentIndex) {
    e.stopPropagation();

    setHistory((old) => [
      ...old,
      JSON.stringify(diagram)
    ].slice(-50));

    setRedoStack([]);
    setSelectedWireId(wireIndex);
    setSelectedId(null);
    setDragPoint({
      wire: wireIndex,
      segment: segmentIndex
    });
  }

  function updateWireControlDrag(point) {
    if (!dragPoint) return;

    setDiagram((old) => {
      const next = bendWireSegmentInDiagram(
        old,
        dragPoint.wire,
        dragPoint.segment,
        point
      );

      setJsonText(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function stopWireControlDrag() {
    setDragPoint(null);
  }

  function onEditorChange(value) {
    if (tab === "code") {
      setSketch(value);
      return;
    }

    setJsonText(value);

    try {
      updateDiagram(JSON.parse(value), { saveHistory: false });
    } catch {
      // Allow temporary invalid JSON while typing.
    }
  }

  function addPart(type) {
    const template = templates[type];

    if (!template) return;

    const id = makeUniquePartId(type);

    const next = {
      ...diagram,
      parts: [
        ...diagram.parts,
        {
          type: template.type,
          id,
          top: 110 + diagram.parts.length * 22,
          left: 150 + diagram.parts.length * 30,
          attrs: { ...template.attrs }
        }
      ]
    };

    setSelectedId(id);
    setSelectedWireId(null);
    setPartsOpen(false);
    updateDiagram(next);
  }

  function onPinClick(ref) {
    const pinPoint = getPinPoint(diagram, ref);

    if (!pinPoint) return;

    const snappedPin = snapPoint(pinPoint);

    if (!wireStart) {
      setWireStart(ref);
      setWirePoints([]);
      setMousePoint(snappedPin);
      setSelectedId(null);
      setSelectedWireId(null);
      setSerial(`Start wire: ${ref}`);
      return;
    }

    const color =
      ref.includes("GND") || wireStart.includes("GND")
        ? "black"
        : "green";

    const next = {
      ...diagram,
      connections: [
        ...diagram.connections,
        [wireStart, ref, color, [...wirePoints]]
      ]
    };

    setWireStart(null);
    setWirePoints([]);
    setMousePoint(null);
    updateDiagram(next);
    setSerial(`Connected: ${wireStart} → ${ref}`);
  }

  function startDrag(e, id) {
    if (wireStart) return;

    const part = diagram.parts.find((p) => p.id === id);

    if (!part) return;

    setHistory((old) => [
      ...old,
      JSON.stringify(diagram)
    ].slice(-50));
    setRedoStack([]);

    dragRef.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      left: part.left,
      top: part.top
    };

    setSelectedId(id);
    setSelectedWireId(null);

    window.addEventListener("mousemove", moveDrag);
    window.addEventListener("mouseup", stopDrag);
  }

  function moveDrag(e) {
    const drag = dragRef.current;

    if (!drag) return;

    setDiagram((old) => ({
      ...old,
      parts: old.parts.map((p) =>
        p.id === drag.id
          ? {
              ...p,
              left: snapPoint({ x: drag.left + e.clientX - drag.x, y: 0 }).x,
              top: snapPoint({ x: 0, y: drag.top + e.clientY - drag.y }).y
            }
          : p
      )
    }));
  }

  function stopDrag() {
    dragRef.current = null;

    window.removeEventListener("mousemove", moveDrag);
    window.removeEventListener("mouseup", stopDrag);

    setDiagram((old) => {
      setJsonText(JSON.stringify(old, null, 2));
      return old;
    });
  }

  function rotateSelected() {
    if (!selectedId) return;

    updateDiagram({
      ...diagram,
      parts: diagram.parts.map((p) =>
        p.id === selectedId
          ? { ...p, rotate: ((p.rotate || 0) + 90) % 360 }
          : p
      )
    });
  }

  function deleteSelected() {
    if (!selectedId) return;

    updateDiagram({
      ...diagram,
      parts: diagram.parts.filter((p) => p.id !== selectedId),
      connections: diagram.connections.filter(
        (c) =>
          !c[0].startsWith(selectedId + ":") &&
          !c[1].startsWith(selectedId + ":")
      )
    });

    setSelectedId(null);
  }

  function updateAttr(value) {
    if (!selectedId) return;

    updateDiagram({
      ...diagram,
      parts: diagram.parts.map((p) => {
        if (p.id !== selectedId) return p;

        const attrs = { ...(p.attrs || {}) };

        if (p.type.includes("resistor")) {
          attrs.value = value;
        } else if (
          p.type.includes("led") ||
          p.type.includes("pushbutton")
        ) {
          attrs.color = value;
        } else {
          attrs.value = value;
        }

        return { ...p, attrs };
      })
    });
  }

  function updateWireColor(color) {
    if (selectedWireId === null) return;

    const nextConnections = diagram.connections.map((c, i) => {
      if (i !== selectedWireId) return c;
      return [c[0], c[1], color, c[3] || []];
    });

    updateDiagram({
      ...diagram,
      connections: nextConnections
    });

    setSerial(`Wire color changed to ${color}`);
  }

  function deleteSelectedWire() {
    if (selectedWireId === null) return;

    updateDiagram({
      ...diagram,
      connections: diagram.connections.filter(
        (_, i) => i !== selectedWireId
      )
    });

    setSelectedWireId(null);
    setHoveredWireId(null);
    setSerial("Wire deleted");
  }

  function cancelWire() {
    const hadWire = Boolean(wireStart);

    setWireStart(null);
    setWirePoints([]);
    setMousePoint(null);

    if (hadWire) {
      setSerial("Wire cancelled");
    }
  }

  const selectedPart = diagram.parts.find(
    (p) => p.id === selectedId
  );

  const wires = useMemo(
    () =>
      (diagram.connections || [])
        .map((c, connectionIndex) => {
          if (
            !Array.isArray(c) ||
            !c[0] ||
            !c[1] ||
            c[0].includes("$") ||
            c[1].includes("$")
          ) {
            return null;
          }

          const a = getPinPoint(diagram, c[0]);
          const b = getPinPoint(diagram, c[1]);

          if (!a || !b) return null;

          const waypoints = Array.isArray(c[3]) ? c[3] : [];

          const points = makeSmartWirePoints(a, waypoints, b);

          return {
            id: connectionIndex,
            connectionIndex,
            d: makePolylinePath(points),
            points,
            color: c[2] || "green"
          };
        })
        .filter(Boolean),
    [diagram]
  );

  const previewWire = useMemo(() => {
    if (!wireStart || !mousePoint) return null;

    const start = getPinPoint(diagram, wireStart);

    if (!start) return null;

    return {
      d: makeSmartWirePath(start, wirePoints, mousePoint),
      color: wireStart.includes("GND") ? "black" : "green"
    };
  }, [wireStart, wirePoints, mousePoint, diagram]);

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diagram));
    setSerial("Saved to browser localStorage");
  }

  async function copyJson() {
    await navigator.clipboard.writeText(
      JSON.stringify(diagram, null, 2)
    );
    setSerial("Copied diagram.json to clipboard");
  }

  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();

      if (tag === "textarea" || tag === "input") return;

      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedId(null);
        setSelectedWireId(null);
        cancelWire();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();

        if (selectedWireId !== null) {
          deleteSelectedWire();
          return;
        }

        if (selectedId) {
          deleteSelected();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    selectedId,
    selectedWireId,
    diagram,
    wireStart,
    history,
    redoStack
  ]);

  useEffect(() => {
    window.addEventListener("mouseup", stopWireControlDrag);

    return () => {
      window.removeEventListener("mouseup", stopWireControlDrag);
    };
  }, []);

  /* ===== จบส่วนที่เพิ่ม ===== */

  return (
    <div>
      <header className="topbar">
        <div className="logo">
          NKRAFA<span> ESP32 Simulator</span>
        </div>

        <button className="blue" onClick={save}>
          <Save size={17} /> SAVE
        </button>

        <button className="blue" onClick={copyJson}>
          <Share2 size={17} /> EXPORT
        </button>

        <div className="spacer" />
        <b>Docs</b>
        <div className="avatar" />
      </header>

      <main className="app">
        <section className="editor">
          <div className="tabs">
            <button
              className={`tab ${tab === "code" ? "active" : ""}`}
              onClick={() => setTab("code")}
            >
              sketch.ino
            </button>

            <button
              className={`tab ${tab === "json" ? "active" : ""}`}
              onClick={() => setTab("json")}
            >
              diagram.json ●
            </button>

            <button className="tab">Library Manager ▾</button>
          </div>

          <div className="code-wrap">
            <div className="lines">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            <textarea
              value={editorText}
              onChange={(e) => onEditorChange(e.target.value)}
              spellCheck="false"
            />
          </div>
        </section>

        <section
          className="sim-area"
          onWheel={(e) => {
            if (!e.ctrlKey) return;

            e.preventDefault();

            setZoom((z) => {
              const next = z - e.deltaY * 0.001;
              return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
            });
          }}
          onClick={(e) => {
            if (dragPoint) return;

            if (!wireStart || !mousePoint) {
              setSelectedId(null);
              setSelectedWireId(null);
              return;
            }

            const rect = e.currentTarget.getBoundingClientRect();

            const p = snapPoint({
              x: (e.clientX - rect.left) / zoom,
              y: (e.clientY - rect.top) / zoom
            });

            setWirePoints((old) => [...old, p]);
            setMousePoint(p);
            setSerial("Add wire corner point");
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            cancelWire();
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();

            const p = snapPoint({
              x: (e.clientX - rect.left) / zoom,
              y: (e.clientY - rect.top) / zoom
            });

            if (dragPoint) {
              updateWireControlDrag(p);
              return;
            }

            if (!wireStart) return;

            setMousePoint(p);
          }}
          onMouseUp={stopWireControlDrag}
        >
          <div className="sim-title">Simulation</div>

          <div className="sim-buttons">
            <button
              className="round play"
              onClick={(e) => {
                e.stopPropagation();
                setSerial(
                  `Serial Monitor:\nHello, ESP32!\nParts: ${diagram.parts.length}\nWires: ${diagram.connections.length}`
                );
              }}
            >
              <Play size={22} />
            </button>

            <button
              className="round add"
              onClick={(e) => {
                e.stopPropagation();
                setPartsOpen(true);
              }}
            >
              <Plus />
            </button>

            {wireStart && (
              <button
                className="round cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelWire();
                }}
              >
                <X />
              </button>
            )}
          </div>

          <div className="zoom-controls" onClick={(e) => e.stopPropagation()}>
            <button onClick={zoomOut}>−</button>
            <button onClick={resetZoom}>{Math.round(zoom * 100)}%</button>
            <button onClick={zoomIn}>+</button>
          </div>

          {wireStart && (
            <div className="wire-help">
              กำลังลากสายจาก {wireStart} | คลิกพื้นที่ว่างเพื่อหักมุม | คลิก pin ปลายทางเพื่อจบสาย | ดับเบิลคลิกเพื่อยกเลิก
            </div>
          )}

          <div
            className="canvas-layer"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left"
            }}
          >
          <svg className="wires">
            {previewWire && (
              <path
                d={previewWire.d}
                className={`wire wire-${previewWire.color} preview-wire`}
              />
            )}

            {wires.map((w) => (
              <g key={w.id}>
                <path
                  d={w.d}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity="0"
                  strokeWidth="18"
                  pointerEvents="stroke"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredWireId(w.connectionIndex)}
                  onMouseLeave={() => setHoveredWireId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWireId(w.connectionIndex);
                    setSelectedId(null);
                  }}
                />

                <path
                  d={w.d}
                  className={`wire wire-${w.color} ${
                    hoveredWireId === w.connectionIndex ||
                    selectedWireId === w.connectionIndex
                      ? "wire-selected"
                      : ""
                  }`}
                />

                {selectedWireId === w.connectionIndex &&
                  (w.points || []).slice(0, -1).map((p0, segmentIndex) => {
                    const p1 = w.points[segmentIndex + 1];

                    if (!p1 || (p0.x === p1.x && p0.y === p1.y)) {
                      return null;
                    }

                    return (
                      <circle
                        key={`control-${segmentIndex}`}
                        className="wire-control-point"
                        cx={(p0.x + p1.x) / 2}
                        cy={(p0.y + p1.y) / 2}
                        r="8"
                        onMouseDown={(e) =>
                          beginWireControlDrag(
                            e,
                            w.connectionIndex,
                            segmentIndex
                          )
                        }
                      />
                    );
                  })}
              </g>
            ))}
          </svg>

          <div className="parts-layer">
            {diagram.parts.map((part) => (
              <PartView
                key={part.id}
                part={part}
                selected={part.id === selectedId}
                onSelect={(id) => {
                  setSelectedWireId(null);
                  setSelectedId(id);
                }}
                onDragStart={startDrag}
                onPinClick={onPinClick}
                onPinHover={setHoveredPin}
                onPinLeave={() => setHoveredPin(null)}
              />
            ))}
          </div>
          </div>

          {selectedPart && (
            <div
              className="property-bar"
              onClick={(e) => e.stopPropagation()}
            >
              <b>{selectedPart.type}</b>
              <span>{selectedPart.id}</span>

              <input
                value={
                  selectedPart.attrs?.value ||
                  selectedPart.attrs?.color ||
                  selectedPart.attrs?.address ||
                  ""
                }
                onChange={(e) => updateAttr(e.target.value)}
                placeholder="color / value"
              />

              <button onClick={rotateSelected}>
                <RotateCw size={18} />
              </button>

              <button onClick={deleteSelected}>
                <Trash2 size={18} />
              </button>

              <button onClick={() => setSelectedId(null)}>
                <X size={18} />
              </button>
            </div>
          )}

          {selectedWireId !== null && (
            <div
              className="wire-property-bar"
              onClick={(e) => e.stopPropagation()}
            >
              <b>Wire Property</b>

              <button
                onClick={() => updateWireColor("green")}
                className="color-btn green"
              >
                Green
              </button>

              <button
                onClick={() => updateWireColor("red")}
                className="color-btn red"
              >
                Red
              </button>

              <button
                onClick={() => updateWireColor("black")}
                className="color-btn black"
              >
                Black
              </button>

              <button
                onClick={() => updateWireColor("blue")}
                className="color-btn blue-wire-btn"
              >
                Blue
              </button>

              <button onClick={deleteSelectedWire}>
                <Trash2 size={18} />
              </button>

              <button onClick={() => setSelectedWireId(null)}>
                <X size={18} />
              </button>
            </div>
          )}

          {hoveredPin && (
            <div
              className="pin-tooltip"
              style={{
                left: hoveredPin.x,
                top: hoveredPin.y
              }}
            >
              {hoveredPin.ref}
            </div>
          )}

          {partsOpen && (
            <div
              className="parts-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="search">
                <input placeholder="Search components" />
                <span>🔍</span>
              </div>

              <div className="group">Basic</div>

              <PartItem
                icon="🔴"
                name="LED"
                onClick={() => addPart("nk-led")}
              />

              <PartItem
                icon="🟢"
                name="Pushbutton"
                onClick={() => addPart("nk-pushbutton")}
              />

              <PartItem
                icon="🔩"
                name="Resistor"
                onClick={() => addPart("nk-resistor")}
              />

              <div className="group">Display</div>

              <PartItem
                icon="OLED"
                name="SSD1306 OLED display"
                onClick={() => addPart("nk-ssd1306")}
              />

              <PartItem
                icon="LCD"
                name="LCD 16x2 (I2C)"
                onClick={() => addPart("nk-lcd1602-i2c")}
              />

              <div className="group">Sensors</div>

              <PartItem
                icon="🌡️"
                name="DHT22"
                onClick={() => addPart("nk-dht22")}
              />

              <PartItem
                icon="📡"
                name="Ultrasonic HC-SR04"
                onClick={() => addPart("nk-hc-sr04")}
              />

              <button
                className="close-parts"
                onClick={() => setPartsOpen(false)}
              >
                Close
              </button>
            </div>
          )}

          <pre className="serial">{serial}</pre>
        </section>
      </main>
    </div>
  );
}

function PartItem({ icon, name, onClick }) {
  return (
    <button className="part-item" onClick={onClick}>
      <span>{icon}</span>
      <b>{name}</b>
    </button>
  );
}

createRoot(document.getElementById("root")).render(<App />);
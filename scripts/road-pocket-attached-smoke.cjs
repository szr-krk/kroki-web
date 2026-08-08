const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;

let roadAdapter = null;
global.Kroki = {
  EditorUtils: {
    numberOr(value, fallback) {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    },
    clonePlain(value) {
      return JSON.parse(JSON.stringify(value));
    },
    createSvgElement() {
      return {};
    }
  },
  ShapeRegistry: {
    register(type, adapter) {
      if (type === "road") roadAdapter = adapter;
    }
  },
  LineGeometry: {
    distanceToSegment(a, b, point) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared
        ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
        : 0;
      return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
    },
    snapEndpoint(_anchor, point) {
      return point;
    },
    lineEndpointControlPoint() {
      return { x: 0, y: 0 };
    }
  },
  StyleManager: {
    normalizeStyle(value) {
      return { ...(value || {}) };
    },
    readStyleFromElement() {
      return {};
    },
    readLabelFromElement() {
      return {};
    }
  }
};

const adapterPath = path.join(__dirname, "..", "src", "adapters", "roadAdapter.js");
vm.runInThisContext(fs.readFileSync(adapterPath, "utf8"), { filename: adapterPath });
assert.ok(roadAdapter, "road adapter kaydedilmedi");

function createRoad(id) {
  const model = roadAdapter.create({
    geometry: {
      profile: "straight",
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 }
    },
    metadata: {
      road: {
        laneCount: 2,
        laneWidth: 50,
        laneWidths: [50, 50],
        divided: false
      }
    }
  });
  model.id = id;
  return model;
}

function contourByRole(model, role) {
  return roadAdapter.intersectionAuxiliaryContours(model).filter((item) => item.role === role);
}

for (const side of ["right", "left"]) {
  const model = createRoad(`pocket-${side}`);
  assert.equal(roadAdapter.setPocketMode(model, side), true);

  assert.equal(contourByRole(model, "outer").length, 1, `${side}: normal cep dis konturu eksik`);
  assert.equal(contourByRole(model, "island").length, 1, `${side}: normal cep refuju eksik`);
  assert.equal(contourByRole(model, "separator").length, 0, `${side}: normal cepte ayirici olmamali`);

  roadAdapter.moveControlPoint(model, `pocket:${side}:offset`, { x: 500, y: 0 }, { metrics: { unit: 1 } });

  const config = roadAdapter.roadConfig(model);
  const pocket = config.pockets[side];
  assert.equal(pocket.outset, pocket.width / 2, `${side}: cep yol kenarina tam dayanmadi`);

  const outer = contourByRole(model, "outer");
  const island = contourByRole(model, "island");
  const separator = contourByRole(model, "separator");
  assert.equal(outer.length, 1, `${side}: sifir aralikta cep kayboldu`);
  assert.equal(outer[0].closed, false, `${side}: dis kontur acik olmali`);
  assert.equal(island.length, 0, `${side}: sifir aralikta refuj/dolgu kalmamali`);
  assert.equal(separator.length, 1, `${side}: sifir aralikta ayirici cizgi eksik`);
  assert.equal(separator[0].closed, false, `${side}: ayirici cizgi acik olmali`);
  assert.equal(separator[0].points.length, 2, `${side}: ayirici duz tek parca olmali`);

  const section = roadAdapter.crossSection(config);
  const edgeY = (side === "left" ? 1 : -1) * section.totalWidth / 2;
  const [start, end] = separator[0].points;
  assert.ok(Math.abs(start.x - pocket.innerFrom * 1000) < 1e-6, `${side}: ayirici giris agzini kapatiyor`);
  assert.ok(Math.abs(end.x - pocket.innerTo * 1000) < 1e-6, `${side}: ayirici cikis agzini kapatiyor`);
  assert.ok(Math.abs(start.y - edgeY) < 1e-6 && Math.abs(end.y - edgeY) < 1e-6, `${side}: ayirici yol kenarinda degil`);
  assert.ok(start.x > pocket.outerFrom * 1000, `${side}: giris egimi acik kalmali`);
  assert.ok(end.x < pocket.outerTo * 1000, `${side}: cikis egimi acik kalmali`);
}

console.log("road-pocket-attached-smoke: ok");

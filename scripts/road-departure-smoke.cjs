const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

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
    lineEndpointControlPoint(_start, _end, _id, _offset) {
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

function hostRoad(divided) {
  const road = roadAdapter.create({
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
        divided,
        dividedLaneWidths: {
          left: [50, 50],
          right: [50, 50]
        },
        leftShoulder: { enabled: divided, width: 20 },
        rightShoulder: { enabled: divided, width: 20 },
        innerShoulder: { enabled: divided, width: 15 },
        waterChannel: { enabled: divided, width: 50 }
      }
    }
  });
  road.id = divided ? "host-divided" : "host-normal";
  return road;
}

function expectedArcControl(start, end, ratio) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const halfLength = length / 2;
  return {
    x: (start.x + end.x) / 2 + (-dy / length) * halfLength * ratio,
    y: (start.y + end.y) / 2 + (dx / length) * halfLength * ratio
  };
}

function distanceToPolyline(point, points) {
  let distance = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    distance = Math.min(
      distance,
      global.Kroki.LineGeometry.distanceToSegment(points[index], points[index + 1], point)
    );
  }
  return distance;
}

[
  { divided: false, side: "right", laneCount: 1 },
  { divided: false, side: "left", laneCount: 2 },
  { divided: true, side: "right", laneCount: 2 },
  { divided: true, side: "left", laneCount: 1 }
].forEach((testCase) => {
  const host = hostRoad(testCase.divided);
  const initial = roadAdapter.createDepartureRoadData(host, { ...testCase, existingModels: [] });
  assert.ok(initial, "ayrilan yol verisi olusmadi");
  const branch = roadAdapter.create(initial);
  branch.id = `${host.id}-${testCase.side}-${testCase.laneCount}`;
  global.Kroki.EditorObjectManager = {
    get(id) {
      if (id === host.id) return host;
      if (id === branch.id) return branch;
      return null;
    },
    getAll() {
      return [host, branch];
    }
  };

  assert.equal(branch.geometry.profile, "sCurve");
  assert.equal(branch.metadata.roadDeparture.version, 2);
  assert.equal(branch.metadata.roadDeparture.sideConvention, "visual");
  assert.equal(branch.metadata.roadDeparture.curveMode, "arc");
  assert.ok(Number.isFinite(branch.metadata.roadDeparture.curveRatio));
  assert.equal(branch.metadata.roadDeparture.hostId, host.id);
  assert.equal(branch.metadata.roadDeparture.side, testCase.side);
  assert.equal(branch.metadata.road.laneCount, testCase.laneCount);
  assert.equal(branch.metadata.road.laneWidths.length, testCase.laneCount);
  if (branch.metadata.road.leftShoulder.enabled || branch.metadata.road.rightShoulder.enabled) {
    assert.ok(roadAdapter.widthScaleAt(branch, 0) > 0);
    assert.ok(roadAdapter.widthScaleAt(branch, 0) < 1);
  } else {
    assert.equal(roadAdapter.widthScaleAt(branch, 0), 0);
  }
  assert.equal(roadAdapter.widthScaleAt(branch, branch.metadata.roadDeparture.fullT), 1);
  assert.ok(testCase.side === "right" ? branch.geometry.start.y > 0 : branch.geometry.start.y < 0);

  const departure = branch.metadata.roadDeparture;
  const fullPoint = roadAdapter.pointAt(branch, departure.fullT);
  const parallelPoint = roadAdapter.pointAt(branch, departure.parallelT);
  assert.ok(Math.hypot(fullPoint.x - departure.fullPoint.x, fullPoint.y - departure.fullPoint.y) < 1e-6);
  assert.ok(Math.hypot(parallelPoint.x - departure.parallelPoint.x, parallelPoint.y - departure.parallelPoint.y) < 1e-6);
  const parallelMid = roadAdapter.pointAt(branch, (departure.fullT + departure.parallelT) / 2);
  assert.ok(Math.hypot(
    parallelMid.x - (departure.fullPoint.x + departure.parallelPoint.x) / 2,
    parallelMid.y - (departure.fullPoint.y + departure.parallelPoint.y) / 2
  ) < 1e-6);
  const curveMidT = departure.parallelT + (1 - departure.parallelT) / 2;
  const curveMid = roadAdapter.pointAt(branch, curveMidT);
  assert.ok(Math.hypot(curveMid.x - departure.curveControl.x, curveMid.y - departure.curveControl.y) < 1e-6);
  const entryTangent = roadAdapter.tangentAt(branch, departure.parallelT + 1e-7);
  const parallelVector = {
    x: departure.parallelPoint.x - departure.fullPoint.x,
    y: departure.parallelPoint.y - departure.fullPoint.y
  };
  const entryCross = Math.abs(entryTangent.x * parallelVector.y - entryTangent.y * parallelVector.x);
  const entryScale = Math.max(1, Math.hypot(entryTangent.x, entryTangent.y) * Math.hypot(parallelVector.x, parallelVector.y));
  assert.ok(entryCross / entryScale < 1e-5);

  const controlIds = roadAdapter.getControlPoints(branch, { endpointOffset: 10, unit: 1 }, "edit")
    .map((control) => control.id);
  assert.ok(controlIds.includes("departure-full"));
  assert.ok(controlIds.includes("departure-parallel"));
  assert.ok(controlIds.includes("departure-curve"));
  assert.ok(!controlIds.includes("sctrl-0"));
  assert.ok(!controlIds.includes("sctrl-1"));

  const fullBeforeCurveMove = JSON.stringify(departure.fullPoint);
  const parallelBeforeCurveMove = JSON.stringify(departure.parallelPoint);
  roadAdapter.moveControlPoint(branch, "departure-curve", {
    x: departure.curveControl.x + 25,
    y: departure.curveControl.y + 35
  });
  assert.equal(JSON.stringify(branch.metadata.roadDeparture.fullPoint), fullBeforeCurveMove);
  assert.equal(JSON.stringify(branch.metadata.roadDeparture.parallelPoint), parallelBeforeCurveMove);
  const movedCurveMid = roadAdapter.pointAt(branch, curveMidT);
  assert.ok(Math.hypot(
    movedCurveMid.x - branch.metadata.roadDeparture.curveControl.x,
    movedCurveMid.y - branch.metadata.roadDeparture.curveControl.y
  ) < 1e-6);
  const expectedMovedControl = expectedArcControl(
    branch.metadata.roadDeparture.parallelPoint,
    branch.geometry.end,
    branch.metadata.roadDeparture.curveRatio
  );
  assert.ok(Math.hypot(
    expectedMovedControl.x - branch.metadata.roadDeparture.curveControl.x,
    expectedMovedControl.y - branch.metadata.roadDeparture.curveControl.y
  ) < 1e-6);

  const parallelBeforeWidthChange = { ...branch.metadata.roadDeparture.parallelPoint };
  const ratioBeforeWidthChange = branch.metadata.roadDeparture.curveRatio;
  const laneWidthDelta = 4;
  branch.metadata.road.laneWidth += laneWidthDelta;
  branch.metadata.road.laneWidths = branch.metadata.road.laneWidths.map((width) => width + laneWidthDelta);
  roadAdapter.syncDepartureRoadConfig(branch);
  const expectedCenterShift = testCase.laneCount * laneWidthDelta / 2;
  const actualCenterShift = Math.hypot(
    branch.metadata.roadDeparture.parallelPoint.x - parallelBeforeWidthChange.x,
    branch.metadata.roadDeparture.parallelPoint.y - parallelBeforeWidthChange.y
  );
  assert.ok(Math.abs(actualCenterShift - expectedCenterShift) < 1e-6);
  assert.equal(branch.metadata.roadDeparture.curveRatio, ratioBeforeWidthChange);
  const expectedResizedControl = expectedArcControl(
    branch.metadata.roadDeparture.parallelPoint,
    branch.geometry.end,
    branch.metadata.roadDeparture.curveRatio
  );
  assert.ok(Math.hypot(
    expectedResizedControl.x - branch.metadata.roadDeparture.curveControl.x,
    expectedResizedControl.y - branch.metadata.roadDeparture.curveControl.y
  ) < 1e-6);

  const ratioBeforeEndMove = branch.metadata.roadDeparture.curveRatio;
  const movedEnd = {
    x: branch.geometry.end.x + 30,
    y: branch.geometry.end.y + 15
  };
  const endMoveStartState = roadAdapter.beginControlPointMove(branch, "end", { ...branch.geometry.end });
  roadAdapter.moveControlPoint(branch, "end", movedEnd, { startState: endMoveStartState });
  assert.notDeepEqual(branch.geometry.end, endMoveStartState.geometry.end);
  assert.equal(branch.metadata.roadDeparture.curveRatio, ratioBeforeEndMove);
  const expectedEndMovedControl = expectedArcControl(
    branch.metadata.roadDeparture.parallelPoint,
    branch.geometry.end,
    branch.metadata.roadDeparture.curveRatio
  );
  assert.ok(Math.hypot(
    expectedEndMovedControl.x - branch.metadata.roadDeparture.curveControl.x,
    expectedEndMovedControl.y - branch.metadata.roadDeparture.curveControl.y
  ) < 1e-6);

  const gore = roadAdapter.departureGoreGeometry(branch);
  if (!testCase.divided) {
    assert.equal(gore, null);
  } else {
    assert.ok(gore, `gore olusmadi: ${JSON.stringify(testCase)}`);
    assert.ok(gore.outline.length >= 5);
    assert.ok(gore.hatches.length >= 1);
    assert.equal(
      gore.edgeSplit.exact,
      true,
      `dis kenar kesisimi yaklasik kaldi: ${JSON.stringify({
        testCase,
        split: gore.edgeSplit,
        geometry: branch.geometry,
        departure: branch.metadata.roadDeparture
      })}`
    );
    assert.ok(Math.hypot(
      gore.spineEnd.x - gore.edgeSplit.point.x,
      gore.spineEnd.y - gore.edgeSplit.point.y
    ) < 1e-6);
    gore.hatches.forEach((hatch) => {
      assert.ok(hatch.width >= 5);
      assert.ok(distanceToPolyline(hatch.apex, gore.spinePoints) < 1e-6);
      const boundaryMiddleX = (hatch.host.x + hatch.branch.x) / 2;
      assert.ok(testCase.side === "right"
        ? boundaryMiddleX > hatch.apex.x
        : boundaryMiddleX < hatch.apex.x);
    });

    const baseRatio = branch.metadata.roadDeparture.curveRatio;
    [0.45, 0.85].forEach((factor) => {
      const targetRatio = Math.max(-2.5, Math.min(2.5, baseRatio * factor));
      roadAdapter.moveControlPoint(
        branch,
        "departure-curve",
        expectedArcControl(
          branch.metadata.roadDeparture.parallelPoint,
          branch.geometry.end,
          targetRatio
        )
      );
      assert.ok(Math.abs(branch.metadata.roadDeparture.curveRatio - targetRatio) < 1e-6);
      const variantGore = roadAdapter.departureGoreGeometry(branch);
      assert.ok(variantGore, `viraj taramasi olusmadi: ${JSON.stringify({ testCase, targetRatio })}`);
      assert.equal(
        variantGore.edgeSplit.exact,
        true,
        `viraj dis kenar kesisimi yaklasik kaldi: ${JSON.stringify({ testCase, targetRatio })}`
      );
      variantGore.hatches.forEach((hatch) => {
        assert.ok(distanceToPolyline(hatch.apex, variantGore.spinePoints) < 1e-6);
      });
    });
  }

  const departureBeforeHostTurn = branch.metadata.roadDeparture;
  const directionBeforeHostTurn = departureBeforeHostTurn.hostDirection;
  const normalBeforeHostTurn = {
    x: -directionBeforeHostTurn.y,
    y: directionBeforeHostTurn.x
  };
  const endDeltaBeforeHostTurn = {
    x: branch.geometry.end.x - departureBeforeHostTurn.parallelPoint.x,
    y: branch.geometry.end.y - departureBeforeHostTurn.parallelPoint.y
  };
  const localForwardBeforeHostTurn = (
    endDeltaBeforeHostTurn.x * directionBeforeHostTurn.x
    + endDeltaBeforeHostTurn.y * directionBeforeHostTurn.y
  );
  const localOutwardBeforeHostTurn = (
    endDeltaBeforeHostTurn.x * normalBeforeHostTurn.x
    + endDeltaBeforeHostTurn.y * normalBeforeHostTurn.y
  );
  const ratioBeforeHostTurn = departureBeforeHostTurn.curveRatio;
  host.geometry.end = { x: 800, y: 600 };
  roadAdapter.syncDepartureToHostGeometry(branch, host);
  const departureAfterHostTurn = branch.metadata.roadDeparture;
  assert.ok(Math.abs(departureAfterHostTurn.hostDirection.x - 0.8) < 1e-6);
  assert.ok(Math.abs(departureAfterHostTurn.hostDirection.y - 0.6) < 1e-6);
  assert.equal(departureAfterHostTurn.curveRatio, ratioBeforeHostTurn);
  const directionAfterHostTurn = departureAfterHostTurn.hostDirection;
  const normalAfterHostTurn = {
    x: -directionAfterHostTurn.y,
    y: directionAfterHostTurn.x
  };
  const endDeltaAfterHostTurn = {
    x: branch.geometry.end.x - departureAfterHostTurn.parallelPoint.x,
    y: branch.geometry.end.y - departureAfterHostTurn.parallelPoint.y
  };
  assert.ok(Math.abs(
    endDeltaAfterHostTurn.x * directionAfterHostTurn.x
    + endDeltaAfterHostTurn.y * directionAfterHostTurn.y
    - localForwardBeforeHostTurn
  ) < 1e-6);
  assert.ok(Math.abs(
    endDeltaAfterHostTurn.x * normalAfterHostTurn.x
    + endDeltaAfterHostTurn.y * normalAfterHostTurn.y
    - localOutwardBeforeHostTurn
  ) < 1e-6);

  const section = roadAdapter.crossSection(branch.metadata.road);
  const pathData = roadAdapter.surfacePathData(branch, section.totalWidth);
  assert.ok(pathData.startsWith("M "));
  assert.ok(pathData.endsWith(" Z"));
});

const cappedLaneHost = hostRoad(true);
const cappedLaneDeparture = roadAdapter.createDepartureRoadData(cappedLaneHost, {
  side: "right",
  laneCount: 5,
  existingModels: []
});
assert.equal(
  cappedLaneDeparture.metadata.road.laneCount,
  2,
  "ayrim/katilim serit sayisi desteklenen 1-2 araligina sinirlandirilmali"
);

const sideLimitedHost = hostRoad(true);
sideLimitedHost.id = "side-limited-departure-host";
const rightDepartureData = roadAdapter.createDepartureRoadData(sideLimitedHost, {
  side: "right",
  laneCount: 1,
  existingModels: [sideLimitedHost]
});
assert.ok(rightDepartureData, "sagdaki ilk ayrilan yol olusturulabilmeli");
const rightDeparture = roadAdapter.create(rightDepartureData);
rightDeparture.id = "right-departure-branch";
const rightLinkedModels = [sideLimitedHost, rightDeparture];
assert.equal(
  roadAdapter.outgoingDepartureRoad(sideLimitedHost, rightLinkedModels, "right")?.id,
  rightDeparture.id
);
assert.equal(roadAdapter.outgoingDepartureRoad(sideLimitedHost, rightLinkedModels, "left"), null);
assert.equal(roadAdapter.canCreateDepartureRoad(sideLimitedHost, rightLinkedModels, "right"), false);
assert.equal(roadAdapter.canCreateDepartureRoad(sideLimitedHost, rightLinkedModels, "left"), true);
assert.equal(roadAdapter.canCreateDepartureRoad(sideLimitedHost, rightLinkedModels), true);
assert.equal(
  roadAdapter.createDepartureRoadData(sideLimitedHost, {
    side: "right",
    laneCount: 2,
    existingModels: rightLinkedModels
  }),
  null,
  "ayni tarafa ikinci ayrilan yol eklenmemeli"
);

const leftDepartureData = roadAdapter.createDepartureRoadData(sideLimitedHost, {
  side: "left",
  laneCount: 2,
  existingModels: rightLinkedModels
});
assert.ok(leftDepartureData, "karsi tarafa ayrilan yol eklenebilmeli");
const leftDeparture = roadAdapter.create(leftDepartureData);
leftDeparture.id = "left-departure-branch";
const bothSidesLinkedModels = [sideLimitedHost, rightDeparture, leftDeparture];
assert.equal(
  roadAdapter.outgoingDepartureRoad(sideLimitedHost, bothSidesLinkedModels, "left")?.id,
  leftDeparture.id
);
assert.equal(roadAdapter.canCreateDepartureRoad(sideLimitedHost, bothSidesLinkedModels), false);
assert.equal(roadAdapter.canCreateDepartureRoad(sideLimitedHost, bothSidesLinkedModels, "right"), false);
assert.equal(roadAdapter.canCreateDepartureRoad(sideLimitedHost, bothSidesLinkedModels, "left"), false);
assert.equal(
  roadAdapter.canCreateDepartureRoad(rightDeparture, bothSidesLinkedModels),
  false,
  "ayrilan yol yeni bir ayrilan yol icin host olmamali"
);
assert.equal(
  roadAdapter.canCreateDepartureRoad(sideLimitedHost, [sideLimitedHost, leftDeparture], "right"),
  true,
  "sagdaki dal silinince yalniz sag taraf yeniden acilmali"
);
assert.equal(
  roadAdapter.canCreateDepartureRoad(sideLimitedHost, [sideLimitedHost, leftDeparture], "left"),
  false,
  "soldaki dal dururken sol taraf kapali kalmali"
);
assert.equal(
  roadAdapter.canCreateDepartureRoad(sideLimitedHost, [sideLimitedHost], "left"),
  true,
  "iki dal da silinince iki taraf yeniden acilmali"
);

console.log("road-departure-smoke: ok");

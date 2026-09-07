(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const lineGeometry = Kroki.LineGeometry;
  const lineAdapter = registry?.get?.("line");
  const arcAdapter = registry?.get?.("arc");
  const curveAdapter = registry?.get?.("bezier");
  if (!utils || !registry || !lineGeometry || !lineAdapter || !arcAdapter || !curveAdapter) return;

  const SAMPLE_COUNT = 72;
  const DEFAULT_ARC_RATIO = 0.20;
  const DEFAULT_SPACING = 42;
  const MIN_SPACING = 18;
  const MAX_SPACING = 180;
  const BARRIER_DEPTH = 8;
  const TOP_WIDTH = 4;
  const POST_WIDTH = 3;
  const HIT_TOLERANCE = 16;
  const END_CAP_STATES = [
    { start: false, end: false },
    { start: false, end: true },
    { start: true, end: false },
    { start: true, end: true }
  ];
  const PROFILE_SEQUENCE = [
    { id: "line", title: "Çizgi", short: "Çizgi" },
    { id: "arc", title: "Yay", short: "Yay" },
    { id: "quadratic", title: "Eğri", short: "Eğri" },
    { id: "cubic", title: "Kübik eğri", short: "Kübik" }
  ];

  function point(value, fallback = { x: 0, y: 0 }) {
    return {
      x: utils.numberOr(value?.x, fallback.x),
      y: utils.numberOr(value?.y, fallback.y)
    };
  }

  function lerp(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
  }

  function defaultControls(start, end) {
    return { c1: lerp(start, end, 1 / 3), c2: lerp(start, end, 2 / 3) };
  }

  function normalizeProfile(value, fallback = "line") {
    const profile = String(value || "");
    return PROFILE_SEQUENCE.some((item) => item.id === profile) ? profile : fallback;
  }

  function profileFromGeometry(source = {}, fallback = "line") {
    const explicit = normalizeProfile(source.profile || source.barrierProfile, "");
    if (explicit) return explicit;
    if (source.bezierType === "quadratic" || source.q) return "quadratic";
    if (source.bezierType === "cubic" || source.c1 || source.c2) return "cubic";
    if (Number.isFinite(Number(source.ratio))) return "arc";
    return fallback;
  }

  function normalizeGeometry(source = {}, fallbackProfile = "line") {
    const start = point(source.start);
    const end = point(source.end, start);
    const profile = profileFromGeometry(source, fallbackProfile);
    const defaults = defaultControls(start, end);
    if (profile === "arc") {
      return { profile, start, end, ratio: utils.numberOr(source.ratio, DEFAULT_ARC_RATIO) };
    }
    if (profile === "quadratic") {
      return { profile, bezierType: "quadratic", start, end, q: point(source.q, lerp(start, end, 0.5)) };
    }
    if (profile === "cubic") {
      return {
        profile,
        bezierType: "cubic",
        start,
        end,
        c1: point(source.c1, defaults.c1),
        c2: point(source.c2, defaults.c2)
      };
    }
    return { profile: "line", start, end };
  }

  function normalizeSpacing(value) {
    const number = Math.round(utils.numberOr(value, DEFAULT_SPACING));
    return Math.min(MAX_SPACING, Math.max(MIN_SPACING, number));
  }

  function normalizeScale(value) {
    return Math.min(20, Math.max(0.05, utils.numberOr(value, 1)));
  }

  function normalizeEndCaps(source = {}) {
    return { start: Boolean(source.start), end: Boolean(source.end) };
  }

  function barrierSettings(model) {
    const source = model?.metadata?.barrier || {};
    return {
      spacing: normalizeSpacing(source.spacing),
      endCaps: normalizeEndCaps(source.endCaps),
      scale: normalizeScale(source.scale)
    };
  }

  function formatPoint(value) {
    return `${Number(value.x) || 0} ${Number(value.y) || 0}`;
  }

  function profileModel(model) {
    const geometry = normalizeGeometry(model?.geometry);
    if (geometry.profile === "arc") return { ...model, type: "arc", geometry };
    if (geometry.profile === "quadratic" || geometry.profile === "cubic") {
      return { ...model, type: "bezier", geometry };
    }
    return { ...model, type: "line", geometry };
  }

  function profileAdapter(model) {
    const profile = normalizeGeometry(model?.geometry).profile;
    if (profile === "arc") return arcAdapter;
    if (profile === "quadratic" || profile === "cubic") return curveAdapter;
    return lineAdapter;
  }

  function pointAt(model, t) {
    const proxy = profileModel(model);
    return profileAdapter(model)?.pointAt?.(proxy, t) || lerp(proxy.geometry.start, proxy.geometry.end, t);
  }

  function tangentAt(model, t) {
    const proxy = profileModel(model);
    const adapter = profileAdapter(model);
    if (typeof adapter?.tangentAt === "function") return adapter.tangentAt(proxy, t);
    const before = pointAt(model, Math.max(0, t - 0.001));
    const after = pointAt(model, Math.min(1, t + 0.001));
    return { x: after.x - before.x, y: after.y - before.y };
  }

  function profileInfo(model) {
    const profile = normalizeGeometry(model?.geometry).profile;
    const index = Math.max(0, PROFILE_SEQUENCE.findIndex((item) => item.id === profile));
    return {
      current: PROFILE_SEQUENCE[index],
      next: PROFILE_SEQUENCE[(index + 1) % PROFILE_SEQUENCE.length]
    };
  }

  function nextProfileGeometry(model) {
    const geometry = normalizeGeometry(model?.geometry);
    const endpoints = { start: geometry.start, end: geometry.end };
    if (geometry.profile === "line") {
      return normalizeGeometry({ ...endpoints, profile: "arc", ratio: DEFAULT_ARC_RATIO });
    }
    if (geometry.profile === "arc") {
      const straightMidpoint = lerp(geometry.start, geometry.end, 0.5);
      const curveMidpoint = pointAt({ ...model, geometry }, 0.5);
      return normalizeGeometry({
        ...endpoints,
        profile: "quadratic",
        q: {
          x: 2 * curveMidpoint.x - straightMidpoint.x,
          y: 2 * curveMidpoint.y - straightMidpoint.y
        }
      });
    }
    if (geometry.profile === "quadratic") {
      return normalizeGeometry({
        ...endpoints,
        profile: "cubic",
        c1: {
          x: geometry.start.x + (geometry.q.x - geometry.start.x) * 2 / 3,
          y: geometry.start.y + (geometry.q.y - geometry.start.y) * 2 / 3
        },
        c2: {
          x: geometry.end.x + (geometry.q.x - geometry.end.x) * 2 / 3,
          y: geometry.end.y + (geometry.q.y - geometry.end.y) * 2 / 3
        }
      });
    }
    return normalizeGeometry({ ...endpoints, profile: "line" });
  }

  function sampleAt(model, t, scale = 1) {
    const base = pointAt(model, t);
    const tangent = tangentAt(model, t);
    const length = Math.hypot(tangent.x, tangent.y) || 1;
    const normal = { x: -tangent.y / length, y: tangent.x / length };
    return {
      t,
      base,
      top: {
        x: base.x - normal.x * BARRIER_DEPTH * scale,
        y: base.y - normal.y * BARRIER_DEPTH * scale
      },
      tangent: { x: tangent.x / length, y: tangent.y / length }
    };
  }

  function samplesFor(model, scale = barrierSettings(model).scale) {
    return Array.from({ length: SAMPLE_COUNT + 1 }, (_, index) => sampleAt(model, index / SAMPLE_COUNT, scale));
  }

  function sampleLength(samples) {
    let total = 0;
    for (let index = 0; index < samples.length - 1; index += 1) {
      const a = samples[index].base;
      const b = samples[index + 1].base;
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  }

  function sampleAtDistance(samples, distance) {
    if (!samples.length) return null;
    if (distance <= 0) return samples[0];
    let walked = 0;
    for (let index = 0; index < samples.length - 1; index += 1) {
      const a = samples[index];
      const b = samples[index + 1];
      const segmentLength = Math.hypot(b.base.x - a.base.x, b.base.y - a.base.y);
      if (walked + segmentLength >= distance) {
        const ratio = segmentLength > 0 ? (distance - walked) / segmentLength : 0;
        return {
          t: a.t + (b.t - a.t) * ratio,
          base: lerp(a.base, b.base, ratio),
          top: lerp(a.top, b.top, ratio)
        };
      }
      walked += segmentLength;
    }
    return samples[samples.length - 1];
  }

  function postSamples(samples, spacing) {
    const total = sampleLength(samples);
    if (total <= 0) return [];
    const count = Math.max(1, Math.floor(total / normalizeSpacing(spacing)));
    return Array.from({ length: count + 1 }, (_, index) => (
      sampleAtDistance(samples, total * index / count)
    )).filter(Boolean);
  }

  function pathFromPoints(points) {
    return points.map((value, index) => `${index ? "L" : "M"} ${formatPoint(value)}`).join(" ");
  }

  function topPathData(samples, posts, endCaps) {
    if (!samples.length) return "";
    const caps = normalizeEndCaps(endCaps);
    if (posts.length > 4) {
      const firstRail = posts[2];
      const lastRail = posts[posts.length - 3];
      const railStart = caps.start ? firstRail : samples[0];
      const railEnd = caps.end ? lastRail : samples[samples.length - 1];
      return pathFromPoints([
        ...(caps.start ? [samples[0].base] : []),
        railStart.top,
        ...samples.filter((sample) => sample.t > railStart.t && sample.t < railEnd.t).map((sample) => sample.top),
        railEnd.top,
        ...(caps.end ? [samples[samples.length - 1].base] : [])
      ]);
    }
    return pathFromPoints([
      ...(caps.start ? [samples[0].base] : []),
      ...samples.map((sample) => sample.top),
      ...(caps.end ? [samples[samples.length - 1].base] : [])
    ]);
  }

  function postsPathData(posts, endCaps) {
    const caps = normalizeEndCaps(endCaps);
    const visiblePosts = posts.length <= 4
      ? [
        ...(!caps.start && posts[0] ? [posts[0]] : []),
        ...(!caps.end && posts[posts.length - 1] ? [posts[posts.length - 1]] : [])
      ]
      : posts.slice(caps.start ? 2 : 0, caps.end ? posts.length - 2 : posts.length);
    return visiblePosts.map((post) => `M ${formatPoint(post.top)} L ${formatPoint(post.base)}`).join(" ");
  }

  function artwork(model) {
    const settings = barrierSettings(model);
    const samples = samplesFor(model, settings.scale);
    const posts = postSamples(samples, settings.spacing);
    return {
      samples,
      top: topPathData(samples, posts, settings.endCaps),
      posts: postsPathData(posts, settings.endCaps)
    };
  }

  function ensurePath(parent, part, className) {
    let path = parent.querySelector?.(`path.${className}`) || null;
    if (!path) {
      path = utils.createSvgElement("path", { "data-barrier-part": part });
      parent.append(path);
    }
    utils.setAttributeIfChanged(path, "class", className);
    utils.setAttributeIfChanged(path, "fill", "none");
    utils.setAttributeIfChanged(path, "stroke", "#000000");
    utils.setAttributeIfChanged(path, "stroke-linecap", "butt");
    utils.setAttributeIfChanged(path, "stroke-linejoin", "miter");
    utils.setAttributeIfChanged(path, "vector-effect", "none");
    return path;
  }

  function distanceToSamples(value, samples, key) {
    let best = Infinity;
    for (let index = 0; index < samples.length - 1; index += 1) {
      best = Math.min(best, lineGeometry.distanceToSegment(samples[index][key], samples[index + 1][key], value));
    }
    return best;
  }

  function pointFromDataset(element, prefix, fallback) {
    return point({
      x: element.dataset[`${prefix}X`],
      y: element.dataset[`${prefix}Y`]
    }, fallback);
  }

  const adapter = {
    elementTag: "g",
    className: "editor-manual-barrier",
    capabilities: { manualBarrier: true, noText: true, fill: false, gridSnap: true },

    create(initialData = {}) {
      const geometry = normalizeGeometry(initialData, "line");
      return {
        type: "barrier",
        geometry,
        style: initialData.style,
        label: null,
        metadata: {
          ...(initialData.metadata || {}),
          barrier: {
            spacing: normalizeSpacing(initialData.metadata?.barrier?.spacing ?? initialData.spacing),
            endCaps: normalizeEndCaps(initialData.metadata?.barrier?.endCaps ?? initialData.endCaps),
            scale: normalizeScale(initialData.metadata?.barrier?.scale ?? initialData.scale)
          }
        }
      };
    },

    readFromElement(element) {
      const start = pointFromDataset(element, "barrierStart", { x: 0, y: 0 });
      const end = pointFromDataset(element, "barrierEnd", start);
      const defaults = defaultControls(start, end);
      const profile = normalizeProfile(element.dataset.barrierProfile, "cubic");
      const geometrySource = { profile, start, end };
      if (profile === "arc") geometrySource.ratio = element.dataset.barrierRatio;
      if (profile === "quadratic") geometrySource.q = pointFromDataset(element, "barrierQ", lerp(start, end, 0.5));
      if (profile === "cubic") {
        geometrySource.c1 = pointFromDataset(element, "barrierC1", defaults.c1);
        geometrySource.c2 = pointFromDataset(element, "barrierC2", defaults.c2);
      }
      return {
        id: element.dataset.objectId,
        type: "barrier",
        geometry: normalizeGeometry(geometrySource, profile),
        style: {},
        label: null,
        metadata: {
          barrier: {
            spacing: normalizeSpacing(element.dataset.barrierSpacing),
            scale: normalizeScale(element.dataset.barrierScale),
            endCaps: {
              start: element.dataset.barrierCapStart === "true",
              end: element.dataset.barrierCapEnd === "true"
            }
          }
        }
      };
    },

    render(model, element) {
      const geometry = normalizeGeometry(model.geometry);
      const settings = barrierSettings(model);
      const data = artwork({ ...model, geometry });
      ["start", "end"].forEach((key) => {
        utils.setAttributeIfChanged(element, `data-barrier-${key}-x`, geometry[key].x);
        utils.setAttributeIfChanged(element, `data-barrier-${key}-y`, geometry[key].y);
      });
      utils.setAttributeIfChanged(element, "data-barrier-profile", geometry.profile);
      ["ratio", "q-x", "q-y", "c1-x", "c1-y", "c2-x", "c2-y"].forEach((name) => {
        element.removeAttribute(`data-barrier-${name}`);
      });
      if (geometry.profile === "arc") {
        utils.setAttributeIfChanged(element, "data-barrier-ratio", geometry.ratio);
      } else if (geometry.profile === "quadratic") {
        utils.setAttributeIfChanged(element, "data-barrier-q-x", geometry.q.x);
        utils.setAttributeIfChanged(element, "data-barrier-q-y", geometry.q.y);
      } else if (geometry.profile === "cubic") {
        ["c1", "c2"].forEach((key) => {
          utils.setAttributeIfChanged(element, `data-barrier-${key}-x`, geometry[key].x);
          utils.setAttributeIfChanged(element, `data-barrier-${key}-y`, geometry[key].y);
        });
      }
      utils.setAttributeIfChanged(element, "data-barrier-spacing", settings.spacing);
      utils.setAttributeIfChanged(element, "data-barrier-scale", settings.scale);
      utils.setAttributeIfChanged(element, "data-barrier-cap-start", settings.endCaps.start);
      utils.setAttributeIfChanged(element, "data-barrier-cap-end", settings.endCaps.end);
      const top = ensurePath(element, "top", "editor-road-barrier-top");
      const posts = ensurePath(element, "posts", "editor-road-barrier-posts");
      utils.setAttributeIfChanged(top, "d", data.top);
      utils.setAttributeIfChanged(top, "stroke-width", TOP_WIDTH * settings.scale);
      utils.setAttributeIfChanged(posts, "d", data.posts);
      utils.setAttributeIfChanged(posts, "stroke-width", POST_WIDTH * settings.scale);
      element.removeAttribute("transform");
    },

    hitTest(model, value, tolerance) {
      const settings = barrierSettings(model);
      const samples = samplesFor(model, settings.scale);
      const threshold = Math.max(HIT_TOLERANCE * settings.scale, Number(tolerance) || 0);
      return Math.min(distanceToSamples(value, samples, "base"), distanceToSamples(value, samples, "top")) <= threshold;
    },

    getControlPoints(model, _metrics, mode) {
      if (mode !== "edit") return [];
      const geometry = normalizeGeometry(model.geometry);
      const points = [
        { id: "start", ...geometry.start, role: "road-barrier", cursor: "grab" },
        { id: "end", ...geometry.end, role: "road-barrier", cursor: "grab" }
      ];
      if (geometry.profile === "arc") {
        const control = arcAdapter.getControlPoints(profileModel({ ...model, geometry }), { endpointOffset: 0 })
          .find((item) => item.id === "control");
        if (control) points.push({ ...control, role: "road-barrier-free" });
      } else if (geometry.profile === "quadratic") {
        points.push({ id: "q", ...geometry.q, role: "road-barrier-free", cursor: "grab" });
      } else if (geometry.profile === "cubic") {
        points.push(
          { id: "c1", ...geometry.c1, role: "road-barrier-free", cursor: "grab" },
          { id: "c2", ...geometry.c2, role: "road-barrier-free", cursor: "grab" }
        );
      }
      return points;
    },

    beginControlPointMove(model, cpId, pointer) {
      return { cpId, point: { x: pointer.x, y: pointer.y }, geometry: utils.clonePlain(model.geometry) };
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      const geometry = normalizeGeometry(model.geometry);
      model.geometry = geometry;
      if (cpId === "control" && geometry.profile === "arc") {
        const proxy = profileModel(model);
        arcAdapter.moveControlPoint(proxy, cpId, worldPoint, modifiers);
        model.geometry = normalizeGeometry({ ...proxy.geometry, profile: "arc" });
        return;
      }
      if (["q", "c1", "c2"].includes(cpId) && geometry[cpId]) {
        const snapped = Kroki.EditorGrid?.snapPoint(worldPoint, modifiers) || worldPoint;
        geometry[cpId] = { x: snapped.x, y: snapped.y };
        return;
      }
      if (!["start", "end"].includes(cpId)) return;
      const startState = modifiers.startState;
      const startGeometry = normalizeGeometry(startState?.geometry || geometry, geometry.profile);
      const source = startGeometry[cpId] || geometry[cpId];
      const pointer = startState?.point || worldPoint;
      const candidate = {
        x: source.x + worldPoint.x - pointer.x,
        y: source.y + worldPoint.y - pointer.y
      };
      const snapped = Kroki.EditorGrid?.snapPoint(candidate, modifiers) || candidate;
      model.geometry[cpId] = { x: snapped.x, y: snapped.y };
    },

    move(model, dx, dy) {
      const geometry = normalizeGeometry(model.geometry);
      model.geometry = geometry;
      ["start", "end", "q", "c1", "c2"].forEach((key) => {
        if (!geometry[key]) return;
        model.geometry[key].x += dx;
        model.geometry[key].y += dy;
      });
    },

    getBounds(model) {
      const samples = samplesFor(model);
      const points = samples.flatMap((sample) => [sample.base, sample.top]);
      const xs = points.map((value) => value.x);
      const ys = points.map((value) => value.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
      };
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("path", { class: "editor-object-selection editor-line-selection" });
    },

    renderSelection(element, model, _style, mode) {
      const data = artwork(model);
      utils.setAttributeIfChanged(element, "d", `${data.top} ${data.posts}`);
      utils.setAttributeIfChanged(element, "stroke-width", (TOP_WIDTH + 7) * barrierSettings(model).scale);
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    },

    selectedBarrierInfo(model) {
      const settings = barrierSettings(model);
      const profile = profileInfo(model);
      return {
        id: model.id,
        attached: false,
        spacing: settings.spacing,
        endCaps: settings.endCaps,
        profile: profile.current.id,
        profileTitle: profile.current.title,
        profileShort: profile.current.short,
        nextProfileTitle: profile.next.title,
        manual: true
      };
    },

    manualBarrierProfileInfo: profileInfo,

    cycleManualBarrierProfile(model) {
      model.geometry = nextProfileGeometry(model);
    },

    setManualBarrierSpacing(model, value) {
      model.metadata = {
        ...(model.metadata || {}),
        barrier: { ...barrierSettings(model), spacing: normalizeSpacing(value) }
      };
    },

    cycleManualBarrierEndCaps(model) {
      const settings = barrierSettings(model);
      const index = END_CAP_STATES.findIndex((state) => (
        state.start === settings.endCaps.start && state.end === settings.endCaps.end
      ));
      model.metadata = {
        ...(model.metadata || {}),
        barrier: {
          ...settings,
          endCaps: { ...END_CAP_STATES[(index + 1) % END_CAP_STATES.length] }
        }
      };
    },

    scaleForGroup(model, scale) {
      if (!Number.isFinite(Number(scale)) || Math.abs(Number(scale) - 1) < 0.000001) return;
      const settings = barrierSettings(model);
      model.metadata = {
        ...(model.metadata || {}),
        barrier: {
          ...settings,
          spacing: normalizeSpacing(settings.spacing * Number(scale)),
          scale: normalizeScale(settings.scale * Number(scale))
        }
      };
    },

    pointAt
  };

  registry.register("barrier", adapter);
})();

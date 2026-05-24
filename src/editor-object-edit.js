const OBJECT_EDIT_SVG_NS = "http://www.w3.org/2000/svg";
const objectEditCanvas = document.querySelector("#editorCanvas");
const objectEditLayer = document.querySelector("#editorEditLayer");
const editorTopIp = document.querySelector("#editorTopIp");
const editorSideIp = document.querySelector("#editorSideIp");
const canvasObjectHitTests = [];

function objectEditPoint(event) {
  const point = objectEditCanvas.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(objectEditCanvas.getScreenCTM().inverse());
}

function createEditElement(tag, attrs = {}) {
  const element = document.createElementNS(OBJECT_EDIT_SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function bindHoldAction(button, action, options = {}) {
  if (!button) return () => {};

  const startDelay = options.startDelay ?? 420;
  const repeatDelay = options.repeatDelay ?? 70;
  let startTimer = 0;
  let repeatTimer = 0;
  let suppressClick = false;
  let suppressClickTimer = 0;

  function clearTimers() {
    window.clearTimeout(startTimer);
    window.clearInterval(repeatTimer);
    startTimer = 0;
    repeatTimer = 0;
  }

  function clearClickSuppression() {
    window.clearTimeout(suppressClickTimer);
    suppressClickTimer = 0;
    suppressClick = false;
  }

  function clearClickSuppressionSoon() {
    window.clearTimeout(suppressClickTimer);
    suppressClickTimer = window.setTimeout(clearClickSuppression, 500);
  }

  function begin(event) {
    if (event.button != null && event.button !== 0) return;
    window.clearTimeout(suppressClickTimer);
    suppressClick = true;
    clearTimers();
    action();
    startTimer = window.setTimeout(() => {
      repeatTimer = window.setInterval(action, repeatDelay);
    }, startDelay);
    event.preventDefault();
  }

  function end() {
    clearTimers();
    clearClickSuppressionSoon();
  }

  button.addEventListener("pointerdown", begin);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", end);
  button.addEventListener("click", (event) => {
    if (suppressClick) {
      clearClickSuppression();
      event.preventDefault();
      return;
    }
    action();
  });

  return () => {
    clearTimers();
    clearClickSuppression();
  };
}

function registerCanvasObjectHitTest(hitTest) {
  if (typeof hitTest !== "function") return () => {};

  canvasObjectHitTests.push(hitTest);
  return () => {
    const index = canvasObjectHitTests.indexOf(hitTest);
    if (index >= 0) canvasObjectHitTests.splice(index, 1);
  };
}

function hasCanvasObjectAt(event) {
  return canvasObjectHitTests.some((hitTest) => {
    try {
      return Boolean(hitTest(event));
    } catch {
      return false;
    }
  });
}

function isPanelOpen(panel) {
  return Boolean(panel && !panel.classList.contains("gizli"));
}

function positionPanelNearButton(panel, button) {
  if (!panel || !button) return;

  const buttonRect = button.getBoundingClientRect();
  const panelHeight = panel.offsetHeight || 94;
  const top = Math.max(8, Math.min(buttonRect.top, window.innerHeight - panelHeight - 8));
  panel.style.top = Math.round(top) + "px";
}

function positionOpenPanelNearButton(panel, button) {
  if (!isPanelOpen(panel)) return;
  positionPanelNearButton(panel, button);
}

window.krokiObjectEditCore = {
  svgNs: OBJECT_EDIT_SVG_NS,
  canvas: objectEditCanvas,
  editLayer: objectEditLayer,
  topIp: editorTopIp,
  sideIp: editorSideIp,
  pointFromEvent: objectEditPoint,
  createSvgElement: createEditElement,
  bindHoldAction,
  positionPanelNearButton,
  positionOpenPanelNearButton,
  registerCanvasObjectHitTest,
  hasCanvasObjectAt,
  buttons: {
    done: document.querySelector("#btnEditTamam"),
    copy: document.querySelector("#btnEditKopyala"),
    group: document.querySelector("#btnEditGrupla"),
    ungroup: document.querySelector("#btnEditGrupCoz"),
    bringForward: document.querySelector("#btnEditOneGetir"),
    sendBackward: document.querySelector("#btnEditArkayaGonder"),
    delete: document.querySelector("#btnEditSil")
  }
};

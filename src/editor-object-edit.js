const OBJECT_EDIT_SVG_NS = "http://www.w3.org/2000/svg";
const objectEditCanvas = document.querySelector("#editorCanvas");
const objectEditLayer = document.querySelector("#editorEditLayer");
const editorTopIp = document.querySelector("#editorTopIp");
const editorSideIp = document.querySelector("#editorSideIp");
const canvasObjectHitTests = [];
const HOLD_REPEAT_SPEED_MULTIPLIER = 3;
const TOUCH_NUMBER_PICKER_QUERY = "(hover: none) and (pointer: coarse)";
const touchNumberPickerMedia = window.matchMedia?.(TOUCH_NUMBER_PICKER_QUERY) || null;
const objectEditUiPx = window.Kroki?.uiPx || ((value) => Number(value) || 0);

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

function isDisabledControl(control) {
  return Boolean(control?.disabled || control?.getAttribute?.("aria-disabled") === "true");
}

function fastRepeatDelay(value) {
  const delay = Number(value);
  const clean = Number.isFinite(delay) && delay > 0 ? delay : 70;
  return Math.max(16, Math.round(clean / HOLD_REPEAT_SPEED_MULTIPLIER));
}

function bindHoldAction(button, action, options = {}) {
  if (!button) return () => {};

  const startDelay = options.startDelay ?? 420;
  const repeatDelay = fastRepeatDelay(options.repeatDelay ?? 70);
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
    if (isDisabledControl(button)) return;
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
    if (isDisabledControl(button)) return;
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

function isTouchNumberPickerMode() {
  return Boolean(touchNumberPickerMedia?.matches);
}

function isNumberPickerInput(target) {
  return target instanceof HTMLInputElement && target.type === "number";
}

function rememberNumberPickerState(input) {
  if (!input.dataset.krokiOriginalInputMode) {
    input.dataset.krokiOriginalInputMode = input.getAttribute("inputmode") ?? "";
  }
  if (!input.dataset.krokiOriginalReadonly) {
    input.dataset.krokiOriginalReadonly = input.readOnly ? "true" : "false";
  }
}

function syncNumberPickerInput(input) {
  if (!isNumberPickerInput(input)) return;
  rememberNumberPickerState(input);
  if (isTouchNumberPickerMode()) {
    input.readOnly = true;
    input.setAttribute("inputmode", "none");
    input.setAttribute("aria-readonly", "true");
    input.classList.add("is-touch-locked-number-picker");
    return;
  }
  input.readOnly = input.dataset.krokiOriginalReadonly === "true";
  const originalInputMode = input.dataset.krokiOriginalInputMode || "";
  if (originalInputMode) input.setAttribute("inputmode", originalInputMode);
  else input.removeAttribute("inputmode");
  if (input.readOnly) input.setAttribute("aria-readonly", "true");
  else input.removeAttribute("aria-readonly");
  input.classList.remove("is-touch-locked-number-picker");
}

function syncNumberPickerInputs(root = document) {
  if (isNumberPickerInput(root)) syncNumberPickerInput(root);
  root.querySelectorAll?.("input[type='number']").forEach(syncNumberPickerInput);
}

function guardTouchNumberPickerInput(event) {
  if (!isTouchNumberPickerMode()) return;
  if (!isNumberPickerInput(event.target)) return;
  event.preventDefault();
  event.target.blur?.();
}

function observeNumberPickers() {
  syncNumberPickerInputs();
  touchNumberPickerMedia?.addEventListener?.("change", () => syncNumberPickerInputs());
  touchNumberPickerMedia?.addListener?.(() => syncNumberPickerInputs());
  document.addEventListener("pointerdown", guardTouchNumberPickerInput, true);
  document.addEventListener("beforeinput", guardTouchNumberPickerInput, true);
  document.addEventListener("paste", guardTouchNumberPickerInput, true);
  document.addEventListener("drop", guardTouchNumberPickerInput, true);
  document.addEventListener("keydown", (event) => {
    if (!isTouchNumberPickerMode() || !isNumberPickerInput(event.target)) return;
    const allowed = ["Tab", "Shift", "Control", "Alt", "Meta", "Escape"];
    if (!allowed.includes(event.key)) event.preventDefault();
  }, true);
  new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => syncNumberPickerInputs(node));
    });
  }).observe(document.body, { childList: true, subtree: true });
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
  const edgeGap = objectEditUiPx(8);
  const panelHeight = panel.offsetHeight || objectEditUiPx(94);
  const top = Math.max(edgeGap, Math.min(buttonRect.top, window.innerHeight - panelHeight - edgeGap));
  panel.style.top = Math.round(top) + "px";
}

function positionOpenPanelNearButton(panel, button) {
  if (!isPanelOpen(panel)) return;
  positionPanelNearButton(panel, button);
}

observeNumberPickers();

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

(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  let activeResolve = null;
  let lastFocus = null;

  const layer = document.createElement("div");
  layer.className = "kroki-dialog-layer gizli";
  layer.setAttribute("role", "presentation");

  const panel = document.createElement("div");
  panel.className = "kroki-dialog-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  layer.append(panel);
  document.body.append(layer);

  function syncViewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 720;
    document.documentElement.style.setProperty("--kroki-vvh", `${Math.max(320, height)}px`);
  }

  syncViewportHeight();
  window.visualViewport?.addEventListener("resize", syncViewportHeight);
  window.addEventListener("resize", syncViewportHeight);

  function close(result) {
    if (!activeResolve) return;
    const resolve = activeResolve;
    activeResolve = null;
    layer.classList.add("gizli");
    panel.replaceChildren();
    resolve(result);
    if (lastFocus?.focus) window.setTimeout(() => lastFocus.focus({ preventScroll: true }), 0);
  }

  function button(label, value, variant = "") {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `kroki-dialog-btn ${variant}`.trim();
    item.textContent = label;
    item.addEventListener("click", () => close(value));
    return item;
  }

  function open(options = {}) {
    if (activeResolve) close(null);
    syncViewportHeight();
    lastFocus = document.activeElement;

    panel.className = `kroki-dialog-panel ${options.kind ? `is-${options.kind}` : ""}`.trim();
    panel.replaceChildren();

    const title = document.createElement("div");
    title.className = "kroki-dialog-title";
    title.textContent = options.title || "Kroki Pro";

    const body = document.createElement("div");
    body.className = "kroki-dialog-body";
    if (options.message) {
      const message = document.createElement("p");
      message.textContent = options.message;
      body.append(message);
    }

    let input = null;
    if (options.input) {
      const field = document.createElement("label");
      field.className = "kroki-dialog-field";
      const label = document.createElement("span");
      label.textContent = options.input.label || "";
      input = document.createElement("input");
      input.type = "text";
      input.value = options.input.value || "";
      input.placeholder = options.input.placeholder || "";
      input.maxLength = options.input.maxLength || 80;
      field.append(label, input);
      body.append(field);
    }

    const actions = document.createElement("div");
    actions.className = "kroki-dialog-actions";
    (options.actions || [{ label: "Tamam", value: true, variant: "primary" }]).forEach((action) => {
      const actionButton = button(action.label, action.value, action.variant);
      if (action.value === "__input__") {
        actionButton.addEventListener("click", (event) => {
          event.stopImmediatePropagation();
          const value = input?.value?.trim?.() || "";
          if (options.input?.required && !value) {
            input?.focus({ preventScroll: true });
            panel.classList.add("is-shaking");
            window.setTimeout(() => panel.classList.remove("is-shaking"), 180);
            return;
          }
          close(value);
        }, true);
      }
      actions.append(actionButton);
    });

    panel.append(title, body, actions);
    layer.classList.remove("gizli");

    return new Promise((resolve) => {
      activeResolve = resolve;
      window.setTimeout(() => {
        const focusTarget = input || actions.querySelector(".primary") || actions.querySelector("button");
        focusTarget?.focus?.({ preventScroll: true });
        input?.select?.();
      }, 0);
    });
  }

  layer.addEventListener("pointerdown", (event) => {
    if (event.target === layer) close(null);
  });

  document.addEventListener("keydown", (event) => {
    if (!activeResolve) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(null);
    }
    if (event.key === "Enter" && panel.classList.contains("is-prompt")) {
      const inputButton = panel.querySelector(".kroki-dialog-btn.primary");
      inputButton?.click();
    }
  });

  Kroki.Dialog = {
    alert(message, title = "Kroki Pro") {
      return open({
        title,
        message,
        actions: [{ label: "Tamam", value: true, variant: "primary" }]
      });
    },
    choice(options = {}) {
      const actions = Array.isArray(options.actions) && options.actions.length
        ? options.actions
        : [{ label: "Tamam", value: true, variant: "primary" }];
      return open({
        title: options.title || "Kroki Pro",
        message: options.message || "",
        actions
      });
    },
    confirm(message, title = "Onay") {
      return open({
        title,
        message,
        actions: [
          { label: "İptal", value: false },
          { label: "Devam", value: true, variant: "primary" }
        ]
      }).then(Boolean);
    },
    prompt(options = {}) {
      return open({
        kind: "prompt",
        title: options.title || "Bilgi gir",
        message: options.message || "",
        input: {
          label: options.label || "",
          value: options.value || "",
          placeholder: options.placeholder || "",
          maxLength: options.maxLength || 80,
          required: options.required !== false
        },
        actions: [
          { label: "İptal", value: null },
          { label: "Kaydet", value: "__input__", variant: "primary" }
        ]
      });
    }
  };

  window.KrokiDialog = Kroki.Dialog;
})();

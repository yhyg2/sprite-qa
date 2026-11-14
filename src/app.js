"use strict";

(() => {
  const { MAX_BYTES, DEFAULT_SETTINGS, imageHeader, alphaStatus, validRegion, comparePixels, assessment } = SpriteQA;
  const $ = (id) => document.getElementById(id);
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  const regionInputs = { x: $("region-x"), y: $("region-y"), width: $("region-w"), height: $("region-h") };
  const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
  const MAX_FILES = 100;
  const issueLabels = {
    "unsupported-format": "不支持的格式",
    "extension-mismatch": "扩展名与内容不符",
    "invalid-header": "文件头损坏",
    "file-too-large": "文件超过 64 MiB",
    "canvas-too-large": "画布超过上限",
    "animated": "动画格式",
    "decode-failed": "读取或解码失败",
    "opaque": "全图不透明",
    "empty-image": "全图透明",
    "size-mismatch": "画布尺寸不符",
    "no-outside-pixels": "区域外无可比像素",
    "outside-changes": "区域外变化超限",
  };
  const statusLabels = { reference: "基准", pass: "通过", review: "复核", error: "异常", pending: "待比较" };
  const state = {
    entries: [],
    reference: null,
    selected: null,
    region: null,
    settings: { ...DEFAULT_SETTINGS },
    demo: false,
    busy: false,
    filter: false,
    mode: "diff",
    drawing: false,
    pointer: null,
    preview: null,
    previewError: false,
    previewVersion: 0,
    loadingPreview: false,
  };

  function notify(message = "") {
    $("notice").textContent = message;
    $("notice").hidden = !message;
  }

  function regionFeedback(message = "") {
    $("region-feedback").textContent = message;
    $("region-feedback").hidden = !message;
  }

  function setBusy(busy) {
    state.busy = busy;
    if (busy) {
      state.drawing = false;
      state.pointer = null;
      for (const button of $("results").querySelectorAll("button")) button.disabled = true;
    }
    renderControls();
    renderPreview();
  }

  function renderControls() {
    const hasReference = Boolean(state.reference);
    for (const id of ["demo", "import", "delta", "limit"]) $(id).disabled = state.busy;
    $("base").disabled = state.busy || !state.entries.some((entry) => entry.decoded && !entry.fileIssue);
    $("draw").disabled = state.busy || !hasReference || !state.preview?.base;
    $("draw").setAttribute("aria-pressed", String(state.drawing));
    $("clear-region").disabled = state.busy || !state.region;
    $("apply-region").disabled = state.busy || !hasReference;
    $("export").disabled = state.busy || !state.entries.length;
    $("filter").disabled = state.busy || !state.entries.length;
    $("filter").setAttribute("aria-pressed", String(state.filter));
    for (const input of Object.values(regionInputs)) input.disabled = state.busy || !hasReference;
  }

  function syncRegionInputs() {
    for (const [key, input] of Object.entries(regionInputs)) input.value = state.region?.[key] ?? "";
    regionFeedback();
  }

  function renderReferences() {
    const select = $("base");
    const options = [new Option(state.entries.length ? "请选择基准立绘" : "等待导入", "")];
    for (const entry of state.entries) {
      if (entry.decoded && !entry.fileIssue) options.push(new Option(entry.label, String(entry.id)));
    }
    select.replaceChildren(...options);
    select.value = state.reference ? String(state.reference.id) : "";
  }

  function percentage(metric) {
    return metric.compared ? metric.changed * 100 / metric.compared : null;
  }

  function formatPercent(metric) {
    const value = metric && percentage(metric);
    if (value == null) return "—";
    if (value > 0 && value < 0.005) return "<0.01%";
    return value.toFixed(2) + "%";
  }

  function formatSize(size) {
    return size ? size.width + " × " + size.height : "—";
  }

  function renderResults(focusId = null) {
    const body = $("results");
    const template = document.createDocumentFragment();
    const rows = state.entries.filter((entry) => !state.filter || ["review", "error"].includes(entry.status));
    for (const entry of rows) {
      const row = document.createElement("tr");
      row.dataset.status = entry.status;
      if (entry === state.selected) row.classList.add("is-selected");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "row-file";
      button.disabled = state.busy;
      button.setAttribute("aria-pressed", String(entry === state.selected));
      button.dataset.entry = entry.id;
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v14H4zM4 16l4.5-4 3.5 3 3-2 5 4M15.5 9.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg><span></span>';
      button.lastElementChild.textContent = entry.label;
      row.insertCell().append(button);

      const canvasSize = row.insertCell();
      canvasSize.className = "metric";
      canvasSize.textContent = formatSize(entry.size);
      for (const key of ["inside", "outside"]) {
        const cell = row.insertCell();
        const metric = entry.comparison?.[key];
        cell.className = "metric";
        cell.textContent = formatPercent(metric);
        if (metric) cell.title = metric.changed.toLocaleString() + " / " + metric.compared.toLocaleString() + " 像素";
        if (key === "outside" && entry.status === "review") cell.classList.add("metric-alert");
      }
      const tag = document.createElement("span");
      tag.className = "status-tag status-" + entry.status;
      tag.textContent = entry.issues.length ? entry.issues.map((issue) => issueLabels[issue]).join("、") : statusLabels[entry.status];
      row.insertCell().append(tag);
      template.append(row);
    }
    body.replaceChildren(template);
    if (focusId !== null) body.querySelector('[data-entry="' + focusId + '"]')?.focus({ preventScroll: true });
    $("no-results").hidden = !state.filter || rows.length > 0;

    if (!state.entries.length) {
      $("summary").textContent = "导入至少两张图片开始对照。";
    } else if (!state.reference) {
      $("summary").textContent = state.entries.length + " 张素材 · 请选择一张含透明像素的有效立绘作为基准";
    } else if (state.entries.length === 1) {
      $("summary").textContent = "已选定基准，导入包含基准和差分的完整批次开始对照。";
    } else {
      const totals = { pass: 0, review: 0, error: 0 };
      for (const entry of state.entries) {
        if (entry.status in totals) totals[entry.status]++;
      }
      $("summary").textContent = [
        (state.entries.length - 1) + " 张待检图",
        totals.pass + " 通过",
        totals.review + " 复核",
        totals.error + " 异常",
      ].join(" · ");
    }
  }

  async function withBitmap(entry, use) {
    const bitmap = await createImageBitmap(entry.file, { imageOrientation: "none" });
    try {
      if (bitmap.width !== entry.size.width || bitmap.height !== entry.size.height) {
        throw new Error("Decoded dimensions differ from image header");
      }
      return use(bitmap);
    } finally {
      bitmap.close();
    }
  }

  function readPixels(bitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    try {
      const ctx = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    } finally {
      canvas.width = canvas.height = 0;
    }
  }

  async function inspect(entry) {
    try {
      if (entry.file.size > MAX_BYTES) {
        entry.fileIssue = "file-too-large";
        return;
      }
      entry.size = imageHeader(await entry.file.arrayBuffer(), entry.file.name);
      const alpha = await withBitmap(entry, (bitmap) => alphaStatus(readPixels(bitmap)));
      entry.decoded = true;
      entry.fileIssue = alpha === "ok" ? null : alpha;
    } catch (error) {
      entry.fileIssue = Object.hasOwn(issueLabels, error.code) ? error.code : "decode-failed";
    }
  }

  async function analyze() {
    let reference = state.reference;
    let referencePixels;
    if (reference) {
      try {
        referencePixels = await withBitmap(reference, readPixels);
      } catch {
        reference.fileIssue = "decode-failed";
        reference.decoded = false;
        state.reference = reference = null;
        state.region = null;
        notify("基准立绘读取失败。请选择另一张有效的基准，或重新导入该文件。");
      }
    }
    for (const [index, entry] of state.entries.entries()) {
      entry.comparison = null;
      entry.issues = entry.fileIssue ? [entry.fileIssue] : [];
      entry.status = entry.issues.length ? "error" : "pending";
      if (entry === reference) {
        entry.status = "reference";
      } else if (reference && entry.decoded) {
        const { width, height } = reference.size;
        if (entry.size.width !== width || entry.size.height !== height) {
          entry.issues.push("size-mismatch");
          entry.status = "error";
        }
        if (entry.status !== "error") {
          $("summary").textContent = "正在比较 " + (index + 1) + " / " + state.entries.length + " 张素材…";
          await nextTask();
          try {
            const candidate = await withBitmap(entry, readPixels);
            const { inside, outside } = comparePixels(referencePixels, candidate, width, height, state.region, state.settings.delta);
            entry.comparison = { inside, outside };
            const result = assessment(outside, state.settings.outsideLimit);
            entry.status = result.status;
            if (result.issue) entry.issues.push(result.issue);
          } catch {
            entry.fileIssue = "decode-failed";
            entry.decoded = false;
            entry.issues.push(entry.fileIssue);
            entry.status = "error";
          }
        }
      }
    }
  }

  async function importFiles(files, useDemo = false) {
    if (state.busy || (!useDemo && files.length === 0)) return;
    if (files.length > MAX_FILES) {
      notify("每批最多导入 100 张图片，请把素材分批检查。");
      return;
    }
    notify();
    setBusy(true);
    try {
      if (useDemo) files = await makeDemo();
      state.demo = useDemo;
      state.reference = null;
      state.selected = null;
      state.preview = null;
      state.filter = false;
      state.region = null;
      state.entries = [];
      const nameCounts = new Map();
      for (const file of files) nameCounts.set(file.name, (nameCounts.get(file.name) ?? 0) + 1);
      state.entries = files.map((file, index) => ({
        file,
        id: index + 1,
        label: nameCounts.get(file.name) > 1 ? file.name + " [" + (index + 1) + "]" : file.name,
        size: null,
        decoded: false,
        fileIssue: null,
        issues: [],
        status: "pending",
        comparison: null,
      }));
      $("dataset-label").textContent = useDemo ? "演示素材" : files.length + " 张素材";
      $("dataset-label").hidden = false;
      $("results").replaceChildren();
      renderPreview();
      for (const [index, entry] of state.entries.entries()) {
        $("summary").textContent = "正在读取 " + (index + 1) + " / " + state.entries.length + " 张素材…";
        await nextTask();
        await inspect(entry);
      }
      state.reference = state.entries.find((entry) => entry.decoded && !entry.fileIssue) ?? null;
      if (useDemo && state.reference) {
        state.region = { ...DEMO_REGION };
        state.settings = { ...DEFAULT_SETTINGS };
        syncSliders();
      }
      await analyze();
      state.selected = (useDemo ? state.entries[2] : state.entries.find((entry) => entry.comparison)) ??
        state.reference ?? state.entries.find((entry) => entry.decoded) ?? state.entries[0];
      state.mode = initialMode();
    } catch {
      notify("无法加载这批素材，请重新导入。");
    } finally {
      finishReview();
    }
  }

  function initialMode() {
    if (state.selected?.comparison) return "diff";
    return state.selected && state.selected !== state.reference ? "candidate" : "base";
  }

  function finishReview() {
    renderReferences();
    syncRegionInputs();
    setBusy(false);
    renderResults();
    queuePreview();
  }

  async function rerun() {
    setBusy(true);
    try {
      await analyze();
      if (!allowedMode(state.mode)) state.mode = initialMode();
    } finally {
      finishReview();
    }
  }

  function allowedMode(mode) {
    if (mode === "base") return Boolean(state.reference?.decoded);
    if (mode === "candidate") return Boolean(state.selected?.decoded && state.selected !== state.reference);
    return Boolean(state.reference && state.selected?.comparison);
  }

  function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function viewFromBitmap(bitmap) {
    const scale = Math.min(1, 1200 / bitmap.width, 1200 / bitmap.height);
    const view = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    view.getContext("2d").drawImage(bitmap, 0, 0, view.width, view.height);
    return view;
  }

  function makeOverlay(mask, width, height, view) {
    const overlay = makeCanvas(view.width, view.height);
    const ctx = overlay.getContext("2d");
    const image = ctx.createImageData(view.width, view.height);
    const xScale = view.width / width;
    const yScale = view.height / height;
    for (let y = 0, index = 0; y < height; y++) {
      const line = Math.floor(y * yScale) * view.width;
      for (let x = 0; x < width; x++, index++) {
        const mark = mask[index];
        if (!mark) continue;
        const i = (line + Math.floor(x * xScale)) * 4;
        if (mark === 1 && image.data[i + 3]) continue;
        image.data[i] = mark === 1 ? 57 : 255;
        image.data[i + 1] = mark === 1 ? 227 : 131;
        image.data[i + 2] = mark === 1 ? 197 : 156;
        image.data[i + 3] = 239;
      }
    }
    ctx.putImageData(image, 0, 0);
    return overlay;
  }

  async function makePreview(reference, candidate, region, delta) {
    const comparable = Boolean(reference && candidate?.comparison);
    const base = reference?.decoded ? await withBitmap(reference, (bitmap) => ({
      view: viewFromBitmap(bitmap),
      pixels: comparable ? readPixels(bitmap) : null,
    })) : null;
    const target = candidate?.decoded && candidate !== reference ? await withBitmap(candidate, (bitmap) => ({
      view: viewFromBitmap(bitmap),
      pixels: comparable ? readPixels(bitmap) : null,
    })) : null;
    let overlay = null;
    if (comparable) {
      const { width, height } = reference.size;
      const { mask } = comparePixels(base.pixels, target.pixels, width, height, region, delta, true);
      overlay = makeOverlay(mask, width, height, base.view);
    }
    return { base: base?.view ?? null, candidate: target?.view ?? null, overlay };
  }

  function queuePreview() {
    state.previewVersion++;
    state.preview = null;
    state.previewError = false;
    renderControls();
    renderPreview();
    if (!state.loadingPreview) void loadLatestPreview();
  }

  async function loadLatestPreview() {
    state.loadingPreview = true;
    let version;
    do {
      version = state.previewVersion;
      if (state.busy) break;
      try {
        const preview = await makePreview(state.reference, state.selected, state.region, state.settings.delta);
        if (version === state.previewVersion && !state.busy) state.preview = preview;
      } catch {
        if (version === state.previewVersion && !state.busy) state.previewError = true;
      }
    } while (version !== state.previewVersion);
    state.loadingPreview = false;
    renderControls();
    renderPreview();
  }

  function previewSize() {
    return state.mode === "candidate" ? state.selected?.size : state.reference?.size;
  }

  function sizeStage() {
    if ($("stage").hidden) return;
    const area = $("stage").parentElement;
    const ratio = $("canvas").width / $("canvas").height;
    const availableHeight = parseFloat(getComputedStyle(area).minHeight) - 38;
    const width = Math.max(1, Math.min(area.clientWidth - 38, availableHeight * ratio));
    $("stage").style.width = width + "px";
    $("stage").style.height = width / ratio + "px";
  }

  function renderRegion() {
    const box = $("region-box");
    const region = state.pointer?.region ?? state.region;
    const size = previewSize();
    const visible = !state.busy && !$("stage").hidden && region && size &&
      (state.mode !== "candidate" || Boolean(state.selected?.comparison));
    box.hidden = !visible;
    if (!visible) return;
    box.style.left = region.x * 100 / size.width + "%";
    box.style.top = region.y * 100 / size.height + "%";
    box.style.width = region.width * 100 / size.width + "%";
    box.style.height = region.height * 100 / size.height + "%";
    box.classList.toggle("label-below", region.y < size.height * 0.09);
  }

  function renderPreview() {
    for (const button of modeButtons) {
      button.disabled = state.busy || !allowedMode(button.dataset.mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
    }
    const preview = state.preview;
    const view = state.mode === "candidate" ? preview?.candidate : preview?.base;
    const baseName = state.reference?.label;
    const targetName = state.selected?.label;
    $("preview-name").textContent = state.mode === "base" ? (baseName ?? "等待导入立绘") :
      state.mode === "candidate" ? (targetName ?? "等待导入立绘") :
      [baseName, targetName].filter(Boolean).join(" ↔ ") || "等待导入立绘";
    $("preview-name").title = $("preview-name").textContent;
    $("stage").hidden = !view;
    $("draw-layer").hidden = !view || !state.drawing;
    $("legend").hidden = !view || state.mode !== "diff";
    $("preview-size").textContent = view ? formatSize(previewSize()) + " px" : "";
    const split = Boolean(view && state.mode === "split");
    $("split-controls").hidden = !split;
    $("split-line").hidden = !split;
    const message = $("preview-message");
    message.hidden = Boolean(view);
    if (!view) {
      message.textContent = state.previewError ? "预览读取失败，请重新导入素材。" :
        state.busy ? "正在检查素材…" :
        state.loadingPreview || (state.selected?.decoded && !preview) ? "正在准备预览…" :
        state.entries.length ? "当前文件没有可预览的图像。" :
        "从右上角导入素材，或载入演示。";
      return;
    }
    const canvas = $("canvas");
    canvas.width = view.width;
    canvas.height = view.height;
    const ctx = canvas.getContext("2d");
    if (state.mode === "diff") ctx.globalAlpha = 0.58;
    ctx.drawImage(view, 0, 0);
    ctx.globalAlpha = 1;
    if (state.mode === "diff" && preview.overlay) ctx.drawImage(preview.overlay, 0, 0);
    if (split) {
      const position = Number($("split").value);
      const x = Math.round(position * view.width / 100);
      const rightWidth = view.width - x;
      if (rightWidth > 0) {
        ctx.clearRect(x, 0, rightWidth, view.height);
        ctx.drawImage(preview.candidate, x, 0, rightWidth, view.height, x, 0, rightWidth, view.height);
      }
      $("split-line").style.left = "calc(" + position + "% - 1px)";
      $("split-line").hidden = position === 0 || position === 100;
    }
    sizeStage();
    renderRegion();
  }

  function syncSliders() {
    $("delta").value = state.settings.delta;
    $("limit").value = state.settings.outsideLimit;
    $("delta-value").value = $("delta").value + " / 255";
    $("limit-value").value = (Number($("limit").value) / 100).toFixed(2) + "%";
  }

  function setRegion(region) {
    state.region = region;
    state.drawing = false;
    state.pointer = null;
    syncRegionInputs();
    void rerun();
  }

  function applyRegionInputs() {
    if (state.busy || !state.reference) return;
    const region = Object.fromEntries(Object.entries(regionInputs).map(([key, input]) => [key, input.valueAsNumber]));
    if (!validRegion(region, state.reference.size.width, state.reference.size.height)) {
      regionFeedback("请填入整数坐标，确保矩形位于基准画布内，宽和高至少为 1。");
      return;
    }
    setRegion(region);
  }

  function pointAt(event) {
    const box = $("draw-layer").getBoundingClientRect();
    const { width, height } = state.reference.size;
    return {
      x: Math.max(0, Math.min(width, (event.clientX - box.left) * width / box.width)),
      y: Math.max(0, Math.min(height, (event.clientY - box.top) * height / box.height)),
    };
  }

  function rectangle(from, to) {
    const x = Math.floor(Math.min(from.x, to.x));
    const y = Math.floor(Math.min(from.y, to.y));
    return {
      x,
      y,
      width: Math.ceil(Math.max(from.x, to.x)) - x,
      height: Math.ceil(Math.max(from.y, to.y)) - y,
    };
  }

  function cancelDrawing() {
    state.drawing = false;
    state.pointer = null;
    regionFeedback();
    renderControls();
    renderPreview();
  }

  function report() {
    const data = {
      schemaVersion: 1,
      referenceId: state.reference?.id ?? null,
      settings: {
        pixelDelta: state.settings.delta,
        maxOutsidePercent: state.settings.outsideLimit / 100,
        allowedRegion: state.region,
      },
      files: state.entries.map((entry) => ({
        id: entry.id,
        name: entry.file.name,
        format: entry.size?.format ?? null,
        width: entry.size?.width ?? null,
        height: entry.size?.height ?? null,
        status: entry.status,
        issues: entry.issues,
        comparison: entry.comparison ? Object.fromEntries(Object.entries(entry.comparison).map(([key, metric]) => [
          key, { ...metric, percent: percentage(metric) },
        ])) : null,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sprite-qa-report.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  $("import").addEventListener("click", () => $("files").click());
  $("files").addEventListener("change", (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    void importFiles(files);
  });
  $("demo").addEventListener("click", () => void importFiles([], true));
  $("base").addEventListener("change", (event) => {
    if (state.busy) return;
    const previousSize = state.reference?.size;
    state.reference = state.entries.find((entry) => entry.id === Number(event.target.value)) ?? null;
    if (state.reference?.size.width !== previousSize?.width || state.reference?.size.height !== previousSize?.height) {
      state.region = null;
    }
    if (!state.reference) state.region = null;
    if (state.reference === state.selected) state.mode = "base";
    void rerun();
  });
  $("results").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-entry]");
    if (state.busy || !button) return;
    state.selected = state.entries.find((entry) => entry.id === Number(button.dataset.entry));
    if (state.drawing) cancelDrawing();
    if (!["diff", "split"].includes(state.mode) || !allowedMode(state.mode)) state.mode = initialMode();
    renderResults(state.selected.id);
    queuePreview();
  });
  $("filter").addEventListener("click", () => {
    state.filter = !state.filter;
    renderControls();
    renderResults();
  });
  $("export").addEventListener("click", report);
  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      if (state.drawing) cancelDrawing();
      state.mode = button.dataset.mode;
      renderPreview();
    });
  }
  $("split").addEventListener("input", renderPreview);
  $("delta").addEventListener("input", () => $("delta-value").value = $("delta").value + " / 255");
  $("limit").addEventListener("input", () => $("limit-value").value = (Number($("limit").value) / 100).toFixed(2) + "%");
  $("delta").addEventListener("change", () => {
    state.settings.delta = Number($("delta").value);
    if (state.reference) void rerun();
  });
  $("limit").addEventListener("change", () => {
    state.settings.outsideLimit = Number($("limit").value);
    if (state.reference) void rerun();
  });
  $("apply-region").addEventListener("click", applyRegionInputs);
  for (const input of Object.values(regionInputs)) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") applyRegionInputs();
    });
  }
  $("clear-region").addEventListener("click", () => setRegion(null));
  $("draw").addEventListener("click", () => {
    if (state.drawing) {
      cancelDrawing();
      return;
    }
    state.drawing = true;
    state.mode = "base";
    regionFeedback("在预览中拖动框选。按 Esc 退出。");
    renderControls();
    renderPreview();
    $("stage").scrollIntoView({ block: "nearest" });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.drawing) cancelDrawing();
  });
  const drawLayer = $("draw-layer");
  drawLayer.addEventListener("pointerdown", (event) => {
    if (!state.drawing || state.pointer || event.button !== 0) return;
    const from = pointAt(event);
    state.pointer = { id: event.pointerId, from, region: null };
    drawLayer.setPointerCapture(event.pointerId);
  });
  drawLayer.addEventListener("pointermove", (event) => {
    if (event.pointerId !== state.pointer?.id) return;
    state.pointer.region = rectangle(state.pointer.from, pointAt(event));
    renderRegion();
  });
  drawLayer.addEventListener("pointerup", (event) => {
    if (event.pointerId !== state.pointer?.id) return;
    const to = pointAt(event);
    const from = state.pointer.from;
    state.pointer = null;
    if (from.x === to.x || from.y === to.y) {
      renderRegion();
      return;
    }
    const region = rectangle(from, to);
    state.mode = initialMode();
    setRegion(region);
  });
  for (const name of ["pointercancel", "lostpointercapture"]) {
    drawLayer.addEventListener(name, (event) => {
      if (event.pointerId !== state.pointer?.id) return;
      state.pointer = null;
      renderRegion();
    });
  }

  let dragDepth = 0;
  const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
  document.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth++;
    $("drop-zone").hidden = state.busy;
  });
  document.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = state.busy ? "none" : "copy";
  });
  document.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $("drop-zone").hidden = true;
  });
  document.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    $("drop-zone").hidden = true;
    void importFiles([...event.dataTransfer.files]);
  });
  new ResizeObserver(sizeStage).observe($("stage").parentElement);

  renderControls();
  renderPreview();
})();

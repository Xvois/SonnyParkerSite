/* ==========================================================================
   gallery.js — colour-sorted photograph wall.

   Reads resources/photos/photos.json (written by scripts/photos.py), lays the
   photographs out in shortest-column order so the colour spectrum runs
   left-to-right, and lets a colour be picked to pick out the ones in it.

   Nothing here talks to a server. Drag-and-drop previews are computed in the
   browser and never leave it.
   ========================================================================== */

(() => {
  "use strict";

  const BASE = "resources/photos/";

  // Twelve 30° hue buckets, plus three neutrals. Chosen so a photograph always
  // lands in exactly one of them.
  const BUCKETS = [
    { at: 0, name: "Reds" },
    { at: 30, name: "Oranges" },
    { at: 60, name: "Yellows" },
    { at: 90, name: "Chartreuse" },
    { at: 120, name: "Greens" },
    { at: 150, name: "Mint" },
    { at: 180, name: "Teals" },
    { at: 210, name: "Azures" },
    { at: 240, name: "Blues" },
    { at: 270, name: "Violets" },
    { at: 300, name: "Purples" },
    { at: 330, name: "Magentas" },
  ];

  const NEUTRALS = [
    { tone: "dark", name: "Blacks", css: "#1b1b19" },
    { tone: "mid", name: "Greys", css: "#8a887f" },
    { tone: "light", name: "Whites", css: "#ebe9e2" },
  ];

  const state = {
    photos: [],
    previews: [],
    selection: "all",
    nodes: new Map(),
  };

  const $ = (id) => document.getElementById(id);
  const wall = $("wall");
  const colourbar = $("colourbar");
  const swatchHost = $("swatches");
  const status = $("status");
  const countEl = $("photo-count");
  const emptyEl = $("empty");
  const dropzone = $("dropzone");
  const fileInput = $("file-input");

  /* ---------------------------------------------------------------- colour */

  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const s = max === 0 ? 0 : (max - min) / max;
    let h = 0;
    const d = max - min;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s, v };
  }

  function toHex(r, g, b) {
    const c = (n) => Math.round(n).toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  /* Colourfulness as a share of pixels, mirrored exactly by
     scripts/photos.py::summarise so a preview sorts where the photo will. */
  const CHROMA_SAT = 0.18;
  const CHROMA_VAL = 0.15;
  const NEUTRAL_SHARE = 0.12;

  function summarise(data, width, height) {
    let colourful = 0;
    let seen = 0;
    let lumaTotal = 0;
    let x = 0;
    let y = 0;
    let rw = 0;
    let gw = 0;
    let bw = 0;
    let wsum = 0;
    const tones = { dark: 0, mid: 0, light: 0 };

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue; // skip near-transparent pixels
      seen++;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const { h, s, v } = rgbToHsv(r, g, b);
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      lumaTotal += luma;
      tones[luma > 0.72 ? "light" : luma < 0.24 ? "dark" : "mid"]++;

      if (s <= CHROMA_SAT || v <= CHROMA_VAL) continue;
      colourful++;
      const w = s * v;
      const rad = (h * Math.PI) / 180;
      x += Math.cos(rad) * w;
      y += Math.sin(rad) * w;
      rw += r * w;
      gw += g * w;
      bw += b * w;
      wsum += w;
    }

    if (!seen) return { neutral: true, tone: "mid", value: 0.5, hue: null, hex: null };

    if (colourful / seen < NEUTRAL_SHARE) {
      const tone = ["dark", "mid", "light"].reduce((a, b) => (tones[b] > tones[a] ? b : a));
      return { neutral: true, tone, value: lumaTotal / seen, hue: null, hex: null };
    }

    const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    return { neutral: false, tone: null, value: null, hue, hex: toHex(rw / wsum, gw / wsum, bw / wsum) };
  }

  /* ------------------------------------------------------------- ordering */

  function sortKey(p) {
    // Chromatic frames run 0 -> 360; neutrals sit at the end, black to white.
    if (p.neutral) return 400 + (p.value ?? 0.5) * 40;
    return p.hue ?? 0;
  }

  function all() {
    return state.photos.concat(state.previews).sort((a, b) => sortKey(a) - sortKey(b));
  }

  function matches(p, selection) {
    if (selection === "all") return true;
    if (selection.startsWith("n:")) return !!p.neutral && p.tone === selection.slice(2);
    if (p.neutral) return false;
    const center = Number(selection);
    let d = Math.abs(p.hue - center);
    if (d > 180) d = 360 - d;
    return d <= 15;
  }

  function selectionLabel(selection) {
    if (selection === "all") return "All photographs";
    if (selection.startsWith("n:")) {
      const n = NEUTRALS.find((x) => x.tone === selection.slice(2));
      return n ? n.name : "Neutral";
    }
    const b = BUCKETS.find((x) => x.at === Number(selection));
    return b ? b.name : "Colour";
  }

  function bucketName(hue) {
    let best = BUCKETS[0];
    let bestD = 360;
    for (const b of BUCKETS) {
      let d = Math.abs((hue ?? 0) - b.at);
      if (d > 180) d = 360 - d;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best.name;
  }

  /* ---------------------------------------------------------------- layout */

  function buildFigure(p) {
    const fig = document.createElement("figure");
    fig.className = "shot";
    fig.dataset.id = p.id;
    fig.tabIndex = 0;
    fig.setAttribute("role", "button");
    fig.setAttribute(
      "aria-label",
      p.neutral ? "Open photograph, neutral tones" : `Open photograph, ${bucketName(p.hue)}`
    );

    const img = document.createElement("img");
    img.src = BASE + p.thumb;
    img.width = p.w;
    img.height = p.h;
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = p.alt || "";
    img.style.aspectRatio = `${p.w} / ${p.h}`;
    img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
    if (img.complete) img.classList.add("is-loaded");
    fig.append(img);

    const cap = document.createElement("figcaption");
    const left = document.createElement("span");
    left.textContent = p.neutral ? "neutral" : `${Math.round(p.hue)}°`;
    const right = document.createElement("span");
    right.textContent = p.hex || "";
    cap.append(left, right);
    fig.append(cap);

    if (p.preview) {
      const flag = document.createElement("span");
      flag.className = "shot__flag";
      flag.textContent = "preview";
      fig.append(flag);
    }

    fig.addEventListener("click", () => openLightbox(p.id));
    fig.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(p.id);
      }
    });

    return fig;
  }

  function nodeFor(p) {
    if (!state.nodes.has(p.id)) state.nodes.set(p.id, buildFigure(p));
    return state.nodes.get(p.id);
  }

  function layout() {
    const list = all();
    wall.innerHTML = "";
    const width = wall.clientWidth || 1100;
    const cols = Math.max(2, Math.min(5, Math.floor(width / 300)));
    const columns = [];
    const heights = [];
    for (let i = 0; i < cols; i++) {
      const col = document.createElement("div");
      col.className = "wall__col";
      wall.append(col);
      columns.push(col);
      heights.push(0);
    }

    for (const p of list) {
      // Shortest-column placement keeps reading order left-to-right, which is
      // what makes the wall read as a spectrum rather than a stack.
      let target = 0;
      for (let i = 1; i < cols; i++) if (heights[i] < heights[target]) target = i;
      columns[target].append(nodeFor(p));
      heights[target] += (p.h / p.w) * 0.92 + 0.08 + 10 / 270;
    }

    applySelection();
    countEl.textContent = `${list.length} photograph${list.length === 1 ? "" : "s"}`;
  }

  /* ------------------------------------------------------------- selection */

  function applySelection() {
    const list = all();
    let shown = 0;
    for (const p of list) {
      const node = state.nodes.get(p.id);
      if (!node) continue;
      const hit = matches(p, state.selection);
      node.classList.toggle("is-dim", !hit);
      node.setAttribute("aria-hidden", hit ? "false" : "true");
      if (hit) shown++;
    }
    status.textContent =
      state.selection === "all"
        ? "All photographs"
        : `${selectionLabel(state.selection)} — ${shown} of ${list.length}`;

    for (const btn of colourbar.querySelectorAll("[data-sel]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.sel === state.selection));
    }
  }

  function select(sel) {
    state.selection = sel;
    applySelection();
  }

  /* -------------------------------------------------------------- controls */

  function buildControls() {
    swatchHost.innerHTML = "";
    for (const b of BUCKETS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch";
      btn.dataset.sel = String(b.at);
      btn.style.background = `hsl(${b.at} 58% 46%)`;
      btn.setAttribute("aria-label", b.name);
      btn.title = b.name;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => select(String(b.at)));
      swatchHost.append(btn);
    }
    for (const n of NEUTRALS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch swatch--neutral";
      btn.dataset.sel = `n:${n.tone}`;
      btn.style.background = n.css;
      btn.setAttribute("aria-label", n.name);
      btn.title = n.name;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => select(`n:${n.tone}`));
      swatchHost.append(btn);
    }
    $("all-chip").addEventListener("click", () => select("all"));
  }

  /* -------------------------------------------------------------- lightbox */

  const lightbox = $("lightbox");
  const lbImg = $("lb-img");
  const lbIndex = $("lb-index");
  const lbMeta = $("lb-meta");
  let lbList = [];
  let lbPos = 0;

  function showLightboxAt(pos) {
    if (!lbList.length) return;
    lbPos = (pos + lbList.length) % lbList.length;
    const p = lbList[lbPos];
    lbImg.src = BASE + p.file;
    lbImg.alt = p.alt || "Photograph";
    lbIndex.textContent = `${lbPos + 1} / ${lbList.length}`;
    lbMeta.textContent = p.neutral
      ? `${p.tone || "neutral"} · neutral`
      : `${Math.round(p.hue)}° hue · ${p.hex}`;
  }

  function openLightbox(id) {
    const list = all();
    const filtered = list.filter((p) => matches(p, state.selection));
    lbList = filtered.length ? filtered : list;
    const pos = lbList.findIndex((p) => p.id === id);
    showLightboxAt(pos < 0 ? 0 : pos);
    if (typeof lightbox.showModal === "function") lightbox.showModal();
    else lightbox.setAttribute("open", "");
  }

  $("lb-close").addEventListener("click", () => lightbox.close());
  lightbox.addEventListener("click", (e) => {
    // Anything that is not the photograph's own chrome is "outside" the picture.
    if (e.target.closest(".lightbox__bar") || e.target.closest(".lightbox__foot")) return;
    lightbox.close();
  });
  document.addEventListener("keydown", (e) => {
    if (!lightbox.open) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      showLightboxAt(lbPos + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      showLightboxAt(lbPos - 1);
    }
  });

  /* -------------------------------------------------------- drop previews */

  let previewSeq = 0;

  async function analyseFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const S = 48;
      const canvas = document.createElement("canvas");
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, S, S);
      const { data } = ctx.getImageData(0, 0, S, S);
      const colour = summarise(data, S, S);
      return {
        id: `preview-${previewSeq++}`,
        file: url,
        thumb: url,
        w: img.naturalWidth || 1,
        h: img.naturalHeight || 1,
        preview: true,
        alt: file.name,
        ...colour,
      };
    } catch (err) {
      console.warn("could not read", file.name, err);
      return null;
    }
  }

  async function addFiles(files) {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const results = await Promise.all(images.map(analyseFile));
    state.previews.push(...results.filter(Boolean));
    layout();
    refreshPreviewUI();
  }

  function refreshPreviewUI() {
    const old = dropzone.querySelector(".clear-preview");
    if (old) old.remove();
    if (!state.previews.length) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip clear-preview";
    btn.textContent = `Clear ${state.previews.length} preview${state.previews.length === 1 ? "" : "s"}`;
    btn.addEventListener("click", () => {
      for (const p of state.previews) URL.revokeObjectURL(p.file);
      state.previews = [];
      for (const p of Array.from(state.nodes.keys())) {
        if (String(p).startsWith("preview-")) state.nodes.delete(p);
      }
      layout();
      refreshPreviewUI();
    });
    dropzone.append(btn);
  }

  ["dragenter", "dragover"].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      dropzone.classList.add("is-over");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      if (ev === "drop" && e.dataTransfer && e.dataTransfer.files.length) {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      }
      dropzone.classList.remove("is-over");
    })
  );
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length) addFiles(fileInput.files);
    fileInput.value = "";
  });

  /* ----------------------------------------------------------------- boot */

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 180);
  });

  // A device-metrics change or a font swap can resize the wall without firing a
  // window resize, so watch the element itself.
  if ("ResizeObserver" in window) {
    let lastWidth = 0;
    new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (Math.abs(w - lastWidth) < 40) return;
      lastWidth = w;
      if (state.photos.length) layout();
    }).observe(wall);
  }

  buildControls();

  fetch(`${BASE}photos.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`photos.json (${r.status})`))))
    .then((photos) => {
      state.photos = Array.isArray(photos) ? photos : photos.photos || [];
      for (const p of state.photos) p.id = p.id || p.file;
      if (!state.photos.length) {
        emptyEl.hidden = false;
        countEl.textContent = "0 photographs";
        return;
      }
      colourbar.hidden = false;
      layout();
    })
    .catch((err) => {
      console.warn("gallery:", err.message);
      emptyEl.hidden = false;
      countEl.textContent = "0 photographs";
    });
})();

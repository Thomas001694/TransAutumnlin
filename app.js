// app.js
// TransAutumnlin-Demo 54-web 瀏覽器版本。純 JavaScript，不需要後端伺服器。

import { ROUTE_DATA, TRANSFERABLE } from "./route-data.js";

/** 最小堆積，用於 Dijkstra 搜尋。 */
class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  push(value) {
    this.items.push(value);
    this.#bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return null;
    const root = this.items[0];
    const tail = this.items.pop();
    if (this.items.length > 0 && tail !== undefined) {
      this.items[0] = tail;
      this.#bubbleDown(0);
    }
    return root;
  }

  #bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[index], this.items[parent]) >= 0) break;
      [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
      index = parent;
    }
  }

  #bubbleDown(index) {
    const length = this.items.length;
    while (true) {
      let smallest = index;
      const left = index * 2 + 1;
      const right = left + 1;

      if (left < length && this.compare(this.items[left], this.items[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.items[right], this.items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
  }
}

/** 以不受站名順序影響的方式建立區間索引鍵。 */
function edgeKey(stationA, stationB) {
  return [stationA, stationB].sort((a, b) => a.localeCompare(b, "zh-Hant")).join("\u0000");
}

/** 建立雙向鄰接圖。 */
function buildGraph(routeData) {
  const graph = new Map();

  const addEdge = (from, to, line) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push({ station: to, line });
  };

  for (const route of routeData) {
    for (let index = 0; index < route.stations.length - 1; index += 1) {
      const stationA = route.stations[index];
      const stationB = route.stations[index + 1];
      if (stationA === stationB) continue;
      addEdge(stationA, stationB, route.line);
      addEdge(stationB, stationA, route.line);
    }
  }

  return graph;
}

/** 記錄每一段相鄰站區間可由哪些路線行駛。 */
function buildEdgeLines(routeData) {
  const edgeLines = new Map();

  for (const route of routeData) {
    for (let index = 0; index < route.stations.length - 1; index += 1) {
      const stationA = route.stations[index];
      const stationB = route.stations[index + 1];
      if (stationA === stationB) continue;
      const key = edgeKey(stationA, stationB);
      if (!edgeLines.has(key)) edgeLines.set(key, new Set());
      edgeLines.get(key).add(route.line);
    }
  }

  return edgeLines;
}

const GRAPH = buildGraph(ROUTE_DATA);
const EDGE_LINES = buildEdgeLines(ROUTE_DATA);
const ALL_STATIONS = new Set(GRAPH.keys());
const LINE_ORDER = new Map(ROUTE_DATA.map((route, index) => [route.line, index]));

/** 依路線資料首次出現順序建立站名清單。 */
export function getStationOrder() {
  const stations = [];
  const seen = new Set();

  for (const route of ROUTE_DATA) {
    for (const station of route.stations) {
      if (!seen.has(station)) {
        seen.add(station);
        stations.push(station);
      }
    }
  }

  return stations;
}

/** 依使用者模式建立 Dijkstra 優先序。 */
function makePriority(mode, transfers, stops) {
  return mode === "2" ? [stops, transfers] : [transfers, stops];
}

function comparePair(left, right) {
  if (left[0] !== right[0]) return left[0] - right[0];
  return left[1] - right[1];
}

function compareQueueItem(left, right) {
  const priorityResult = comparePair(left.priority, right.priority);
  if (priorityResult !== 0) return priorityResult;
  return left.sequence - right.sequence;
}

/**
 * 搜尋單一最佳路徑。
 * 狀態同時保存目前站、目前路線及是否已通過經由站。
 */
export function findBestPath(start, goal, mode, via = null) {
  if (!ALL_STATIONS.has(start) || !ALL_STATIONS.has(goal)) return null;
  if (via !== null && !ALL_STATIONS.has(via)) return null;

  if (start === goal && (via === null || via === start)) {
    return [{ station: start, line: null }];
  }

  const passedViaAtStart = via === null || start === via;
  let sequence = 0;
  const queue = new MinHeap(compareQueueItem);
  queue.push({
    priority: makePriority(mode, 0, 0),
    sequence: sequence++,
    transfers: 0,
    stops: 0,
    station: start,
    currentLine: null,
    passedVia: passedViaAtStart,
    path: [{ station: start, line: null }],
  });

  const bestCost = new Map();

  while (queue.size > 0) {
    const current = queue.pop();
    const stateKey = `${current.station}\u0000${current.currentLine ?? ""}\u0000${current.passedVia ? "1" : "0"}`;
    const actualCost = [current.transfers, current.stops];
    const oldCost = bestCost.get(stateKey);

    if (oldCost !== undefined) {
      const oldPriority = makePriority(mode, oldCost[0], oldCost[1]);
      const currentPriority = makePriority(mode, current.transfers, current.stops);
      if (comparePair(oldPriority, currentPriority) <= 0) continue;
    }

    bestCost.set(stateKey, actualCost);

    if (current.station === goal && current.passedVia) {
      return current.path;
    }

    const neighbors = GRAPH.get(current.station) ?? [];
    for (const neighbor of neighbors) {
      const switching = current.currentLine !== null && neighbor.line !== current.currentLine;
      if (switching && !TRANSFERABLE.has(current.station)) continue;

      const nextPassedVia = current.passedVia || (via !== null && neighbor.station === via);
      const nextTransfers = current.transfers + (switching ? 1 : 0);
      const nextStops = current.stops + 1;
      const nextPriority = makePriority(mode, nextTransfers, nextStops);
      const nextStateKey = `${neighbor.station}\u0000${neighbor.line}\u0000${nextPassedVia ? "1" : "0"}`;
      const knownCost = bestCost.get(nextStateKey);

      if (knownCost !== undefined) {
        const knownPriority = makePriority(mode, knownCost[0], knownCost[1]);
        if (comparePair(knownPriority, nextPriority) <= 0) continue;
      }

      queue.push({
        priority: nextPriority,
        sequence: sequence++,
        transfers: nextTransfers,
        stops: nextStops,
        station: neighbor.station,
        currentLine: neighbor.line,
        passedVia: nextPassedVia,
        path: [...current.path, { station: neighbor.station, line: neighbor.line }],
      });
    }
  }

  return null;
}

/** 找出整個連續區間都能行駛的重疊路線。 */
function getOverlappingLineName(stations, selectedLine) {
  if (stations.length < 2) return selectedLine;

  let commonLines = null;

  for (let index = 0; index < stations.length - 1; index += 1) {
    const lines = EDGE_LINES.get(edgeKey(stations[index], stations[index + 1])) ?? new Set();
    commonLines = commonLines === null
      ? new Set(lines)
      : new Set([...commonLines].filter((line) => lines.has(line)));

    if (commonLines.size === 0) return selectedLine;
  }

  if (!commonLines.has(selectedLine)) return selectedLine;

  return [...commonLines]
    .sort((left, right) => (LINE_ORDER.get(left) ?? 9999) - (LINE_ORDER.get(right) ?? 9999))
    .join(" 或 ");
}

/** 依搭乘路線切分路徑。 */
function splitIntoSegments(path) {
  if (path.length < 2) return [];

  const segments = [];
  let currentLine = path[1].line;
  let currentStations = [path[0].station, path[1].station];

  for (let index = 2; index < path.length; index += 1) {
    const node = path[index];
    if (node.line === currentLine) {
      currentStations.push(node.station);
      continue;
    }

    segments.push({ line: currentLine, stations: [...currentStations] });
    currentLine = node.line;
    currentStations = [path[index - 1].station, node.station];
  }

  segments.push({ line: currentLine, stations: [...currentStations] });
  return segments;
}

/** 將原始路徑轉成畫面需要的摘要。 */
export function summarizePath(path) {
  const rawStations = path.map((node) => node.station);
  const segments = splitIntoSegments(path);
  const transferIndices = [];

  for (let index = 2; index < path.length; index += 1) {
    const previousLine = path[index - 1].line;
    const incomingLine = path[index].line;
    if (previousLine !== null && incomingLine !== previousLine) {
      transferIndices.push(index - 1);
    }
  }

  const routeNames = segments.length === 0
    ? ["無需搭乘"]
    : segments.map((segment) => (
      segment.line === null
        ? "未知路線"
        : getOverlappingLineName(segment.stations, segment.line)
    ));

  const transferStations = transferIndices.map((index) => rawStations[index]);
  const displayStations = rawStations.map((station, index) => {
    if (rawStations.length === 1) return `【起終】${station}`;
    if (index === 0) return `【起】${station}`;
    if (index === rawStations.length - 1) return `【終】${station}`;
    if (transferIndices.includes(index)) return `【轉】${station}`;
    return station;
  });

  return {
    routeNames,
    routeText: routeNames.join(" → "),
    transfers: transferIndices.length,
    stops: rawStations.length - 1,
    transferStations,
    displayStations,
    rawStations,
  };
}

function initializeUi() {
  const elements = {
    form: document.querySelector("#route-form"),
    start: document.querySelector("#start-station"),
    goal: document.querySelector("#goal-station"),
    via: document.querySelector("#via-station"),
    mode: document.querySelector("#search-mode"),
    swap: document.querySelector("#swap-button"),
    clear: document.querySelector("#clear-button"),
    status: document.querySelector("#status"),
    result: document.querySelector("#result"),
    resultTitle: document.querySelector("#result-title"),
    routeNames: document.querySelector("#route-names"),
    transfers: document.querySelector("#transfer-count"),
    stops: document.querySelector("#stop-count"),
    transferRow: document.querySelector("#transfer-row"),
    transferStations: document.querySelector("#transfer-stations"),
    stationPath: document.querySelector("#station-path"),
    installButton: document.querySelector("#install-button"),
  };

  const stationOrder = getStationOrder();
  const comboboxes = [];

  /** 將全形空白轉為一般空白，並移除首尾空白。 */
  function normalizeStationName(value) {
    return value.replace(/\u3000/g, " ").trim();
  }

  /**
   * 自製可輸入下拉選單。
   * - 點箭頭：顯示完整站名清單。
   * - 直接打字：依站名即時篩選。
   * - 鍵盤：支援上下鍵、Enter、Escape。
   */
  class StationCombobox {
    constructor(root) {
      this.root = root;
      this.input = root.querySelector('input[role="combobox"]');
      this.toggle = root.querySelector(".combobox-toggle");
      this.list = root.querySelector('[role="listbox"]');
      this.allowEmpty = root.dataset.allowEmpty === "true";
      this.filteredStations = [];
      this.activeIndex = -1;

      this.input.addEventListener("input", () => {
        this.open(this.input.value);
      });

      this.input.addEventListener("click", () => {
        if (!this.isOpen()) this.open(this.input.value);
      });

      this.input.addEventListener("keydown", (event) => {
        this.handleKeydown(event);
      });

      this.toggle.addEventListener("click", () => {
        if (this.isOpen()) {
          this.close();
        } else {
          this.open("");
          this.input.focus();
        }
      });

      this.list.addEventListener("pointerdown", (event) => {
        // 避免點選選項時輸入框先失焦，造成清單提早關閉。
        event.preventDefault();
      });

      this.list.addEventListener("click", (event) => {
        const option = event.target.closest(".combobox-option");
        if (!option) return;
        this.selectValue(option.dataset.value ?? "");
      });
    }

    isOpen() {
      return !this.list.hidden;
    }

    open(query = "") {
      closeOtherComboboxes(this);
      this.render(query);
      this.list.hidden = false;
      this.root.dataset.open = "true";
      this.input.setAttribute("aria-expanded", "true");
    }

    close() {
      this.list.hidden = true;
      this.root.dataset.open = "false";
      this.input.setAttribute("aria-expanded", "false");
      this.input.removeAttribute("aria-activedescendant");
      this.activeIndex = -1;
    }

    render(query) {
      const normalizedQuery = normalizeStationName(query).toLocaleLowerCase("zh-Hant-TW");
      this.filteredStations = stationOrder.filter((station) => (
        normalizedQuery === "" || station.toLocaleLowerCase("zh-Hant-TW").includes(normalizedQuery)
      ));

      this.list.replaceChildren();
      const fragment = document.createDocumentFragment();

      if (this.allowEmpty && normalizedQuery === "") {
        fragment.append(this.createOption("", "不指定經由站"));
      }

      for (const station of this.filteredStations) {
        fragment.append(this.createOption(station, station));
      }

      if (fragment.childNodes.length === 0) {
        const empty = document.createElement("li");
        empty.className = "combobox-empty";
        empty.textContent = "找不到符合的車站";
        fragment.append(empty);
      }

      this.list.append(fragment);
      this.activeIndex = -1;
    }

    createOption(value, label) {
      const option = document.createElement("li");
      option.id = `${this.list.id}-option-${value || "empty"}`;
      option.className = "combobox-option";
      option.dataset.value = value;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(this.input.value === value));
      option.textContent = label;
      return option;
    }

    getOptions() {
      return [...this.list.querySelectorAll(".combobox-option")];
    }

    setActiveIndex(index) {
      const options = this.getOptions();
      if (options.length === 0) return;

      this.activeIndex = Math.max(0, Math.min(index, options.length - 1));
      options.forEach((option, optionIndex) => {
        option.dataset.active = String(optionIndex === this.activeIndex);
      });

      const activeOption = options[this.activeIndex];
      this.input.setAttribute("aria-activedescendant", activeOption.id);
      activeOption.scrollIntoView({ block: "nearest" });
    }

    selectValue(value) {
      this.input.value = value;
      this.input.dispatchEvent(new Event("input", { bubbles: true }));
      this.close();
      this.input.focus();
    }

    handleKeydown(event) {
      const options = this.getOptions();

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!this.isOpen()) this.open(this.input.value);
        this.setActiveIndex(this.activeIndex + 1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!this.isOpen()) this.open(this.input.value);
        const nextIndex = this.activeIndex < 0 ? this.getOptions().length - 1 : this.activeIndex - 1;
        this.setActiveIndex(nextIndex);
        return;
      }

      if (event.key === "Enter" && this.isOpen() && this.activeIndex >= 0) {
        event.preventDefault();
        const activeOption = this.getOptions()[this.activeIndex];
        if (activeOption) this.selectValue(activeOption.dataset.value ?? "");
        return;
      }

      if (event.key === "Escape" && this.isOpen()) {
        event.preventDefault();
        this.close();
        return;
      }

      if (event.key === "Tab") {
        this.close();
      }
    }
  }

  function closeOtherComboboxes(current = null) {
    for (const combobox of comboboxes) {
      if (combobox !== current) combobox.close();
    }
  }

  for (const root of document.querySelectorAll("[data-station-combobox]")) {
    comboboxes.push(new StationCombobox(root));
  }

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("[data-station-combobox]")) {
      closeOtherComboboxes();
    }
  });

  function setStatus(message, type = "neutral") {
    elements.status.textContent = message;
    elements.status.dataset.type = type;
  }

  function hideResult() {
    elements.result.hidden = true;
  }

  function renderResult(start, goal, via, summary) {
    elements.resultTitle.textContent = via
      ? `${start} → ${goal}（經由 ${via}）`
      : `${start} → ${goal}`;
    elements.routeNames.textContent = summary.routeText;
    elements.transfers.textContent = String(summary.transfers);
    elements.stops.textContent = String(summary.stops);

    if (summary.transferStations.length > 0) {
      elements.transferRow.hidden = false;
      elements.transferStations.textContent = summary.transferStations.join("、");
    } else {
      elements.transferRow.hidden = true;
      elements.transferStations.textContent = "";
    }

    elements.stationPath.replaceChildren();
    summary.displayStations.forEach((station, index) => {
      const item = document.createElement("li");
      item.textContent = station;

      if (station.startsWith("【起】") || station.startsWith("【起終】")) {
        item.dataset.role = "start";
      }
      if (station.startsWith("【轉】")) {
        item.dataset.role = "transfer";
      }
      if (station.startsWith("【終】") || station.startsWith("【起終】")) {
        item.dataset.role = "goal";
      }

      elements.stationPath.append(item);

      if (index < summary.displayStations.length - 1) {
        const arrow = document.createElement("li");
        arrow.className = "path-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        elements.stationPath.append(arrow);
      }
    });

    elements.result.hidden = false;
  }

  function validateSelection(start, goal, via) {
    if (!start) return "請輸入起點站。";
    if (!goal) return "請輸入終點站。";
    if (!ALL_STATIONS.has(start)) return `查無此站：${start}`;
    if (!ALL_STATIONS.has(goal)) return `查無此站：${goal}`;
    if (via && !ALL_STATIONS.has(via)) return `查無此站：${via}`;
    return null;
  }

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    closeOtherComboboxes();

    const start = normalizeStationName(elements.start.value);
    const goal = normalizeStationName(elements.goal.value);
    const viaText = normalizeStationName(elements.via.value);
    const via = viaText || null;
    const mode = elements.mode.value;

    elements.start.value = start;
    elements.goal.value = goal;
    elements.via.value = viaText;

    const validationError = validateSelection(start, goal, via);
    if (validationError) {
      hideResult();
      setStatus(validationError, "error");
      return;
    }

    const path = findBestPath(start, goal, mode, via);
    if (path === null) {
      hideResult();
      setStatus(`無法從 ${start} 前往 ${goal}${via ? `，並經由 ${via}` : ""}。`, "error");
      return;
    }

    const summary = summarizePath(path);
    renderResult(start, goal, via, summary);
    setStatus("查詢完成。", "success");
  });

  elements.swap.addEventListener("click", () => {
    const start = elements.start.value;
    elements.start.value = elements.goal.value;
    elements.goal.value = start;
    closeOtherComboboxes();
    hideResult();
    setStatus("已交換起點與終點，請重新查詢。", "neutral");
  });

  elements.clear.addEventListener("click", () => {
    elements.form.reset();
    closeOtherComboboxes();
    hideResult();
    setStatus("請輸入起點與終點。", "neutral");
    elements.start.focus();
  });

  for (const input of [elements.start, elements.goal, elements.via, elements.mode]) {
    input.addEventListener("input", () => {
      hideResult();
      setStatus("條件已變更，請重新查詢。", "neutral");
    });
  }

  let deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (deferredInstallPrompt === null) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
    setStatus("已安裝到裝置。", "success");
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js?v=54-combobox-1").catch(() => {
        // 離線快取失敗不影響路線查詢，因此不打斷使用者操作。
      });
    });
  }

  hideResult();
  setStatus("請輸入起點與終點。", "neutral");
}

if (typeof document !== "undefined") {
  initializeUi();
}

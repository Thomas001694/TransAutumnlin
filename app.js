// app.js
// TransAutumnlin-Demo 57-web
// 純 JavaScript，不需要後端伺服器。

import { ROUTE_DATA, TRANSFERABLE } from "./route-data.js";

/*
 * 奧鐵固定路線色。
 * 屏城線快速與普通共用橘色；同系本線／支線共用相同色。
 */
const LINE_COLORS = Object.freeze({
  "林嶺本線": "#E3C800",
  "坦城支線": "#E3C800",
  "騰北本線": "#E51400",
  "山里支線": "#E51400",
  "墘海線": "#4D9900",
  "垣海線": "#1BA1E2",
  "格肯海山手線": "#66CC00",
  "屏城線快速": "#FA6800",
  "屏城線普通": "#FA6800",
  "特急白鹿號": "#FFFFFF",
});

const DEFAULT_LINE_COLOR = "#8CA0B0";

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

      if (this.compare(this.items[index], this.items[parent]) >= 0) {
        break;
      }

      [this.items[index], this.items[parent]] = [
        this.items[parent],
        this.items[index],
      ];

      index = parent;
    }
  }

  #bubbleDown(index) {
    const length = this.items.length;

    while (true) {
      let smallest = index;

      const left = index * 2 + 1;
      const right = left + 1;

      if (
        left < length
        && this.compare(this.items[left], this.items[smallest]) < 0
      ) {
        smallest = left;
      }

      if (
        right < length
        && this.compare(this.items[right], this.items[smallest]) < 0
      ) {
        smallest = right;
      }

      if (smallest === index) {
        break;
      }

      [this.items[index], this.items[smallest]] = [
        this.items[smallest],
        this.items[index],
      ];

      index = smallest;
    }
  }
}

/** 取得路線顏色。 */
function getLineColor(line) {
  return LINE_COLORS[line] ?? DEFAULT_LINE_COLOR;
}

/**
 * 判斷顏色是否偏亮。
 * 用於自動選擇彩色路線標籤的前景文字顏色。
 */
function isLightColor(hexColor) {
  const hex = hexColor.replace("#", "");

  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return false;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  const luminance = (
    red * 299
    + green * 587
    + blue * 114
  ) / 1000;

  return luminance >= 170;
}

/** 建立不受站名順序影響的區間索引鍵。 */
function edgeKey(stationA, stationB) {
  return [stationA, stationB]
    .sort((a, b) => a.localeCompare(b, "zh-Hant"))
    .join("\u0000");
}

/** 建立雙向鄰接圖。 */
function buildGraph(routeData) {
  const graph = new Map();

  const addEdge = (from, to, line) => {
    if (!graph.has(from)) {
      graph.set(from, []);
    }

    graph.get(from).push({
      station: to,
      line,
    });
  };

  for (const route of routeData) {
    for (
      let index = 0;
      index < route.stations.length - 1;
      index += 1
    ) {
      const stationA = route.stations[index];
      const stationB = route.stations[index + 1];

      if (stationA === stationB) {
        continue;
      }

      addEdge(stationA, stationB, route.line);
      addEdge(stationB, stationA, route.line);
    }
  }

  return graph;
}

/** 記錄每一段相鄰站區間可以由哪些路線行駛。 */
function buildEdgeLines(routeData) {
  const edgeLines = new Map();

  for (const route of routeData) {
    for (
      let index = 0;
      index < route.stations.length - 1;
      index += 1
    ) {
      const stationA = route.stations[index];
      const stationB = route.stations[index + 1];

      if (stationA === stationB) {
        continue;
      }

      const key = edgeKey(stationA, stationB);

      if (!edgeLines.has(key)) {
        edgeLines.set(key, new Set());
      }

      edgeLines.get(key).add(route.line);
    }
  }

  return edgeLines;
}

const GRAPH = buildGraph(ROUTE_DATA);

const EDGE_LINES = buildEdgeLines(ROUTE_DATA);

const ALL_STATIONS = new Set(GRAPH.keys());

const LINE_ORDER = new Map(
  ROUTE_DATA.map((route, index) => [
    route.line,
    index,
  ]),
);

/** 依路線資料第一次出現的順序建立站名清單。 */
export function getStationOrder() {
  const stations = [];
  const seen = new Set();

  for (const route of ROUTE_DATA) {
    for (const station of route.stations) {
      if (seen.has(station)) {
        continue;
      }

      seen.add(station);
      stations.push(station);
    }
  }

  return stations;
}

/** 依排列方式建立 Dijkstra 優先序。 */
function makePriority(mode, transfers, stops) {
  if (mode === "2") {
    // 最少站數，其次最少轉乘。
    return [
      stops,
      transfers,
    ];
  }

  // 最少轉乘，其次最少站數。
  return [
    transfers,
    stops,
  ];
}

function comparePair(left, right) {
  if (left[0] !== right[0]) {
    return left[0] - right[0];
  }

  return left[1] - right[1];
}

function compareQueueItem(left, right) {
  const priorityResult = comparePair(
    left.priority,
    right.priority,
  );

  if (priorityResult !== 0) {
    return priorityResult;
  }

  return left.sequence - right.sequence;
}

/**
 * 搜尋單一最佳路徑。
 *
 * 狀態包含：
 * - 目前站
 * - 目前所搭路線
 * - 是否已經通過經由站
 */
export function findBestPath(
  start,
  goal,
  mode,
  via = null,
) {
  if (
    !ALL_STATIONS.has(start)
    || !ALL_STATIONS.has(goal)
  ) {
    return null;
  }

  if (
    via !== null
    && !ALL_STATIONS.has(via)
  ) {
    return null;
  }

  if (
    start === goal
    && (
      via === null
      || via === start
    )
  ) {
    return [
      {
        station: start,
        line: null,
      },
    ];
  }

  const passedViaAtStart = (
    via === null
    || start === via
  );

  let sequence = 0;

  const queue = new MinHeap(compareQueueItem);

  queue.push({
    priority: makePriority(
      mode,
      0,
      0,
    ),

    sequence: sequence++,

    transfers: 0,
    stops: 0,

    station: start,
    currentLine: null,

    passedVia: passedViaAtStart,

    path: [
      {
        station: start,
        line: null,
      },
    ],
  });

  const bestCost = new Map();

  while (queue.size > 0) {
    const current = queue.pop();

    const stateKey = [
      current.station,
      current.currentLine ?? "",
      current.passedVia ? "1" : "0",
    ].join("\u0000");

    const actualCost = [
      current.transfers,
      current.stops,
    ];

    const oldCost = bestCost.get(stateKey);

    if (oldCost !== undefined) {
      const oldPriority = makePriority(
        mode,
        oldCost[0],
        oldCost[1],
      );

      const currentPriority = makePriority(
        mode,
        current.transfers,
        current.stops,
      );

      if (
        comparePair(
          oldPriority,
          currentPriority,
        ) <= 0
      ) {
        continue;
      }
    }

    bestCost.set(
      stateKey,
      actualCost,
    );

    if (
      current.station === goal
      && current.passedVia
    ) {
      return current.path;
    }

    const neighbors = (
      GRAPH.get(current.station)
      ?? []
    );

    for (const neighbor of neighbors) {
      const switching = (
        current.currentLine !== null
        && neighbor.line !== current.currentLine
      );

      /*
       * 只有程式定義為可轉乘的車站
       * 才允許從一條路線切換至另一條路線。
       */
      if (
        switching
        && !TRANSFERABLE.has(current.station)
      ) {
        continue;
      }

      const nextPassedVia = (
        current.passedVia
        || (
          via !== null
          && neighbor.station === via
        )
      );

      const nextTransfers = (
        current.transfers
        + (
          switching
            ? 1
            : 0
        )
      );

      const nextStops = (
        current.stops + 1
      );

      const nextPriority = makePriority(
        mode,
        nextTransfers,
        nextStops,
      );

      const nextStateKey = [
        neighbor.station,
        neighbor.line,
        nextPassedVia ? "1" : "0",
      ].join("\u0000");

      const knownCost = bestCost.get(
        nextStateKey,
      );

      if (knownCost !== undefined) {
        const knownPriority = makePriority(
          mode,
          knownCost[0],
          knownCost[1],
        );

        if (
          comparePair(
            knownPriority,
            nextPriority,
          ) <= 0
        ) {
          continue;
        }
      }

      queue.push({
        priority: nextPriority,
        sequence: sequence++,

        transfers: nextTransfers,
        stops: nextStops,

        station: neighbor.station,
        currentLine: neighbor.line,

        passedVia: nextPassedVia,

        path: [
          ...current.path,

          {
            station: neighbor.station,
            line: neighbor.line,
          },
        ],
      });
    }
  }

  return null;
}

/**
 * 找出整個連續區間都可以行駛的重疊路線。
 *
 * 例如同一區間同時屬於：
 * - 某本線
 * - 某特急
 *
 * 就允許顯示成：
 * A線 或 B線
 */
function getOverlappingLineName(
  stations,
  selectedLine,
) {
  if (stations.length < 2) {
    return selectedLine;
  }

  let commonLines = null;

  for (
    let index = 0;
    index < stations.length - 1;
    index += 1
  ) {
    const lines = (
      EDGE_LINES.get(
        edgeKey(
          stations[index],
          stations[index + 1],
        ),
      )
      ?? new Set()
    );

    commonLines = (
      commonLines === null
        ? new Set(lines)
        : new Set(
            [...commonLines].filter(
              (line) => lines.has(line),
            ),
          )
    );

    if (commonLines.size === 0) {
      return selectedLine;
    }
  }

  if (!commonLines.has(selectedLine)) {
    return selectedLine;
  }

  return [...commonLines]
    .sort(
      (left, right) => (
        (LINE_ORDER.get(left) ?? 9999)
        - (LINE_ORDER.get(right) ?? 9999)
      ),
    )
    .join(" 或 ");
}

/** 依實際搭乘路線切分路徑。 */
function splitIntoSegments(path) {
  if (path.length < 2) {
    return [];
  }

  const segments = [];

  let currentLine = path[1].line;

  let currentStations = [
    path[0].station,
    path[1].station,
  ];

  for (
    let index = 2;
    index < path.length;
    index += 1
  ) {
    const node = path[index];

    if (node.line === currentLine) {
      currentStations.push(
        node.station,
      );

      continue;
    }

    segments.push({
      line: currentLine,
      stations: [
        ...currentStations,
      ],
    });

    currentLine = node.line;

    /*
     * 新路線的第一站必須包含
     * 上一條路線的最後一站，
     * 因為這就是轉乘站。
     */
    currentStations = [
      path[index - 1].station,
      node.station,
    ];
  }

  segments.push({
    line: currentLine,
    stations: [
      ...currentStations,
    ],
  });

  return segments;
}

/** 將原始搜尋結果整理成 UI 所需摘要。 */
export function summarizePath(path) {
  const rawStations = path.map(
    (node) => node.station,
  );

  const rawSegments = splitIntoSegments(
    path,
  );

  const transferIndices = [];

  for (
    let index = 2;
    index < path.length;
    index += 1
  ) {
    const previousLine = (
      path[index - 1].line
    );

    const incomingLine = (
      path[index].line
    );

    if (
      previousLine !== null
      && incomingLine !== previousLine
    ) {
      transferIndices.push(
        index - 1,
      );
    }
  }

  const segments = rawSegments.map(
    (segment) => ({
      line: segment.line,

      displayLineName: (
        segment.line === null
          ? "未知路線"
          : getOverlappingLineName(
              segment.stations,
              segment.line,
            )
      ),

      color: getLineColor(
        segment.line,
      ),

      stations: [
        ...segment.stations,
      ],
    }),
  );

  const routeNames = (
    segments.length === 0
      ? ["無需搭乘"]
      : segments.map(
          (segment) => (
            segment.displayLineName
          ),
        )
  );

  const transferStations = (
    transferIndices.map(
      (index) => rawStations[index],
    )
  );

  return {
    routeNames,

    routeText: routeNames.join(
      " → ",
    ),

    transfers: (
      transferIndices.length
    ),

    stops: (
      rawStations.length - 1
    ),

    transferStations,

    rawStations,

    segments,
  };
}

/** 建立上方的彩色路線標籤。 */
function createRouteBadge(segment) {
  const badge = document.createElement(
    "span",
  );

  const lineColor = (
    segment.color
    ?? getLineColor(segment.line)
  );

  badge.className = "route-badge";

  badge.style.setProperty(
    "--line-color",
    lineColor,
  );

  badge.style.setProperty(
    "--line-text",
    isLightColor(lineColor)
      ? "#111111"
      : "#FFFFFF",
  );

  badge.textContent = (
    segment.displayLineName
  );

  return badge;
}

/**
 * 建立起點、轉乘站或終點。
 *
 * Demo 57 小修：
 * 不再顯示：
 * 【起】
 * 【轉】
 * 【終】
 *
 * 僅以字體大小、粗細與圓形節點顏色區分。
 */
function createKeyStation(
  station,
  role,
) {
  const row = document.createElement(
    "div",
  );

  row.className = "key-station";

  row.dataset.role = role;

  const marker = document.createElement(
    "span",
  );

  marker.className = "station-marker";

  marker.setAttribute(
    "aria-hidden",
    "true",
  );

  const name = document.createElement(
    "span",
  );

  name.className = "station-name";

  name.textContent = station;

  row.append(
    marker,
    name,
  );

  return row;
}

/**
 * 建立普通站的折疊區。
 *
 * 預設只顯示：
 * 途經 X 站
 *
 * 使用者展開之後才顯示實際普通站。
 */
function createIntermediateDetails(
  stations,
) {
  if (stations.length === 0) {
    return null;
  }

  const details = document.createElement(
    "details",
  );

  details.className = (
    "intermediate-details"
  );

  const summary = document.createElement(
    "summary",
  );

  summary.textContent = (
    `途經 ${stations.length} 站`
  );

  const list = document.createElement(
    "ul",
  );

  list.className = (
    "intermediate-list"
  );

  for (const station of stations) {
    const item = document.createElement(
      "li",
    );

    item.className = (
      "intermediate-station"
    );

    item.textContent = station;

    list.append(item);
  }

  details.append(
    summary,
    list,
  );

  return details;
}

/**
 * 繪製 Demo 57 垂直路線。
 *
 * 每個搭乘區間：
 * - 左側為直式路線名稱
 * - 中央為路線色實線
 * - 站點圓形 ICON 壓在線上
 * - 轉乘位置由兩段不同顏色實線銜接
 * - 顏色切換點由轉乘 ICON 蓋住
 */
function renderRouteTimeline(
  container,
  summary,
) {
  container.replaceChildren();

  /*
   * 起點與終點完全相同。
   */
  if (
    summary.rawStations.length === 1
  ) {
    const single = (
      document.createElement("div")
    );

    single.className = (
      "single-station-journey"
    );

    const name = (
      document.createElement("strong")
    );

    name.textContent = (
      summary.rawStations[0]
    );

    single.append(name);

    container.append(single);

    return;
  }

  summary.segments.forEach(
    (
      segment,
      segmentIndex,
    ) => {
      const section = (
        document.createElement(
          "section",
        )
      );

      const lineColor = (
        segment.color
        ?? getLineColor(segment.line)
      );

      section.className = (
        "journey-segment"
      );

      section.style.setProperty(
        "--line-color",
        lineColor,
      );

      section.dataset.line = (
        segment.line ?? ""
      );

      if (isLightColor(lineColor)) {
        section.dataset.lightLine = (
          "true"
        );
      }

      /*
       * 路線名稱：
       * CSS 會將文字直式排列在線條左側。
       */
      const lineName = (
        document.createElement("div")
      );

      lineName.className = (
        "segment-line-name"
      );

      lineName.textContent = (
        segment.displayLineName
      );

      /*
       * 每一段路線的實際內容。
       */
      const body = (
        document.createElement("div")
      );

      body.className = (
        "segment-body"
      );

      /*
       * 左側彩色實線。
       *
       * CSS 的 --rail-x
       * 會成為所有站點 ICON
       * 與實線共用的中心軸。
       */
      const rail = (
        document.createElement("div")
      );

      rail.className = (
        "segment-rail"
      );

      rail.setAttribute(
        "aria-hidden",
        "true",
      );

      /*
       * 第一段才繪製真正起點。
       *
       * 後續區段的第一站
       * 就是上一區段已顯示的轉乘站，
       * 所以不重複顯示。
       */
      if (segmentIndex === 0) {
        body.append(
          createKeyStation(
            segment.stations[0],
            "start",
          ),
        );
      }

      /*
       * 每一段首尾之間的普通站
       * 全部放進可折疊區。
       */
      const intermediateStations = (
        segment.stations.slice(
          1,
          -1,
        )
      );

      const details = (
        createIntermediateDetails(
          intermediateStations,
        )
      );

      if (details !== null) {
        body.append(details);
      }

      /*
       * 每段最後一站：
       *
       * 最後一段：
       * 終點
       *
       * 其他：
       * 轉乘站
       */
      const lastStation = (
        segment.stations[
          segment.stations.length - 1
        ]
      );

      const isFinalSegment = (
        segmentIndex
        === summary.segments.length - 1
      );

      body.append(
        createKeyStation(
          lastStation,
          isFinalSegment
            ? "goal"
            : "transfer",
        ),
      );

      /*
       * rail 必須放在內容最底層，
       * 車站 ICON 再透過 z-index 蓋在其上。
       */
      body.prepend(rail);

      section.append(
        lineName,
        body,
      );

      container.append(section);
    },
  );
}

/** 初始化畫面。 */
function initializeUi() {
  const elements = {
    form: document.querySelector(
      "#route-form",
    ),

    start: document.querySelector(
      "#start-station",
    ),

    goal: document.querySelector(
      "#goal-station",
    ),

    via: document.querySelector(
      "#via-station",
    ),

    mode: document.querySelector(
      "#search-mode",
    ),

    swap: document.querySelector(
      "#swap-button",
    ),

    clear: document.querySelector(
      "#clear-button",
    ),

    status: document.querySelector(
      "#status",
    ),

    result: document.querySelector(
      "#result",
    ),

    resultTitle: document.querySelector(
      "#result-title",
    ),

    routeNames: document.querySelector(
      "#route-names",
    ),

    transfers: document.querySelector(
      "#transfer-count",
    ),

    stops: document.querySelector(
      "#stop-count",
    ),

    transferRow: document.querySelector(
      "#transfer-row",
    ),

    transferStations: document.querySelector(
      "#transfer-stations",
    ),

    routeTimeline: document.querySelector(
      "#route-timeline",
    ),

    installButton: document.querySelector(
      "#install-button",
    ),
  };

  const stationOrder = (
    getStationOrder()
  );

  const comboboxes = [];

  /**
   * 將全形空白轉為一般空白，
   * 並移除字串首尾空白。
   */
  function normalizeStationName(value) {
    return value
      .replace(/\u3000/g, " ")
      .trim();
  }

  /**
   * 自製可輸入下拉式選單。
   *
   * 功能：
   * - 點箭頭顯示完整車站清單
   * - 可以直接打字
   * - 輸入時即時篩選
   * - 支援上下方向鍵
   * - Enter 選取
   * - Escape 關閉
   */
  class StationCombobox {
    constructor(root) {
      this.root = root;

      this.input = root.querySelector(
        'input[role="combobox"]',
      );

      this.toggle = root.querySelector(
        ".combobox-toggle",
      );

      this.list = root.querySelector(
        '[role="listbox"]',
      );

      this.allowEmpty = (
        root.dataset.allowEmpty === "true"
      );

      this.filteredStations = [];

      this.activeIndex = -1;

      this.input.addEventListener(
        "input",
        () => {
          this.open(
            this.input.value,
          );
        },
      );

      this.input.addEventListener(
        "click",
        () => {
          if (!this.isOpen()) {
            this.open(
              this.input.value,
            );
          }
        },
      );

      this.input.addEventListener(
        "keydown",
        (event) => {
          this.handleKeydown(
            event,
          );
        },
      );

      this.toggle.addEventListener(
        "click",
        () => {
          if (this.isOpen()) {
            this.close();
          } else {
            /*
             * 點箭頭時用空字串，
             * 顯示完整站名清單。
             */
            this.open("");

            this.input.focus();
          }
        },
      );

      this.list.addEventListener(
        "pointerdown",
        (event) => {
          /*
           * 避免點選選項時
           * input 先失焦而導致清單消失。
           */
          event.preventDefault();
        },
      );

      this.list.addEventListener(
        "click",
        (event) => {
          const option = (
            event.target.closest(
              ".combobox-option",
            )
          );

          if (!option) {
            return;
          }

          this.selectValue(
            option.dataset.value ?? "",
          );
        },
      );
    }

    isOpen() {
      return !this.list.hidden;
    }

    open(query = "") {
      closeOtherComboboxes(this);

      this.render(query);

      this.list.hidden = false;

      this.root.dataset.open = "true";

      this.input.setAttribute(
        "aria-expanded",
        "true",
      );
    }

    close() {
      this.list.hidden = true;

      this.root.dataset.open = "false";

      this.input.setAttribute(
        "aria-expanded",
        "false",
      );

      this.input.removeAttribute(
        "aria-activedescendant",
      );

      this.activeIndex = -1;
    }

    render(query) {
      const normalizedQuery = (
        normalizeStationName(query)
          .toLocaleLowerCase(
            "zh-Hant-TW",
          )
      );

      this.filteredStations = (
        stationOrder.filter(
          (station) => (
            normalizedQuery === ""
            || station
              .toLocaleLowerCase(
                "zh-Hant-TW",
              )
              .includes(
                normalizedQuery,
              )
          ),
        )
      );

      this.list.replaceChildren();

      const fragment = (
        document.createDocumentFragment()
      );

      /*
       * 經由站允許選擇空值。
       */
      if (
        this.allowEmpty
        && normalizedQuery === ""
      ) {
        fragment.append(
          this.createOption(
            "",
            "不指定經由站",
          ),
        );
      }

      for (
        const station
        of this.filteredStations
      ) {
        fragment.append(
          this.createOption(
            station,
            station,
          ),
        );
      }

      if (
        fragment.childNodes.length === 0
      ) {
        const empty = (
          document.createElement("li")
        );

        empty.className = (
          "combobox-empty"
        );

        empty.textContent = (
          "找不到符合的車站"
        );

        fragment.append(empty);
      }

      this.list.append(fragment);

      this.activeIndex = -1;
    }

    createOption(
      value,
      label,
    ) {
      const option = (
        document.createElement("li")
      );

      option.id = (
        `${this.list.id}-option-${value || "empty"}`
      );

      option.className = (
        "combobox-option"
      );

      option.dataset.value = value;

      option.setAttribute(
        "role",
        "option",
      );

      option.setAttribute(
        "aria-selected",
        String(
          this.input.value === value,
        ),
      );

      option.textContent = label;

      return option;
    }

    getOptions() {
      return [
        ...this.list.querySelectorAll(
          ".combobox-option",
        ),
      ];
    }

    setActiveIndex(index) {
      const options = (
        this.getOptions()
      );

      if (options.length === 0) {
        return;
      }

      this.activeIndex = Math.max(
        0,
        Math.min(
          index,
          options.length - 1,
        ),
      );

      options.forEach(
        (
          option,
          optionIndex,
        ) => {
          option.dataset.active = String(
            optionIndex
            === this.activeIndex,
          );
        },
      );

      const activeOption = (
        options[this.activeIndex]
      );

      this.input.setAttribute(
        "aria-activedescendant",
        activeOption.id,
      );

      activeOption.scrollIntoView({
        block: "nearest",
      });
    }

    selectValue(value) {
      this.input.value = value;

      this.input.dispatchEvent(
        new Event(
          "input",
          {
            bubbles: true,
          },
        ),
      );

      this.close();

      this.input.focus();
    }

    handleKeydown(event) {
      if (
        event.key === "ArrowDown"
      ) {
        event.preventDefault();

        if (!this.isOpen()) {
          this.open(
            this.input.value,
          );
        }

        this.setActiveIndex(
          this.activeIndex + 1,
        );

        return;
      }

      if (
        event.key === "ArrowUp"
      ) {
        event.preventDefault();

        if (!this.isOpen()) {
          this.open(
            this.input.value,
          );
        }

        const nextIndex = (
          this.activeIndex < 0
            ? this.getOptions().length - 1
            : this.activeIndex - 1
        );

        this.setActiveIndex(
          nextIndex,
        );

        return;
      }

      if (
        event.key === "Enter"
        && this.isOpen()
        && this.activeIndex >= 0
      ) {
        event.preventDefault();

        const activeOption = (
          this.getOptions()[
            this.activeIndex
          ]
        );

        if (activeOption) {
          this.selectValue(
            activeOption.dataset.value ?? "",
          );
        }

        return;
      }

      if (
        event.key === "Escape"
        && this.isOpen()
      ) {
        event.preventDefault();

        this.close();

        return;
      }

      if (
        event.key === "Tab"
      ) {
        this.close();
      }
    }
  }

  /** 關閉其他車站下拉選單。 */
  function closeOtherComboboxes(
    current = null,
  ) {
    for (
      const combobox
      of comboboxes
    ) {
      if (combobox !== current) {
        combobox.close();
      }
    }
  }

  /*
   * 建立三個：
   * 起點
   * 終點
   * 經由站
   *
   * 的自製下拉輸入框。
   */
  for (
    const root
    of document.querySelectorAll(
      "[data-station-combobox]",
    )
  ) {
    comboboxes.push(
      new StationCombobox(root),
    );
  }

  /*
   * 點擊頁面其他地方時
   * 自動關閉所有下拉清單。
   */
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !event.target.closest(
          "[data-station-combobox]",
        )
      ) {
        closeOtherComboboxes();
      }
    },
  );

  /** 更新狀態文字。 */
  function setStatus(
    message,
    type = "neutral",
  ) {
    elements.status.textContent = (
      message
    );

    elements.status.dataset.type = (
      type
    );
  }

  /** 隱藏舊查詢結果。 */
  function hideResult() {
    elements.result.hidden = true;
  }

  /** 繪製上方經過路線的彩色標籤。 */
  function renderRouteBadges(summary) {
    elements.routeNames.replaceChildren();

    if (
      summary.segments.length === 0
    ) {
      elements.routeNames.textContent = (
        "無需搭乘"
      );

      return;
    }

    summary.segments.forEach(
      (
        segment,
        index,
      ) => {
        elements.routeNames.append(
          createRouteBadge(segment),
        );

        if (
          index
          < summary.segments.length - 1
        ) {
          const arrow = (
            document.createElement(
              "span",
            )
          );

          arrow.className = (
            "route-arrow"
          );

          arrow.textContent = "→";

          arrow.setAttribute(
            "aria-hidden",
            "true",
          );

          elements.routeNames.append(
            arrow,
          );
        }
      },
    );
  }

  /** 繪製轉乘站標籤。 */
  function renderTransferStations(
    stations,
  ) {
    elements.transferStations
      .replaceChildren();

    for (const station of stations) {
      const chip = (
        document.createElement("span")
      );

      chip.className = (
        "transfer-chip"
      );

      chip.textContent = station;

      elements.transferStations.append(
        chip,
      );
    }
  }

  /** 繪製完整結果。 */
  function renderResult(
    start,
    goal,
    via,
    summary,
  ) {
    elements.resultTitle.textContent = (
      via
        ? `${start} → ${goal}（經由 ${via}）`
        : `${start} → ${goal}`
    );

    renderRouteBadges(summary);

    elements.transfers.textContent = (
      String(summary.transfers)
    );

    elements.stops.textContent = (
      String(summary.stops)
    );

    /*
     * 有轉乘站才顯示轉乘站卡片。
     */
    if (
      summary.transferStations.length > 0
    ) {
      elements.transferRow.hidden = false;

      renderTransferStations(
        summary.transferStations,
      );
    } else {
      elements.transferRow.hidden = true;

      elements.transferStations
        .replaceChildren();
    }

    renderRouteTimeline(
      elements.routeTimeline,
      summary,
    );

    elements.result.hidden = false;
  }

  /** 驗證使用者輸入。 */
  function validateSelection(
    start,
    goal,
    via,
  ) {
    if (!start) {
      return "請輸入起點站。";
    }

    if (!goal) {
      return "請輸入終點站。";
    }

    if (
      !ALL_STATIONS.has(start)
    ) {
      return `查無此站：${start}`;
    }

    if (
      !ALL_STATIONS.has(goal)
    ) {
      return `查無此站：${goal}`;
    }

    if (
      via
      && !ALL_STATIONS.has(via)
    ) {
      return `查無此站：${via}`;
    }

    return null;
  }

  /** 查詢按鈕。 */
  elements.form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      closeOtherComboboxes();

      const start = (
        normalizeStationName(
          elements.start.value,
        )
      );

      const goal = (
        normalizeStationName(
          elements.goal.value,
        )
      );

      const viaText = (
        normalizeStationName(
          elements.via.value,
        )
      );

      const via = (
        viaText || null
      );

      const mode = (
        elements.mode.value
      );

      /*
       * 把正規化後的站名
       * 寫回輸入框。
       */
      elements.start.value = start;
      elements.goal.value = goal;
      elements.via.value = viaText;

      const validationError = (
        validateSelection(
          start,
          goal,
          via,
        )
      );

      if (validationError) {
        hideResult();

        setStatus(
          validationError,
          "error",
        );

        return;
      }

      const path = findBestPath(
        start,
        goal,
        mode,
        via,
      );

      if (path === null) {
        hideResult();

        setStatus(
          (
            `無法從 ${start} 前往 ${goal}`
            + (
              via
                ? `，並經由 ${via}`
                : ""
            )
            + "。"
          ),
          "error",
        );

        return;
      }

      const summary = (
        summarizePath(path)
      );

      renderResult(
        start,
        goal,
        via,
        summary,
      );

      setStatus(
        "查詢完成。",
        "success",
      );
    },
  );

  /** 交換起終點。 */
  elements.swap.addEventListener(
    "click",
    () => {
      const start = (
        elements.start.value
      );

      elements.start.value = (
        elements.goal.value
      );

      elements.goal.value = start;

      closeOtherComboboxes();

      hideResult();

      setStatus(
        "已交換起點與終點，請重新查詢。",
        "neutral",
      );
    },
  );

  /** 清除所有條件。 */
  elements.clear.addEventListener(
    "click",
    () => {
      elements.form.reset();

      closeOtherComboboxes();

      hideResult();

      setStatus(
        "請輸入起點與終點。",
        "neutral",
      );

      elements.start.focus();
    },
  );

  /*
   * 使用者改動任何條件時，
   * 先隱藏舊結果，避免誤以為結果已更新。
   */
  for (
    const input
    of [
      elements.start,
      elements.goal,
      elements.via,
      elements.mode,
    ]
  ) {
    input.addEventListener(
      "input",
      () => {
        hideResult();

        setStatus(
          "條件已變更，請重新查詢。",
          "neutral",
        );
      },
    );

    /*
     * select 主要觸發 change。
     */
    if (
      input === elements.mode
    ) {
      input.addEventListener(
        "change",
        () => {
          hideResult();

          setStatus(
            "條件已變更，請重新查詢。",
            "neutral",
          );
        },
      );
    }
  }

  /*
   * PWA 安裝功能。
   */
  let deferredInstallPrompt = null;

  window.addEventListener(
    "beforeinstallprompt",
    (event) => {
      event.preventDefault();

      deferredInstallPrompt = event;

      elements.installButton.hidden = false;
    },
  );

  elements.installButton.addEventListener(
    "click",
    async () => {
      if (
        deferredInstallPrompt === null
      ) {
        return;
      }

      deferredInstallPrompt.prompt();

      await (
        deferredInstallPrompt.userChoice
      );

      deferredInstallPrompt = null;

      elements.installButton.hidden = true;
    },
  );

  window.addEventListener(
    "appinstalled",
    () => {
      deferredInstallPrompt = null;

      elements.installButton.hidden = true;

      setStatus(
        "已安裝到裝置。",
        "success",
      );
    },
  );

  /*
   * Service Worker。
   * Demo 57 維持 timeline-1 快取版本。
   */
  if (
    "serviceWorker" in navigator
  ) {
    window.addEventListener(
      "load",
      () => {
        navigator.serviceWorker
          .register(
            "./service-worker.js?v=57-timeline-1",
          )
          .catch(() => {
            /*
             * 離線快取註冊失敗
             * 不影響主要路線查詢功能。
             */
          });
      },
    );
  }

  hideResult();

  setStatus(
    "請輸入起點與終點。",
    "neutral",
  );
}

if (
  typeof document !== "undefined"
) {
  initializeUi();
}

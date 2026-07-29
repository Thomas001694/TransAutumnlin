# Demo52.py
# ------------------------------------------------------------
# 奧鐵路線導航器
# 修正重點：
# 1. 經由站改為單次全程搜尋，避免第二段路線被重設為 None。
# 2. 正確保留經由站前後的搭乘路線，轉乘次數與轉乘站不再漏算。
# 3. 禁止在不可轉乘站切換路線。
# 4. 依完整行程統一比較「最少轉乘」或「最少站數」。
# 5. 自動辨識完全重疊的路線區間。
# 6. 改善起終點相同、錯誤站名及輸入模式的處理。
# ------------------------------------------------------------

from collections import defaultdict
import heapq
from itertools import count
from typing import DefaultDict, Dict, FrozenSet, List, Optional, Sequence, Set, Tuple

# 路徑節點格式：(站名, 抵達此站所使用的路線)
PathNode = Tuple[str, Optional[str]]
Path = List[PathNode]
Graph = DefaultDict[str, List[Tuple[str, str]]]


# ===== 資料區 =====
ROUTE_DATA = [
    {
        "line": "林嶺本線",
        "stations": [
            "鹿島", "北鹿島", "大田", "西城", "新坦城", "東坦城", "江北", "小村",
            "南高田", "歐卡", "稻原", "浦隆", "城西", "格肯", "新城", "前山",
            "大東", "璋園", "中山", "城東", "阪本", "楚城", "大令", "嶺北", "大溪", "嶺東",
        ],
    },
    {
        "line": "坦城支線",
        "stations": ["小村", "坦城", "第一叢林神廟", "第二叢林神廟", "西城"],
    },
    {
        "line": "騰北本線",
        "stations": [
            "歐卡", "高田", "東品", "新灣北", "灣北", "璋園", "興東", "興北",
            "潭南", "江東", "潭北", "騰灣", "古城", "東山", "北山",
        ],
    },
    {"line": "山里支線", "stations": ["騰灣", "山里", "洞穴"]},
    {
        "line": "屏城線快速",
        "stations": ["屏城", "中城", "新灣北", "灣北", "璋園", "興東", "潭南"],
    },
    {
        "line": "屏城線普通",
        "stations": ["屏城", "中城", "東品", "高田", "歐卡"],
    },
    {
        "line": "格肯海山手線",
        "stations": [
            "格肯", "城西", "北海", "鎮北", "中平", "針葉湖", "北浦", "浦隆", "水合",
            "稻原", "東稻原", "歐卡港", "歐卡", "高田", "小灣", "東灣", "東品", "南屏",
            "北屏", "新灣北", "旅運中心", "新城港", "格肯",
        ],
    },
    {
        "line": "垣海線",
        "stations": ["垣北", "嶺北", "嶺南", "南海", "東灣北", "灣北", "大川", "格肯", "城西", "鎮北"],
    },
    {"line": "墘海線", "stations": ["海底神殿", "西海", "潭南", "墘林"]},
    {
        "line": "特急白鹿號",
        "stations": ["鹿島", "新坦城", "白山町", "灣北", "璋園", "興東", "潭南", "騰灣"],
    },
]

# 可轉乘站：只有這些站允許從一條路線切換至另一條路線。
TRANSFERABLE: Set[str] = {
    "小村", "西城", "城西", "格肯", "浦隆", "歐卡",
    "璋園", "新灣北", "灣北", "屏城", "東品", "高田", "鎮北",
    "潭南", "騰灣", "北山", "興東", "新坦城", "鹿島",
}

# 保留 ROUTE_DATA 中的路線順序，讓重疊路線名稱輸出穩定。
LINE_ORDER = {route["line"]: index for index, route in enumerate(ROUTE_DATA)}


# ===== 建圖 =====
def build_graph(route_data: Sequence[Dict[str, object]]) -> Graph:
    """建立雙向鄰接圖。環狀線以首尾同站表示，因此不需額外補邊。"""
    graph: Graph = defaultdict(list)

    for route in route_data:
        line = str(route["line"])
        stations = list(route["stations"])

        for index in range(len(stations) - 1):
            station_a = stations[index]
            station_b = stations[index + 1]

            # 避免資料誤植造成同站自迴圈。
            if station_a == station_b:
                continue

            graph[station_a].append((station_b, line))
            graph[station_b].append((station_a, line))

    return graph


def build_edge_lines(route_data: Sequence[Dict[str, object]]) -> DefaultDict[FrozenSet[str], Set[str]]:
    """記錄每一段相鄰站區間可由哪些路線行駛。"""
    edge_lines: DefaultDict[FrozenSet[str], Set[str]] = defaultdict(set)

    for route in route_data:
        line = str(route["line"])
        stations = list(route["stations"])

        for station_a, station_b in zip(stations, stations[1:]):
            if station_a != station_b:
                edge_lines[frozenset((station_a, station_b))].add(line)

    return edge_lines


GRAPH = build_graph(ROUTE_DATA)
EDGE_LINES = build_edge_lines(ROUTE_DATA)
ALL_STATIONS: Set[str] = set(GRAPH)


# ===== 最優路徑搜尋 =====
def make_priority(mode: str, transfers: int, stops: int) -> Tuple[int, int]:
    """依使用者模式產生 Dijkstra 優先序。"""
    if mode == "2":
        return stops, transfers
    return transfers, stops


def find_best_path(
    start: str,
    goal: str,
    mode: str,
    via: Optional[str] = None,
) -> Optional[Path]:
    """
    尋找最佳路徑。

    狀態同時保存：
    - 目前所在站
    - 目前搭乘路線
    - 是否已經通過經由站

    因此經由站前後會被視為同一趟完整行程，不會重設路線或漏算轉乘。
    """
    if start == goal and (via is None or via == start):
        return [(start, None)]

    passed_via_at_start = via is None or start == via

    # 堆積項目：
    # (排序成本, 唯一序號, 轉乘數, 站數, 站名, 目前路線, 已通過經由站, 路徑)
    sequence = count()
    queue = [
        (
            make_priority(mode, 0, 0),
            next(sequence),
            0,
            0,
            start,
            None,
            passed_via_at_start,
            [(start, None)],
        )
    ]

    # 每個狀態只保留目前最佳的實際成本 (轉乘數, 站數)。
    best_cost: Dict[Tuple[str, Optional[str], bool], Tuple[int, int]] = {}

    while queue:
        _, _, transfers, stops, station, current_line, passed_via, path = heapq.heappop(queue)
        state = (station, current_line, passed_via)
        actual_cost = (transfers, stops)

        old_cost = best_cost.get(state)
        if old_cost is not None:
            old_priority = make_priority(mode, old_cost[0], old_cost[1])
            current_priority = make_priority(mode, transfers, stops)
            if old_priority <= current_priority:
                continue

        best_cost[state] = actual_cost

        # 只有在已通過經由站後，終點才算真正抵達。
        if station == goal and passed_via:
            return path

        for next_station, next_line in GRAPH[station]:
            switching = current_line is not None and next_line != current_line

            # 不可轉乘站不能切換路線。
            if switching and station not in TRANSFERABLE:
                continue

            next_passed_via = passed_via or (via is not None and next_station == via)

            next_transfers = transfers + int(switching)
            next_stops = stops + 1
            next_priority = make_priority(mode, next_transfers, next_stops)
            next_state = (next_station, next_line, next_passed_via)

            known_cost = best_cost.get(next_state)
            if known_cost is not None:
                known_priority = make_priority(mode, known_cost[0], known_cost[1])
                if known_priority <= next_priority:
                    continue

            heapq.heappush(
                queue,
                (
                    next_priority,
                    next(sequence),
                    next_transfers,
                    next_stops,
                    next_station,
                    next_line,
                    next_passed_via,
                    path + [(next_station, next_line)],
                ),
            )

    return None


# ===== 路徑摘要 =====
def get_overlapping_line_name(stations: Sequence[str], selected_line: str) -> str:
    """
    找出整個連續區間都能行駛的路線。

    例如「新灣北 → 灣北 → 璋園」同時屬於騰北本線與屏城線快速，
    便顯示為「騰北本線 或 屏城線快速」。
    """
    if len(stations) < 2:
        return selected_line

    common_lines: Optional[Set[str]] = None

    for station_a, station_b in zip(stations, stations[1:]):
        lines = EDGE_LINES.get(frozenset((station_a, station_b)), set())
        common_lines = set(lines) if common_lines is None else common_lines & lines

        if not common_lines:
            return selected_line

    # 確保搜尋實際採用的路線仍在候選集合中。
    if selected_line not in common_lines:
        return selected_line

    ordered_lines = sorted(common_lines, key=lambda line: LINE_ORDER.get(line, 9999))
    return " 或 ".join(ordered_lines)


def split_into_segments(path: Path) -> List[Dict[str, object]]:
    """依搭乘路線切分路徑。"""
    if len(path) < 2:
        return []

    segments: List[Dict[str, object]] = []
    current_line = path[1][1]
    current_stations = [path[0][0], path[1][0]]

    for index in range(2, len(path)):
        station, incoming_line = path[index]

        if incoming_line == current_line:
            current_stations.append(station)
            continue

        segments.append({"line": current_line, "stations": current_stations})
        current_line = incoming_line
        current_stations = [path[index - 1][0], station]

    segments.append({"line": current_line, "stations": current_stations})
    return segments


def summarize_path(path: Path) -> Dict[str, object]:
    """將原始路徑轉換成可讀摘要。"""
    raw_stations = [station for station, _ in path]
    start = raw_stations[0]
    goal = raw_stations[-1]
    segments = split_into_segments(path)

    # 轉乘發生在「下一段路線開始前的那一站」。
    # 使用索引而不是只用站名，避免同一站在路徑中出現兩次時標錯位置。
    transfer_indices: List[int] = []
    for index in range(2, len(path)):
        previous_line = path[index - 1][1]
        incoming_line = path[index][1]
        if previous_line is not None and incoming_line != previous_line:
            transfer_indices.append(index - 1)

    if not segments:
        route_names = ["無需搭乘"]
    else:
        route_names = []

        for segment in segments:
            line = segment["line"]
            stations = segment["stations"]

            if line is None:
                # 正常資料不應出現；保留防呆，避免輸出空白路線。
                route_names.append("未知路線")
            else:
                route_names.append(get_overlapping_line_name(stations, line))

    transfer_stations = [raw_stations[index] for index in transfer_indices]

    display_stations = []
    for index, station in enumerate(raw_stations):
        if len(raw_stations) == 1:
            display_stations.append(f"【起終】{station}")
        elif index == 0:
            display_stations.append(f"【起】{station}")
        elif index == len(raw_stations) - 1:
            display_stations.append(f"【終】{station}")
        elif index in transfer_indices:
            display_stations.append(f"【轉】{station}")
        else:
            display_stations.append(station)

    return {
        "經過路線": " → ".join(route_names),
        "轉乘次數": len(transfer_indices),
        "總站數": len(raw_stations) - 1,
        "轉乘站點": "、".join(transfer_stations),
        "顯示站序": " → ".join(display_stations),
        "途經站": " → ".join(raw_stations),
        "起點": start,
        "終點": goal,
    }


# ===== 顯示結果 =====
def show_result(result: Dict[str, object], start: str, goal: str, via: Optional[str]) -> None:
    """輸出單一最佳方案。"""
    title = f"📍 {start} → {goal}"
    if via:
        title += f"（經由 {via}）"
    print(f"{title} 最佳路線如下：")
    print(f"  經過路線：{result['經過路線']}")
    print(f"  轉乘次數：{result['轉乘次數']}")
    print(f"  總站數：{result['總站數']}")
    if result["轉乘站點"]:
        print(f"  轉乘站點：{result['轉乘站點']}")
    print(f"  途經站：{result['顯示站序']}")
    print("-" * 50)


# ===== 輸入輔助 =====
def is_exit_command(text: str) -> bool:
    """判斷是否為離開指令。"""
    return text.casefold() == "exit"


def validate_station(name: str, label: str) -> bool:
    """驗證站名並顯示錯誤。"""
    if not name:
        print(f"❌ {label}不可留空，請重新輸入")
        return False
    if name not in ALL_STATIONS:
        print(f"❌ 查無此站：{name}，請重新輸入")
        return False
    return True


# ===== 主程式 =====
def main() -> None:
    while True:
        start = input("請輸入起點站（exit 離開）：").strip()
        if is_exit_command(start):
            print("👋 再見")
            break

        goal = input("請輸入終點站：").strip()
        if is_exit_command(goal):
            print("👋 再見")
            break

        via_input = input("經由站（可留空）：").strip()
        if is_exit_command(via_input):
            print("👋 再見")
            break
        via = via_input or None

        mode = input("篩選方式（1=最少轉乘，2=最少站數）：").strip()
        if is_exit_command(mode):
            print("👋 再見")
            break
        if mode not in ("1", "2"):
            print("⚠️ 篩選方式無效，已自動使用 1（最少轉乘）")
            mode = "1"

        if not validate_station(start, "起點站"):
            continue
        if not validate_station(goal, "終點站"):
            continue
        if via is not None and not validate_station(via, "經由站"):
            continue

        best_path = find_best_path(start, goal, mode, via)
        if best_path is None:
            message = f"⚠️ 無法從 {start} 前往 {goal}"
            if via:
                message += f" 並經由 {via}"
            print(message)
            continue

        result = summarize_path(best_path)
        show_result(result, start, goal, via)


if __name__ == "__main__":
    main()

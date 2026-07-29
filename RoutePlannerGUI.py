# RoutePlannerGUI.py
# ------------------------------------------------------------
# 奧鐵路線導航器圖形介面
# 使用 Python 內建 Tkinter，不需要安裝額外套件。
# ------------------------------------------------------------

from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk
from typing import List

from Demo52 import ALL_STATIONS, ROUTE_DATA, find_best_path, summarize_path


def get_station_order() -> List[str]:
    """依路線資料首次出現順序建立站名清單，避免純字典排序難以尋找。"""
    ordered_stations: List[str] = []
    seen = set()

    for route in ROUTE_DATA:
        for station in route["stations"]:
            if station not in seen:
                seen.add(station)
                ordered_stations.append(station)

    # 防呆：若圖資料內還有未列入 ROUTE_DATA 順序的站，再補到最後。
    for station in sorted(ALL_STATIONS):
        if station not in seen:
            ordered_stations.append(station)

    return ordered_stations


class RoutePlannerApp(tk.Tk):
    """奧鐵路線導航器主視窗。"""

    def __init__(self) -> None:
        super().__init__()

        self.title("奧鐵路線導航器 Demo52")
        self.geometry("900x650")
        self.minsize(760, 560)

        self.station_names = get_station_order()

        self.start_var = tk.StringVar()
        self.goal_var = tk.StringVar()
        self.via_var = tk.StringVar()
        self.mode_var = tk.StringVar(value="最少轉乘")
        self.status_var = tk.StringVar(value="請選擇起點與終點。")

        self._configure_style()
        self._build_ui()

    def _configure_style(self) -> None:
        """設定簡單一致的介面尺寸，不覆寫系統主題。"""
        style = ttk.Style(self)
        style.configure("Title.TLabel", font=("Microsoft JhengHei UI", 18, "bold"))
        style.configure("Field.TLabel", font=("Microsoft JhengHei UI", 10))
        style.configure("Action.TButton", font=("Microsoft JhengHei UI", 10, "bold"), padding=8)

    def _build_ui(self) -> None:
        """建立主介面。"""
        root_frame = ttk.Frame(self, padding=18)
        root_frame.pack(fill="both", expand=True)
        root_frame.columnconfigure(0, weight=1)
        root_frame.rowconfigure(2, weight=1)

        ttk.Label(root_frame, text="奧鐵路線導航器", style="Title.TLabel").grid(
            row=0, column=0, sticky="w", pady=(0, 14)
        )

        input_frame = ttk.LabelFrame(root_frame, text="行程條件", padding=14)
        input_frame.grid(row=1, column=0, sticky="ew", pady=(0, 14))
        input_frame.columnconfigure(1, weight=1)
        input_frame.columnconfigure(3, weight=1)

        ttk.Label(input_frame, text="起點站", style="Field.TLabel").grid(
            row=0, column=0, sticky="w", padx=(0, 8), pady=6
        )
        self.start_box = ttk.Combobox(
            input_frame,
            textvariable=self.start_var,
            values=self.station_names,
            state="normal",
        )
        self.start_box.grid(row=0, column=1, sticky="ew", padx=(0, 18), pady=6)

        ttk.Label(input_frame, text="終點站", style="Field.TLabel").grid(
            row=0, column=2, sticky="w", padx=(0, 8), pady=6
        )
        self.goal_box = ttk.Combobox(
            input_frame,
            textvariable=self.goal_var,
            values=self.station_names,
            state="normal",
        )
        self.goal_box.grid(row=0, column=3, sticky="ew", pady=6)

        ttk.Label(input_frame, text="經由站", style="Field.TLabel").grid(
            row=1, column=0, sticky="w", padx=(0, 8), pady=6
        )
        self.via_box = ttk.Combobox(
            input_frame,
            textvariable=self.via_var,
            values=[""] + self.station_names,
            state="normal",
        )
        self.via_box.grid(row=1, column=1, sticky="ew", padx=(0, 18), pady=6)

        ttk.Label(input_frame, text="優先方式", style="Field.TLabel").grid(
            row=1, column=2, sticky="w", padx=(0, 8), pady=6
        )
        mode_box = ttk.Combobox(
            input_frame,
            textvariable=self.mode_var,
            values=["最少轉乘", "最少站數"],
            state="readonly",
        )
        mode_box.grid(row=1, column=3, sticky="ew", pady=6)

        button_frame = ttk.Frame(input_frame)
        button_frame.grid(row=2, column=0, columnspan=4, sticky="e", pady=(10, 0))

        ttk.Button(
            button_frame,
            text="交換起終點",
            command=self.swap_stations,
        ).pack(side="left", padx=(0, 8))

        ttk.Button(
            button_frame,
            text="清除",
            command=self.clear_form,
        ).pack(side="left", padx=(0, 8))

        ttk.Button(
            button_frame,
            text="查詢最佳路線",
            style="Action.TButton",
            command=self.search_route,
        ).pack(side="left")

        result_frame = ttk.LabelFrame(root_frame, text="查詢結果", padding=12)
        result_frame.grid(row=2, column=0, sticky="nsew")
        result_frame.columnconfigure(0, weight=1)
        result_frame.rowconfigure(0, weight=1)

        self.result_text = tk.Text(
            result_frame,
            wrap="word",
            font=("Microsoft JhengHei UI", 11),
            padx=12,
            pady=12,
            state="disabled",
        )
        self.result_text.grid(row=0, column=0, sticky="nsew")

        scrollbar = ttk.Scrollbar(result_frame, orient="vertical", command=self.result_text.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.result_text.configure(yscrollcommand=scrollbar.set)

        ttk.Label(root_frame, textvariable=self.status_var).grid(
            row=3, column=0, sticky="w", pady=(10, 0)
        )

        self.bind("<Return>", lambda _event: self.search_route())
        self.start_box.focus_set()

    def _validate_station(self, station: str, label: str, allow_empty: bool = False) -> bool:
        """驗證使用者輸入的站名。"""
        if allow_empty and not station:
            return True

        if not station:
            messagebox.showwarning("輸入不完整", f"請輸入{label}。")
            return False

        if station not in ALL_STATIONS:
            messagebox.showerror("查無車站", f"查無此站：{station}")
            return False

        return True

    def search_route(self) -> None:
        """搜尋並顯示最佳路線。"""
        start = self.start_var.get().strip()
        goal = self.goal_var.get().strip()
        via = self.via_var.get().strip() or None
        mode = "1" if self.mode_var.get() == "最少轉乘" else "2"

        if not self._validate_station(start, "起點站"):
            return
        if not self._validate_station(goal, "終點站"):
            return
        if not self._validate_station(via or "", "經由站", allow_empty=True):
            return

        path = find_best_path(start, goal, mode, via)
        if path is None:
            via_text = f"，並經由 {via}" if via else ""
            message = f"無法從 {start} 前往 {goal}{via_text}。"
            self._set_result(message)
            self.status_var.set("查無可行路線。")
            return

        result = summarize_path(path)
        title = f"{start} → {goal}"
        if via:
            title += f"（經由 {via}）"

        lines = [
            title,
            "",
            f"經過路線：{result['經過路線']}",
            f"轉乘次數：{result['轉乘次數']}",
            f"總站數：{result['總站數']}",
        ]

        if result["轉乘站點"]:
            lines.append(f"轉乘站點：{result['轉乘站點']}")

        lines.extend(["", "途經站：", str(result["顯示站序"])])

        self._set_result("\n".join(lines))
        self.status_var.set("查詢完成。")

    def _set_result(self, content: str) -> None:
        """更新唯讀結果文字框。"""
        self.result_text.configure(state="normal")
        self.result_text.delete("1.0", "end")
        self.result_text.insert("1.0", content)
        self.result_text.configure(state="disabled")

    def swap_stations(self) -> None:
        """交換起點與終點。"""
        start = self.start_var.get()
        self.start_var.set(self.goal_var.get())
        self.goal_var.set(start)

    def clear_form(self) -> None:
        """清除輸入與查詢結果。"""
        self.start_var.set("")
        self.goal_var.set("")
        self.via_var.set("")
        self.mode_var.set("最少轉乘")
        self._set_result("")
        self.status_var.set("請選擇起點與終點。")
        self.start_box.focus_set()


def main() -> None:
    """啟動圖形介面。"""
    app = RoutePlannerApp()
    app.mainloop()


if __name__ == "__main__":
    main()

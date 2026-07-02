from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from app.config import get_settings
from strategies._paths import LOCAL_REPORT_DIR, resolve_bars_dir, resolve_qlib_data_dir

PCT_CHG_MIN = 0.02
PCT_CHG_MAX = 0.05
VOL_RATIO_MIN = 1.2
TOP_N = 10
BACKTEST_TRADE_DAYS = 20
MA_WINDOWS = (5, 10, 20)
QLIB_FIELDS = ["$open", "$high", "$low", "$close", "$volume"]

EXEC_OPEN_NEXT = "open_next_open"
EXEC_CLOSE_NEXT = "close_next_open"

EXEC_MODES: dict[str, dict[str, str]] = {
    EXEC_OPEN_NEXT: {
        "title": "开盘买 → 次日开盘卖",
        "buy_label": "买入开盘",
        "trade_rule": "前一交易日收盘筛选，当日**开盘买入、次日开盘卖出**",
    },
    EXEC_CLOSE_NEXT: {
        "title": "尾盘买 → 次日开盘卖",
        "buy_label": "买入收盘",
        "trade_rule": "前一交易日收盘筛选，当日**收盘买入、次日开盘卖出**",
    },
}


def fname_to_ts_code(stem: str) -> str:
    code, suffix = stem.rsplit("_", 1)
    return f"{code.upper()}.{suffix.upper()}"


def ts_code_to_qlib(code: str) -> str:
    num, market = code.split(".")
    return f"{num}_{market}".lower()


def init_qlib(data_dir: Path) -> bool:
    try:
        import qlib

        qlib.init(provider_uri=str(data_dir), region="cn")
        return True
    except Exception as exc:
        print(f"qlib 初始化失败，将使用 CSV 数据源: {exc}", file=sys.stderr)
        return False


def load_trade_dates_from_qlib(start_date: str, end_date: str) -> list[str]:
    from qlib.data import D

    start = f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}"
    end = f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}"
    cal = D.calendar(start_time=start, end_time=end, freq="day")
    if len(cal) == 0:
        return []
    return [pd.Timestamp(d).strftime("%Y%m%d") for d in cal]


def load_trade_dates_from_csv(source_dir: Path, start_date: str, end_date: str) -> list[str]:
    ref = source_dir / "000001_sz.csv"
    if not ref.exists():
        for path in sorted(source_dir.glob("*.csv")):
            ref = path
            break
    if not ref.exists():
        return []
    dates = pd.read_csv(ref, usecols=["date"])["date"].astype(str)
    return sorted(d for d in dates if start_date <= d <= end_date)


def _panel_from_qlib(symbols: list[str], start_date: str, end_date: str) -> pd.DataFrame | None:
    from qlib.data import D

    qlib_symbols = [ts_code_to_qlib(code) for code in symbols]
    start = f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}"
    end = f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}"
    raw = D.features(qlib_symbols, QLIB_FIELDS, start_time=start, end_time=end)
    if raw.empty:
        return None

    raw = raw.reset_index()
    raw.columns = ["instrument", "date", "open", "high", "low", "close", "volume"]
    raw["date"] = pd.to_datetime(raw["date"]).dt.strftime("%Y%m%d")
    inv_map = {ts_code_to_qlib(code): code for code in symbols}
    raw["ts_code"] = raw["instrument"].map(inv_map)
    raw = raw.dropna(subset=["ts_code"])
    return raw.drop(columns=["instrument"])


def _panel_from_csv(source_dir: Path, symbols: list[str], start_date: str, end_date: str) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for ts_code in symbols:
        path = source_dir / f"{ts_code.replace('.', '_').lower()}.csv"
        if not path.exists():
            continue
        try:
            df = pd.read_csv(path, usecols=["date", "open", "high", "low", "close", "volume"])
        except (ValueError, pd.errors.EmptyDataError):
            continue
        if df.empty:
            continue
        df["date"] = df["date"].astype(str)
        df = df[(df["date"] >= start_date) & (df["date"] <= end_date)]
        if df.empty:
            continue
        df["ts_code"] = ts_code
        frames.append(df)
    if not frames:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume", "ts_code"])
    return pd.concat(frames, ignore_index=True)


def enrich_symbol_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("date").reset_index(drop=True)
    df["pre_close"] = df["close"].shift(1)
    df["pct_chg"] = df["close"] / df["pre_close"] - 1.0

    for window in MA_WINDOWS:
        df[f"ma{window}"] = df["close"].rolling(window, min_periods=window).mean()
        df[f"vol_ma{window}"] = df["volume"].rolling(window, min_periods=window).mean()

    prev_vol5 = df["volume"].rolling(5, min_periods=5).mean().shift(1)
    df["vol_ratio"] = df["volume"] / prev_vol5
    return df


def build_bar_index(panel: pd.DataFrame) -> dict[tuple[str, str], pd.Series]:
    return {(str(row["ts_code"]), str(row["date"])): row for _, row in panel.iterrows()}


def passes_screen(row: pd.Series) -> bool:
    if not (PCT_CHG_MIN < float(row["pct_chg"]) < PCT_CHG_MAX):
        return False
    if not (float(row["vol_ratio"]) > VOL_RATIO_MIN):
        return False
    if not (row["vol_ma5"] > row["vol_ma10"] > row["vol_ma20"]):
        return False
    if not (row["ma5"] > row["ma10"] > row["ma20"]):
        return False
    if not (float(row["open"]) > 0):
        return False
    if not (float(row["close"]) > 0):
        return False
    return True


def screen_day(panel: pd.DataFrame, signal_date: str, *, top_n: int) -> list[dict]:
    day = panel[panel["date"] == signal_date].copy()
    if day.empty:
        return []

    hits: list[dict] = []
    for _, row in day.iterrows():
        if not passes_screen(row):
            continue
        hits.append(
            {
                "ts_code": str(row["ts_code"]),
                "signal_date": signal_date,
                "pct_chg_pct": round(float(row["pct_chg"]) * 100, 2),
                "vol_ratio": round(float(row["vol_ratio"]), 2),
            }
        )

    hits.sort(key=lambda x: (-x["vol_ratio"], x["ts_code"]))
    return hits[:top_n]


def materialize_trades(
    bar_index: dict[tuple[str, str], pd.Series],
    candidates: list[dict],
    exec_date: str,
    sell_date: str,
    mode: str,
) -> list[dict]:
    trades: list[dict] = []
    for candidate in candidates:
        exec_bar = bar_index.get((candidate["ts_code"], exec_date))
        sell_bar = bar_index.get((candidate["ts_code"], sell_date))
        if exec_bar is None or sell_bar is None:
            continue

        buy = float(exec_bar["open"] if mode == EXEC_OPEN_NEXT else exec_bar["close"])
        sell = float(sell_bar["open"])
        if buy <= 0 or sell <= 0:
            continue

        trades.append(
            {
                **candidate,
                "exec_date": exec_date,
                "sell_date": sell_date,
                "buy_price": buy,
                "sell_price": sell,
                "hold_ret_pct": round((sell / buy - 1.0) * 100, 2),
            }
        )
    return trades


def run_backtest(
    panel: pd.DataFrame,
    execution_dates: list[str],
    all_trade_dates: list[str],
    bar_index: dict[tuple[str, str], pd.Series],
    *,
    top_n: int,
    mode: str,
) -> tuple[list[dict], dict]:
    date_idx = {d: i for i, d in enumerate(all_trade_dates)}
    daily_records: list[dict] = []
    equity = 1.0
    wins = 0
    traded_days = 0
    total_trades = 0

    for exec_date in execution_dates:
        idx = date_idx[exec_date]
        signal_date = all_trade_dates[idx - 1] if idx > 0 else ""
        sell_date = all_trade_dates[idx + 1] if idx + 1 < len(all_trade_dates) else ""

        if signal_date and sell_date:
            candidates = screen_day(panel, signal_date, top_n=top_n)
            picks = materialize_trades(bar_index, candidates, exec_date, sell_date, mode)
        else:
            picks = []

        if picks:
            day_ret = float(np.mean([p["hold_ret_pct"] / 100.0 for p in picks]))
            equity *= 1.0 + day_ret
            traded_days += 1
            wins += sum(1 for p in picks if p["hold_ret_pct"] > 0)
            total_trades += len(picks)
        else:
            day_ret = 0.0

        daily_records.append(
            {
                "exec_date": exec_date,
                "signal_date": signal_date,
                "sell_date": sell_date,
                "picks": picks,
                "day_return_pct": round(day_ret * 100, 2),
                "equity": round(equity, 4),
            }
        )

    summary = {
        "mode": mode,
        "start_date": execution_dates[0] if execution_dates else "",
        "end_date": execution_dates[-1] if execution_dates else "",
        "trading_days": len(execution_dates),
        "days_with_picks": traded_days,
        "total_trades": total_trades,
        "win_trades": wins,
        "win_rate_pct": round(wins / total_trades * 100, 2) if total_trades else 0.0,
        "total_return_pct": round((equity - 1.0) * 100, 2),
        "avg_day_return_pct": round(
            float(np.mean([r["day_return_pct"] for r in daily_records if r["picks"]])) if traded_days else 0.0,
            2,
        ),
    }
    return daily_records, summary


def _summary_rows(summary: dict) -> list[str]:
    return [
        f"| 回测交易日 | {summary['trading_days']} |",
        f"| 有持仓日 | {summary['days_with_picks']} |",
        f"| 总成交笔数 | {summary['total_trades']} |",
        f"| 盈利笔数 | {summary['win_trades']} |",
        f"| 胜率 | {summary['win_rate_pct']:.2f}% |",
        f"| 日均收益（有持仓日） | {summary['avg_day_return_pct']:.2f}% |",
        f"| **累计收益** | **{summary['total_return_pct']:.2f}%** |",
    ]


def _daily_detail_section(
    daily_records: list[dict],
    summary: dict,
    mode: str,
) -> list[str]:
    meta = EXEC_MODES[mode]
    buy_label = meta["buy_label"]
    lines = [
        f"## {meta['title']}",
        "",
        f"- 交易假设：{meta['trade_rule']}（A 股 T+1）",
        "",
        "### 回测汇总",
        "",
        "| 指标 | 数值 |",
        "| --- | ---: |",
        *_summary_rows(summary),
        "",
        "### 每日操作记录",
        "",
    ]

    for record in daily_records:
        exec_date = record["exec_date"]
        signal_date = record["signal_date"]
        lines.append(f"#### 执行日 {exec_date}（信号日 {signal_date}）")
        lines.append("")
        picks = record["picks"]
        if not picks:
            reason = "无符合条件的标的，空仓"
            if not signal_date:
                reason = "缺少前一交易日，无法生成信号"
            elif not record["sell_date"]:
                reason = "缺少次日行情，无法卖出"
            lines.append(f"- {reason}")
            lines.append(f"- 当日组合收益：**0.00%**，累计净值：**{record['equity']:.4f}**")
            lines.append("")
            continue

        lines.append(
            f"- 当日组合收益：**{record['day_return_pct']:.2f}%**，累计净值：**{record['equity']:.4f}**"
        )
        lines.append("")
        lines.append(f"| # | 代码 | {buy_label} | 次日开盘 | 信号日涨幅 | 信号日量比 | 持仓收益 |")
        lines.append("| ---: | --- | ---: | ---: | ---: | ---: | ---: |")
        for idx, pick in enumerate(picks, start=1):
            lines.append(
                f"| {idx} | {pick['ts_code']} | {pick['buy_price']:.2f} | "
                f"{pick['sell_price']:.2f} | {pick['pct_chg_pct']:.2f}% | {pick['vol_ratio']:.2f} | "
                f"{pick['hold_ret_pct']:.2f}% |"
            )
        lines.append("")

    return lines


def build_comparison_markdown(
    results: dict[str, tuple[list[dict], dict]],
    *,
    data_source: str,
    top_n: int,
    backtest_days: int,
) -> str:
    open_summary = results[EXEC_OPEN_NEXT][1]
    close_summary = results[EXEC_CLOSE_NEXT][1]
    open_daily = results[EXEC_OPEN_NEXT][0]
    close_daily = results[EXEC_CLOSE_NEXT][0]

    lines = [
        "# 短线策略回测对比（T+1）",
        "",
        "## 策略条件（共用筛选）",
        "",
        f"- 回测区间（执行日）：**{open_summary['start_date']}** ~ **{open_summary['end_date']}**（最近 **{backtest_days}** 个交易日）",
        "- 筛选：**前一交易日**收盘后可得的日线指标（涨幅、量比、均线/量多头排列）",
        f"- 涨幅：**{PCT_CHG_MIN * 100:.0f}%** < 涨跌幅 < **{PCT_CHG_MAX * 100:.0f}%**",
        f"- 量比：**> {VOL_RATIO_MIN}**（信号日成交量 / 前 5 日均量）",
        "- 成交量多头排列：5 日均量 > 10 日均量 > 20 日均量",
        "- 均线多头排列：MA5 > MA10 > MA20",
        f"- 每个信号日取量比最高的前 **{top_n}** 只，等权",
        f"- 数据源：`{data_source}`",
        "",
        "## 执行方式对比",
        "",
        "| 指标 | 开盘买→次日开盘卖 | 尾盘买→次日开盘卖 | 差值（尾盘-开盘） |",
        "| --- | ---: | ---: | ---: |",
        f"| 有持仓日 | {open_summary['days_with_picks']} | {close_summary['days_with_picks']} | "
        f"{close_summary['days_with_picks'] - open_summary['days_with_picks']:+d} |",
        f"| 总成交笔数 | {open_summary['total_trades']} | {close_summary['total_trades']} | "
        f"{close_summary['total_trades'] - open_summary['total_trades']:+d} |",
        f"| 胜率 | {open_summary['win_rate_pct']:.2f}% | {close_summary['win_rate_pct']:.2f}% | "
        f"{close_summary['win_rate_pct'] - open_summary['win_rate_pct']:+.2f}pp |",
        f"| 日均收益（有持仓日） | {open_summary['avg_day_return_pct']:.2f}% | {close_summary['avg_day_return_pct']:.2f}% | "
        f"{close_summary['avg_day_return_pct'] - open_summary['avg_day_return_pct']:+.2f}pp |",
        f"| **累计收益** | **{open_summary['total_return_pct']:.2f}%** | **{close_summary['total_return_pct']:.2f}%** | "
        f"**{close_summary['total_return_pct'] - open_summary['total_return_pct']:+.2f}pp** |",
        "",
        "## 每日组合收益对比",
        "",
        "| 交易日（执行日） | 开盘买收益 | 尾盘买收益 | 差值 | 开盘净值 | 尾盘净值 |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]

    close_by_date = {r["exec_date"]: r for r in close_daily}
    for record in open_daily:
        date = record["exec_date"]
        close_record = close_by_date[date]
        open_ret = record["day_return_pct"]
        close_ret = close_record["day_return_pct"]
        lines.append(
            f"| {date} | {open_ret:.2f}% | {close_ret:.2f}% | {close_ret - open_ret:+.2f}pp | "
            f"{record['equity']:.4f} | {close_record['equity']:.4f} |"
        )

    lines.append("")
    lines.extend(_daily_detail_section(open_daily, open_summary, EXEC_OPEN_NEXT))
    lines.extend(_daily_detail_section(close_daily, close_summary, EXEC_CLOSE_NEXT))
    lines.append(
        "> 说明：T-1 日收盘后根据 T-1 日指标完成筛选；T 日开盘/收盘买入，T+1 日开盘卖出（A 股 T+1）。"
        "两种执行方式共用同一批信号，仅买入价不同。"
    )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="短线策略回测对比：开盘买 vs 尾盘买，次日开盘卖（qlib / CSV）")
    parser.add_argument("--days", type=int, default=BACKTEST_TRADE_DAYS, help="回测交易日数量")
    parser.add_argument("--top-n", type=int, default=TOP_N, help="每日最多持仓只数")
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="输出 markdown 路径，默认 local_report/day_trade_screen_backtest.md",
    )
    parser.add_argument("--end-date", default=None, help="回测结束交易日 YYYYMMDD，默认取数据最新日")
    args = parser.parse_args()

    settings = get_settings()
    source_dir = resolve_bars_dir(settings)
    qlib_data_dir = resolve_qlib_data_dir(settings)
    output = Path(args.output) if args.output else LOCAL_REPORT_DIR / "day_trade_screen_backtest.md"
    output.parent.mkdir(parents=True, exist_ok=True)

    qlib_ok = init_qlib(qlib_data_dir)
    symbols = sorted(fname_to_ts_code(p.stem) for p in source_dir.glob("*.csv"))
    if not symbols:
        print(f"未找到 CSV 数据: {source_dir}", file=sys.stderr)
        return 1

    if args.end_date:
        end_date = args.end_date
    else:
        end_date = ""
        for path in source_dir.glob("*.csv"):
            try:
                latest = pd.read_csv(path, usecols=["date"])["date"].astype(str).max()
                end_date = max(end_date, latest) if end_date else latest
            except (ValueError, pd.errors.EmptyDataError):
                continue
        if not end_date:
            print(f"无法从 CSV 推断最新交易日: {source_dir}", file=sys.stderr)
            return 1

    warmup_days = max(MA_WINDOWS) + 5
    probe_start = (datetime.strptime(end_date, "%Y%m%d") - pd.Timedelta(days=args.days * 2 + warmup_days)).strftime(
        "%Y%m%d"
    )

    if qlib_ok:
        all_trade_dates = load_trade_dates_from_qlib(probe_start, end_date)
    else:
        all_trade_dates = []
    if not all_trade_dates:
        all_trade_dates = load_trade_dates_from_csv(source_dir, probe_start, end_date)

    if len(all_trade_dates) < args.days + 1:
        print("交易日不足，无法回测", file=sys.stderr)
        return 1
    execution_dates = all_trade_dates[-args.days :]
    load_start = all_trade_dates[max(0, all_trade_dates.index(execution_dates[0]) - warmup_days - 1)]
    last_exec_idx = all_trade_dates.index(execution_dates[-1])
    load_end = all_trade_dates[last_exec_idx + 1] if last_exec_idx + 1 < len(all_trade_dates) else end_date

    panel = None
    data_source = str(source_dir)
    if qlib_ok:
        panel = _panel_from_qlib(symbols, load_start, load_end)
        if panel is not None and not panel.empty:
            data_source = f"qlib:{qlib_data_dir}"
        else:
            print("qlib features 为空，回退到 CSV", file=sys.stderr)

    if panel is None or panel.empty:
        panel = _panel_from_csv(source_dir, symbols, load_start, load_end)
        data_source = str(source_dir)

    if panel.empty:
        print("行情面板为空", file=sys.stderr)
        return 1

    enriched_frames: list[pd.DataFrame] = []
    for _, group in panel.groupby("ts_code"):
        enriched_frames.append(enrich_symbol_df(group.copy()))
    panel = pd.concat(enriched_frames, ignore_index=True)
    bar_index = build_bar_index(panel)

    daily_records_open, summary_open = run_backtest(
        panel, execution_dates, all_trade_dates, bar_index, top_n=args.top_n, mode=EXEC_OPEN_NEXT
    )
    daily_records_close, summary_close = run_backtest(
        panel, execution_dates, all_trade_dates, bar_index, top_n=args.top_n, mode=EXEC_CLOSE_NEXT
    )

    results = {
        EXEC_OPEN_NEXT: (daily_records_open, summary_open),
        EXEC_CLOSE_NEXT: (daily_records_close, summary_close),
    }
    markdown = build_comparison_markdown(
        results,
        data_source=data_source,
        top_n=args.top_n,
        backtest_days=args.days,
    )
    output.write_text(markdown, encoding="utf-8")
    print(markdown)
    print(f"\n已写入: {output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

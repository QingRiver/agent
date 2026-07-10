from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

from app.config import get_settings
from app.services.tushare_client import TushareClient
from strategies._paths import LOCAL_REPORT_DIR, resolve_bars_dir

VOL_MA_WINDOW = 120
VOL_SPIKE_RATIO = 3.0
WEEK_TRADE_DAYS = 5
MONTH_TRADE_DAYS = 20
MAX_MONTH_RETURN = 0.5
MAOBV_WINDOW = 30
MIN_AVG_DAILY_AMOUNT = 1_000_000_000  # 10 亿元
LOT_SIZE = 100  # Tushare vol 单位为手，1 手 = 100 股


def fname_to_ts_code(stem: str) -> str:
    code, suffix = stem.rsplit("_", 1)
    return f"{code.upper()}.{suffix.upper()}"


def load_name_map(client: TushareClient) -> dict[str, str]:
    rows = client.call("stock_basic", {"list_status": "L"}, "ts_code,name")
    return {str(r["ts_code"]): str(r.get("name") or "") for r in rows if r.get("ts_code")}


def calc_obv(df: pd.DataFrame) -> pd.Series:
    chg = df["close"].diff()
    direction = pd.Series(0.0, index=df.index)
    direction[chg > 0] = 1.0
    direction[chg < 0] = -1.0
    return (direction * df["volume"]).cumsum()


def screen_symbol(df: pd.DataFrame) -> dict | None:
    need = VOL_MA_WINDOW + MONTH_TRADE_DAYS + MAOBV_WINDOW + 1
    if len(df) < need:
        return None

    df = df.sort_values("date").reset_index(drop=True)
    df["date"] = df["date"].astype(str)
    df["vol_ma120"] = df["volume"].rolling(VOL_MA_WINDOW, min_periods=VOL_MA_WINDOW).mean().shift(1)
    df["vol_ratio"] = df["volume"] / df["vol_ma120"]
    df["amount"] = df["volume"] * LOT_SIZE * df["close"]
    df["obv"] = calc_obv(df)
    df["maobv"] = df["obv"].rolling(MAOBV_WINDOW, min_periods=MAOBV_WINDOW).mean()

    obv_now = float(df["obv"].iloc[-1])
    maobv_now = float(df["maobv"].iloc[-1])
    if not (obv_now > maobv_now):
        return None

    recent = df.tail(WEEK_TRADE_DAYS)
    spike_rows = recent[recent["vol_ratio"] >= VOL_SPIKE_RATIO]
    if spike_rows.empty:
        return None

    close_now = float(df["close"].iloc[-1])
    close_month_ago = float(df["close"].iloc[-1 - MONTH_TRADE_DAYS])
    if close_month_ago <= 0:
        return None
    month_return = close_now / close_month_ago - 1.0
    if month_return >= MAX_MONTH_RETURN:
        return None

    recent_month = df.tail(MONTH_TRADE_DAYS)
    avg_daily_amount = float(recent_month["amount"].mean())
    if avg_daily_amount < MIN_AVG_DAILY_AMOUNT:
        return None

    best = spike_rows.loc[spike_rows["vol_ratio"].idxmax()]
    return {
        "latest_date": df["date"].iloc[-1],
        "close": close_now,
        "month_return_pct": round(month_return * 100, 2),
        "avg_daily_amount_yi": round(avg_daily_amount / 1e8, 2),
        "spike_date": str(best["date"]),
        "spike_vol_ratio": round(float(best["vol_ratio"]), 2),
        "spike_volume": round(float(best["volume"]), 2),
        "vol_ma120": round(float(best["vol_ma120"]), 2),
        "obv": round(obv_now, 2),
        "maobv": round(maobv_now, 2),
    }


def build_markdown(
    rows: list[dict],
    *,
    as_of: str,
    source_dir: Path,
) -> str:
    lines = [
        "# 放量筛选结果",
        "",
        "## 策略条件",
        "",
        f"- 数据截至：**{as_of}**",
        f"- 最近 **{WEEK_TRADE_DAYS}** 个交易日内，出现过单日成交量 ≥ **{VOL_SPIKE_RATIO:.0f}** 倍前 **{VOL_MA_WINDOW}** 日成交量均值",
        f"- 最近约 **{MONTH_TRADE_DAYS}** 个交易日涨幅 **< {MAX_MONTH_RETURN * 100:.0f}%**",
        f"- 最新交易日 **OBV > MAOBV**（MAOBV 为 **{MAOBV_WINDOW}** 日 OBV 均线）",
        f"- 最近 **{MONTH_TRADE_DAYS}** 个交易日日均成交额 **> {MIN_AVG_DAILY_AMOUNT / 1e8:.0f} 亿**（成交额 ≈ 成交量 × 100 × 收盘价）",
        f"- 数据源：`{source_dir}`",
        "",
        f"## 命中标的（共 {len(rows)} 只）",
        "",
        "| 股票名称 | 股票代码 | 最新收盘 | 近月涨幅 | 近月日均成交额(亿) | 放量日期 | 量比(相对120日均量) | OBV | MAOBV |",
        "| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |",
    ]
    for row in rows:
        lines.append(
            f"| {row['name']} | {row['ts_code']} | {row['close']:.2f} | "
            f"{row['month_return_pct']:.2f}% | {row['avg_daily_amount_yi']:.2f} | {row['spike_date']} | "
            f"{row['spike_vol_ratio']:.2f}x | {row['obv']:.2f} | {row['maobv']:.2f} |"
        )
    if not rows:
        lines.append("| — | — | — | — | — | — | — | — | — |")
        lines.append("")
        lines.append("> 当前条件下无命中标的。")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="筛选近期放量且月涨幅受限的 A 股")
    parser.add_argument(
        "--source-dir",
        default=None,
        help="CSV 目录，默认 infra/qlib/source/cn_1d",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="输出 markdown 路径，默认 local_report/vol_spike_screen.md",
    )
    args = parser.parse_args()

    settings = get_settings()
    source_dir = resolve_bars_dir(settings, args.source_dir)

    output = Path(args.output) if args.output else LOCAL_REPORT_DIR / "vol_spike_screen.md"
    output.parent.mkdir(parents=True, exist_ok=True)

    client = TushareClient(settings)
    name_map = load_name_map(client)

    hits: list[dict] = []
    as_of = ""

    for path in sorted(source_dir.glob("*.csv")):
        try:
            df = pd.read_csv(path, usecols=["date", "close", "volume"])
        except (ValueError, pd.errors.EmptyDataError):
            continue
        if df.empty:
            continue

        ts_code = fname_to_ts_code(path.stem)
        metrics = screen_symbol(df)
        if metrics is None:
            continue

        as_of = max(as_of, metrics["latest_date"])
        hits.append(
            {
                "ts_code": ts_code,
                "name": name_map.get(ts_code, ts_code),
                **metrics,
            }
        )

    hits.sort(key=lambda x: (-x["spike_vol_ratio"], x["ts_code"]))
    markdown = build_markdown(hits, as_of=as_of or datetime.now().strftime("%Y%m%d"), source_dir=source_dir)
    output.write_text(markdown, encoding="utf-8")
    print(markdown)
    print(f"\n已写入: {output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

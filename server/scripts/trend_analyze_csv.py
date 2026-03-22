#!/usr/bin/env python3
"""Analyze one uploaded OHLCV CSV and print a web-ready payload JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if not (PROJECT_ROOT / "web_backend_bundle").exists():
    PROJECT_ROOT = PROJECT_ROOT.parent

BUNDLE_ROOT = PROJECT_ROOT / "web_backend_bundle"
SRC_ROOT = BUNDLE_ROOT / "src"

if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from trend_analysis.web_export import WebAnalysisExporter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Analyze one OHLCV CSV and emit a JSON payload for the GA-ML web tool."
    )
    parser.add_argument("csv_path", type=Path, help="Path to the OHLCV CSV file.")
    parser.add_argument("--date-column", default="date", help="Date column name inside the CSV.")
    parser.add_argument("--ticker", default=None, help="Optional ticker label override.")
    parser.add_argument("--window-bars", type=int, default=200, help="Number of trailing bars to emit.")
    parser.add_argument(
        "--best-params-csv",
        type=Path,
        default=BUNDLE_ROOT / "best_params" / "optimizer_best_params_by_head.csv",
        help="Best-params CSV used to build the effective config.",
    )
    parser.add_argument(
        "--use-default-config",
        action="store_true",
        help="Ignore optimizer output and use the package default config.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()

    if args.use_default_config or not args.best_params_csv.exists():
        exporter = WebAnalysisExporter()
    else:
        exporter = WebAnalysisExporter.from_best_params_csv(args.best_params_csv)

    payload, _chart_df = exporter.build_payload_from_csv(
        csv_path=args.csv_path,
        date_column=args.date_column,
        ticker=args.ticker,
        window_bars=args.window_bars,
    )
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Build js/data/figures/*.json from the Chart.js figures already digitized on the
MIL-HDBK-5 chapter pages.

Each figure on a chapter page is a <div class="hdbk-figure"> holding the canvas,
its buttons, and an inline <script> that declares the digitized point arrays and
calls HdbkUtil.makeMultiLine (or HdbkCharts.makeLine).  This pulls the series
data and axis labels out of that script so the design-allowables page can render
the same charts for whichever alloy the user has selected.

Figures are tied to alloys by handbook section number rather than by reading the
caption: figure 3.6.2.2.1(a) and table 3.6.2.0(b) share the section prefix
"3.6.2", and that section is 6061.  The section numbering is the handbook's own
grouping, so it needs no guessing.

Output is one file per section prefix, plus an index, so the lookup page fetches
only the figures for the alloy in front of it.

Offline build tool - requires beautifulsoup4.  Run extract-allowables.py first.

    python tools/extract-figures.py
"""

import glob
import io
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("beautifulsoup4 required:  pip install beautifulsoup4")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jsliteral import Ref, parse_at, read_args        # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALLOWABLES = os.path.join(ROOT, "js", "data", "design-allowables.json")
OUTDIR = os.path.join(ROOT, "js", "data", "figures")
INDEX = os.path.join(ROOT, "js", "data", "design-figures.json")
TABLE_PAGES = os.path.join(ROOT, "js", "data", "table-pages.json")
FIGURE_PAGES = os.path.join(ROOT, "js", "data", "figure-pages.json")

VAR_RE = re.compile(r"\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*(\[)")
CALL_RE = re.compile(r"(HdbkUtil\.makeMultiLine|HdbkCharts\.makeLine)\s*\(")


def txt(node):
    n = BeautifulSoup(str(node), "html.parser")
    s = n.get_text().replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def section_prefix(num):
    """'3.6.2.2.1a' -> '3.6.2'   '2.3.1.0' -> '2.3.1'"""
    parts = re.findall(r"\d+", num or "")
    return ".".join(parts[:3]) if len(parts) >= 3 else None


# Some axis and series labels are typeset with unicode subscripts (Fₛᵤ), so
# fold those back to plain letters before looking for property names.
SUBSCRIPTS = {
    "ₜ": "t", "ᵤ": "u", "ᵧ": "y", "ₛ": "s", "ᵣ": "r", "ₑ": "e", "ᵥ": "v",
    "ₐ": "a", "ₒ": "o", "ₓ": "x", "ᵇ": "b", "ᶜ": "c",
    "ᵗ": "t", "ᵘ": "u", "ʸ": "y", "ˢ": "s", "ʳ": "r", "ᵉ": "e",
}

PROP_PATTERNS = [
    (r"f\s*bru", "Fbru"), (r"f\s*bry", "Fbry"),
    (r"f\s*tu", "Ftu"), (r"f\s*ty", "Fty"),
    (r"f\s*cy", "Fcy"), (r"f\s*su", "Fsu"),
    (r"\bec\b", "Ec"), (r"\be\b", "E"),
]

EXPOSURE_RE = re.compile(r"(½|1\s*/\s*2|[\d,]+(?:\.\d+)?)\s*(?:hour|hr)", re.I)


def fold(s):
    return "".join(SUBSCRIPTS.get(ch, ch) for ch in (s or "")).lower()


def props_in(text):
    """Property symbols named in an axis or series label, in reading order."""
    out = []
    for pat, name in PROP_PATTERNS:
        m = re.search(pat, text)
        if m and name not in out:
            out.append((m.start(), name))
    return [n for _, n in sorted(out)]


def parse_exposure(label):
    """'1/2 hour' -> 0.5, '1,000 hours' -> 1000.0; None when not a time."""
    m = EXPOSURE_RE.search(label or "")
    if not m:
        return None
    tok = m.group(1).replace(",", "").replace(" ", "")
    if tok == "½" or tok == "1/2":
        return 0.5
    try:
        return float(tok)
    except ValueError:
        return None


def derate_info(caption, opts, series):
    """Describe how a temperature chart derates a room-temperature property.

    Returns None for charts that are not knockdowns -- thermal expansion,
    conductivity, specific heat, and the curves plotted in absolute ksi, none of
    which can be applied to a table value as a factor.
    """
    if "emperature" not in (opts.get("xLabel") or ""):
        return None

    y = fold(opts.get("yLabel") or "")
    cap = caption or ""

    # "Effect of temperature on ..." is the property AT that temperature;
    # "Effect of exposure at elevated temperatures on the room-temperature ..."
    # is what is left after being held hot and cooled back down. Different
    # questions, so they are labelled and never mixed.
    kind = "exposure" if re.search(r"effect of exposure", cap, re.I) else "temperature"

    # A ratio axis always says what it is a percentage *of*: "Percentage of
    # room-temperature Ftu", "Percent Ftu at Room Temperature". An axis reading
    # "Elongation, percent" uses percent as the unit of an absolute value, so
    # testing for the word alone would misread it as a knockdown factor.
    is_ratio = "percent" in y and "room" in y
    if is_ratio:
        mode = "percent"
        chart_props = props_in(y)
        if not chart_props:
            if "elongation" in y:
                chart_props = ["elong"]
            elif "bearing strength" in y:
                chart_props = ["Fbru", "Fbry"]
            elif "modul" in y:
                chart_props = ["E", "Ec"]
    elif re.match(r"^\s*elongation\b", y):
        mode, chart_props = "absolute", ["elong"]
    else:
        return None

    out = []
    for s in series:
        label = s.get("label") or ""
        sp = props_in(fold(label))
        out.append({
            "label": label,
            "props": sp or chart_props,
            "hours": parse_exposure(label),
        })

    if not any(s["props"] for s in out):
        return None
    return {"kind": kind, "mode": mode, "series": out}


def round_pts(pts):
    """Trim digitizer precision; 3 decimals is well past chart resolution and
    roughly halves the payload."""
    out = []
    for p in pts:
        if isinstance(p, dict) and "x" in p and "y" in p:
            out.append({"x": round(float(p["x"]), 3), "y": round(float(p["y"]), 3)})
    return out


def parse_script(src, caption=""):
    """Pull the point arrays and chart calls out of one figure's inline script."""
    # Declared point arrays: var d1=[{x:..,y:..}, ...]
    variables = {}
    for m in VAR_RE.finditer(src):
        try:
            val, _ = parse_at(src, m.start(2))
        except Exception:
            continue
        if isinstance(val, list):
            variables[m.group(1)] = val

    charts = []
    for m in CALL_RE.finditer(src):
        try:
            args, _ = read_args(src, m.end() - 1)
        except Exception:
            continue
        if len(args) < 2 or not isinstance(args[0], str):
            continue
        canvas = args[0]
        opts = args[2] if len(args) > 2 and isinstance(args[2], dict) else {}

        series = []
        if m.group(1).endswith("makeMultiLine"):
            if not isinstance(args[1], list):
                continue
            for d in args[1]:
                if not isinstance(d, dict):
                    continue
                data = d.get("data")
                if isinstance(data, Ref):
                    data = variables.get(str(data))
                if not isinstance(data, list):
                    continue
                s = {"label": d.get("label"), "data": round_pts(data)}
                if d.get("interp"):
                    s["interp"] = d["interp"]
                if d.get("step") is not None:
                    s["step"] = d["step"]
                if d.get("ppd") is not None:
                    s["ppd"] = d["ppd"]
                if d.get("color"):
                    s["color"] = d["color"]
                series.append(s)
        else:                                    # HdbkCharts.makeLine
            data = args[1]
            if isinstance(data, Ref):
                data = variables.get(str(data))
            if not isinstance(data, list):
                continue
            series.append({"label": opts.get("label"), "data": round_pts(data)})

        if not series or not any(s["data"] for s in series):
            continue

        keep = {k: v for k, v in opts.items()
                if k in ("xLabel", "yLabel", "xMin", "xMax", "yMin", "yMax",
                         "xLog", "yLog", "tension")}
        chart = {"canvas": canvas, "series": series, "opts": keep}
        d = derate_info(caption, keep, series)
        if d:
            chart["derate"] = d
        charts.append(chart)

    return charts


def main():
    if not os.path.exists(ALLOWABLES):
        sys.exit("run tools/extract-allowables.py first")

    allow = json.load(io.open(ALLOWABLES, encoding="utf-8"))["entries"]

    # The site already publishes an id -> handbook page map for every table and
    # figure; prefer it over the "Open this page" link, which is not present on
    # every block.
    def load_map(path):
        try:
            return json.load(io.open(path, encoding="utf-8"))
        except (IOError, ValueError):
            return {}
    table_pages = load_map(TABLE_PAGES)
    figure_pages = load_map(FIGURE_PAGES)

    # section prefix -> alloys published in that section, and the reverse
    sec_alloys = {}
    for e in allow:
        p = section_prefix(e["table"])
        if p and e["alloy"]:
            sec_alloys.setdefault(p, set()).add(e["alloy"])

    sections = {}
    tables = {}
    stats = {"blocks": 0, "with_chart": 0, "orphan": 0, "no_chart": 0,
             "tables": 0}

    for path in sorted(glob.glob(os.path.join(ROOT, "Chapter*.html"))):
        page = os.path.basename(path)
        with io.open(path, encoding="utf-8") as fh:
            soup = BeautifulSoup(fh.read(), "html.parser")

        # The design-property tables themselves, carried across as markup so the
        # lookup page can show the whole handbook table behind a result rather
        # than only the one column that matched.
        for wrap in soup.find_all("div", class_="hdbk-table-wrap"):
            tbl = wrap.find("table", class_="hdbk-table")
            if not tbl:
                continue
            tid = (wrap.get("id") or "").replace("table-", "")
            # Temper-index tables are the site's own navigation aids, not
            # handbook design tables.
            if "temper" in tid.lower() and "index" in tid.lower():
                continue
            prefix = section_prefix(tid)
            if not prefix or prefix not in sec_alloys:
                continue
            cap = tbl.find("caption")
            pdf_page = None
            sib = wrap.find_next_sibling()
            if sib is not None and hasattr(sib, "find"):
                a = sib.find("a", class_="hdbk-source-link")
                if a and "#page=" in (a.get("href") or ""):
                    pdf_page = int(a["href"].split("#page=")[1])
            if pdf_page is None:
                pdf_page = table_pages.get(tid)
            stats["tables"] += 1
            tables.setdefault(prefix, []).append({
                "id": tid,
                "caption": txt(cap) if cap else "",
                "page": page,
                "anchor": "table-" + tid,
                "pdfPage": pdf_page,
                "html": str(tbl),
            })

        for div in soup.find_all("div", class_="hdbk-figure"):
            stats["blocks"] += 1
            fid = (div.get("id") or "").replace("fig-", "")
            prefix = section_prefix(fid)

            # The caption is needed before parsing: it is what separates an
            # at-temperature knockdown from an after-exposure one.
            cap_el = div.find("p", class_="fig-caption") or \
                div.find("figcaption", class_="ref-fig-label")
            caption = txt(cap_el) if cap_el else ""

            script = div.find("script")
            charts = parse_script(script.string or "", caption) if script and script.string else []
            if not charts:
                stats["no_chart"] += 1
                continue
            stats["with_chart"] += 1

            if not prefix or prefix not in sec_alloys:
                stats["orphan"] += 1
                continue

            pdf_page = None
            a = div.find("a", class_="hdbk-source-link")
            if a and "#page=" in (a.get("href") or ""):
                pdf_page = int(a["href"].split("#page=")[1])

            # Chapters that keep the original scanned figure link its image from
            # the Download / Open-in-new-tab buttons.
            image = None
            for link in div.find_all("a", href=True):
                if link["href"].startswith("img/"):
                    image = link["href"]
                    break

            sections.setdefault(prefix, []).append({
                "id": fid,
                "caption": caption,
                "page": page,
                "anchor": "fig-" + fid,
                "pdfPage": pdf_page,
                "image": image,
                "charts": charts,
            })

    # ── write one file per section, plus the index ────────────────────────
    if os.path.isdir(OUTDIR):
        shutil.rmtree(OUTDIR)
    os.makedirs(OUTDIR)

    index = {}
    total_bytes = 0
    for prefix in sorted(set(sections) | set(tables)):
        figs = sections.get(prefix, [])
        tbls = tables.get(prefix, [])
        figs.sort(key=lambda f: [int(n) for n in re.findall(r"\d+", f["id"])] or [0])
        tbls.sort(key=lambda t: [int(n) for n in re.findall(r"\d+", t["id"])] or [0])
        fname = prefix + ".json"
        with io.open(os.path.join(OUTDIR, fname), "w", encoding="utf-8") as fh:
            json.dump({"section": prefix, "figures": figs, "tables": tbls}, fh,
                      separators=(",", ":"), ensure_ascii=False)
        total_bytes += os.path.getsize(os.path.join(OUTDIR, fname))
        index[prefix] = {
            "file": fname,
            "alloys": sorted(sec_alloys.get(prefix, [])),
            "count": len(figs),
            "tables": len(tbls),
        }

    alloy_sections = {}
    for prefix, meta in index.items():
        for alloy in meta["alloys"]:
            alloy_sections.setdefault(alloy, []).append(prefix)

    with io.open(INDEX, "w", encoding="utf-8") as fh:
        json.dump({
            "meta": {
                "source": "MIL-HDBK-5J",
                "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "sections": len(index),
                "figures": sum(m["count"] for m in index.values()),
                "note": "Generated by tools/extract-figures.py. Do not edit.",
            },
            "sections": index,
            "byAlloy": {k: sorted(v) for k, v in alloy_sections.items()},
        }, fh, separators=(",", ":"), ensure_ascii=False)

    print("figure blocks seen : %d" % stats["blocks"])
    print("  with a chart     : %d" % stats["with_chart"])
    print("  image-only       : %d" % stats["no_chart"])
    print("  no matching table: %d" % stats["orphan"])
    print("sections written   : %d" % len(index))
    print("figures written    : %d" % sum(m["count"] for m in index.values()))
    print("tables written     : %d" % sum(m["tables"] for m in index.values()))
    print("alloys covered     : %d" % len(alloy_sections))
    print("payload            : %.0f KB across %d files (largest %.0f KB)"
          % (total_bytes / 1024.0, len(index),
             max(os.path.getsize(os.path.join(OUTDIR, m["file"]))
                 for m in index.values()) / 1024.0))


if __name__ == "__main__":
    main()

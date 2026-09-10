#!/usr/bin/env python3
"""
Build js/data/design-allowables.json from the MIL-HDBK-5 design-property tables
that are already digitized as <table class="hdbk-table"> markup on the Chapter
pages.

Each table is a matrix: the <thead> rows (Specification / Form / Temper /
Thickness / Basis) describe the columns, and the <tbody> rows carry one value
per column for each mechanical or physical property.  This script transposes
that into one flat record per column, which is the shape the lookup page wants.

Offline build tool - requires beautifulsoup4.  Not shipped to the browser.

    python tools/extract-allowables.py
"""

import collections
import glob
import io
import json
import os
import re
import sys
from datetime import datetime, timezone

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("beautifulsoup4 required:  pip install beautifulsoup4")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "js", "data", "design-allowables.json")

# Header rows we understand.  The aluminium/magnesium tables are keyed by
# Specification / Form / Temper / Thickness / Basis; the steel tables drop the
# basis row and key by Alloy / Condition / Thickness or diameter instead.
HEADER_KEYS = {
    "specification": "spec",
    "form": "form",
    "temper": "temper",
    "condition": "temper",
    "heat treatment": "temper",
    "alloy": "alloy",
    "thickness in.": "thickness",
    "thickness": "thickness",
    "thickness or diameter in.": "thickness",
    "thickness or diameter": "thickness",
    "diameter in.": "thickness",
    "diameter": "thickness",
    "basis": "basis",
}

# Property-group labels -> canonical key.  Matched against the label text with
# punctuation, footnote markers and units stripped.
PROP_KEYS = {
    "ftu": "Ftu",
    "fty": "Fty",
    "fcy": "Fcy",
    "fsu": "Fsu",
    "fbru": "Fbru",
    "fbry": "Fbry",
    "e": "E",
    "ec": "Ec",
    "g": "G",
    "u": "mu",
    "w": "density",
}

# Sub-row labels under a property group.
GRAIN = {"l": "L", "lt": "LT", "st": "ST"}
ED_RE = re.compile(r"e\s*/\s*d\s*=\s*([\d.]+)")

NULLS = {"", "...", "…", "·", "···", "-", "—", "n/a"}


def txt(node):
    """Visible text with entities resolved, footnote <sup> markers dropped."""
    n = BeautifulSoup(str(node), "html.parser")
    for sup in n.find_all("sup"):
        sup.decompose()
    s = n.get_text().replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def norm_label(s):
    """Reduce a property label to a bare comparable token."""
    s = s.lower()
    s = s.split(",")[0]                 # drop ", ksi" / ", percent (S-basis)"
    s = s.replace("μ", "u").replace("ω", "w")
    s = re.sub(r"[^a-z0-9/=. ]", "", s)
    return s.strip()


def prop_key(label):
    """Canonical property key for a row/group label.

    Elongation is printed as 'e, percent (S-basis)'. Everything after the first
    comma is units, so the usual normalisation reduces that to a bare 'e' --
    which is also the label of the tensile modulus. Disambiguate on the units
    before falling back to the token lookup.
    """
    low = label.lower()
    if re.match(r"^\s*e\b", low) and ("percent" in low or "elong" in low):
        return "elong"
    return PROP_KEYS.get(norm_label(label))


def num(s):
    """Parse a table value; returns float, or None when the cell is not a value.

    Cells are either a number, the '···' placeholder, or a cross-reference such
    as 'See Table 3.2.3.0(d)'. Any letter means it is prose, not a value -- a
    cross-reference must not be mined for the first number it happens to
    contain, which would silently yield E = 3.2 for aluminium.
    """
    s = s.strip().strip("()")
    if s.lower() in NULLS or not re.search(r"\d", s):
        return None
    if re.search(r"[A-Za-z]", s):
        return None
    m = re.fullmatch(r"-?\d+(?:\.\d+)?", s.replace(",", "").strip())
    return float(m.group()) if m else None


def expand(cells, ncols):
    """Expand a header/body row's colspans into exactly ncols entries."""
    out = []
    for c in cells:
        span = int(c.get("colspan", 1) or 1)
        out.extend([txt(c)] * span)
    if len(out) < ncols:
        out.extend([""] * (ncols - len(out)))
    return out[:ncols]


def parse_thickness(raw):
    """0.010-0.128 -> {min, max}; also handles 'Over 0.5' and 'Up to 0.25'."""
    r = raw.replace("–", "-").replace("—", "-").strip()
    m = re.match(r"^([\d.]+)\s*-\s*([\d.]+)$", r)
    if m:
        return {"min": float(m.group(1)), "max": float(m.group(2)), "raw": raw}
    m = re.match(r"^(?:over|above|greater than|>=|>|≥)\s*([\d.]+)$", r, re.I)
    if m:
        return {"min": float(m.group(1)), "max": None, "raw": raw}
    m = re.match(r"^(?:up to|thru|through|<=|<|≤)\s*([\d.]+)$", r, re.I)
    if m:
        return {"min": None, "max": float(m.group(1)), "raw": raw}
    m = re.match(r"^([\d.]+)$", r)
    if m:
        return {"min": float(m.group(1)), "max": float(m.group(1)), "raw": raw}
    return {"min": None, "max": None, "raw": raw} if raw else None


def form_group(raw):
    """Collapse the many spellings of a product form into one filter value.

    The handbook writes the same form a dozen ways ('Die forging', 'Die
    forgings', 'Hand Forging'), so the dropdown groups on this while the result
    still reports the table's own wording.
    """
    if not raw:
        return None
    s = raw.lower()
    if "cast" in s:
        return "Casting"
    if "forg" in s:
        return "Forging"
    if "extru" in s:
        return "Extrusion"
    if "tub" in s:
        return "Tubing"
    if "wire" in s:
        return "Wire"
    has_sheet, has_plate = "sheet" in s or "strip" in s, "plate" in s
    if has_sheet and has_plate:
        return "Sheet & Plate"
    if has_sheet:
        return "Sheet"
    if has_plate:
        return "Plate"
    if "bar" in s or "rod" in s or "shape" in s:
        return "Bar, Rod & Shapes"
    if "wrought" in s:
        return "All wrought forms"
    return raw


# Product-form wording that follows the alloy name in a table caption.
FORM_WORDS = (r"(?: Sheet| Plate| Bar| Rod| Extrusion| Extruded| Extrusions|"
              r" Forging| Forgings| Tubing| Tube| Die | Hand | Rolled| Drawn|"
              r" Cold-Finished| Casting| Castings| Wire| Strip| Shapes)")


def alloy_from_caption(cap):
    """Pull the alloy name out of the table caption.

    Most captions read "... Properties of 2024 Aluminum Alloy Sheet", but the
    stainless sections in Chapter 2.6 write "... Properties for AM-350", and
    several spell the product form out at length ("6061 Aluminum Alloy Rolled,
    Drawn, or Cold-Finished Bar, Rod, and Shapes") -- the form has to be cut off
    or it becomes part of the alloy name.
    """
    m = re.search(r"Properties (?:of|for) (?:Bare |Clad |Alclad )?(.+?)(?:%s|$)"
                  % FORM_WORDS, cap)
    if not m:
        return None
    name = m.group(1).strip().rstrip(",")
    # "17-4PH Investment Castings" loses "Castings" above; drop the process word
    # it leaves behind so the alloy is not split in two.
    name = re.sub(r"\s+Investment$", "", name)
    return name or None


# Handbook families, used to group the alloy list. Keyed by the first two
# components of the section number; a bare chapter number is the fallback.
FAMILIES = {
    "2.2": "Carbon Steels",
    "2.3": "Low-Alloy Steels",
    "2.4": "Intermediate Alloy Steels",
    "2.5": "High-Alloy Steels",
    "2.6": "Precipitation and Transformation-Hardening Stainless Steels",
    "2.7": "Austenitic Stainless Steels",
    "2": "Steels",
    "3": "Aluminum Alloys",
    "4": "Magnesium Alloys",
}


def family_of(table_id):
    parts = re.findall(r"\d+", table_id or "")
    if len(parts) >= 2 and ".".join(parts[:2]) in FAMILIES:
        return FAMILIES[".".join(parts[:2])]
    if parts and parts[0] in FAMILIES:
        return FAMILIES[parts[0]]
    return "Other"


def section_of(table_id):
    """'3.6.2.0g' -> '3.6.2'  — the handbook groups one alloy per section."""
    parts = re.findall(r"\d+", table_id or "")
    return ".".join(parts[:3]) if len(parts) >= 3 else None


def canonicalize_alloys(entries):
    """Give every table in a section the same alloy name.

    The handbook devotes a section to one alloy but words the caption
    differently from table to table -- "7150 Plate" against "7150 Aluminum Alloy
    Extrusion", or "15-5PH Bar" against "15-5PH Stainless Steel Plate" -- which
    would otherwise scatter one material across several entries in the dropdown.
    Only caption-derived names are pooled; steel tables that name the alloy per
    column really do carry several alloys in one table and are left alone.
    """
    pools = {}
    for e in entries:
        if e.pop("_fromColumn", False) or not e["alloy"]:
            continue
        sec = section_of(e["table"])
        if sec:
            pools.setdefault(sec, []).append(e)

    renamed = 0
    for sec, group in pools.items():
        counts = collections.Counter(e["alloy"] for e in group)
        if len(counts) < 2:
            continue
        # Most common wins; a tie goes to the most descriptive (longest) name.
        best = max(counts, key=lambda a: (counts[a], len(a)))
        for e in group:
            if e["alloy"] != best:
                e["alloy"] = best
                renamed += 1
    return renamed


def clean_alloy(col_alloy, family):
    """Prefer the per-column alloy, unless that cell holds prose.

    A few steel tables put a note where the alloy name goes ("See steels listed
    in Table 2.3.0.2 for the applicable strength levels"), which must not end up
    as an entry in the alloy dropdown.
    """
    a = (col_alloy or "").strip()
    if a and len(a) <= 40 and not re.match(r"^see\b", a, re.I) \
            and "listed in" not in a.lower():
        return a
    fam = re.split(r"—|–| - |\(", family or "")[0]
    return fam.strip().rstrip(",") or None


def parse_table(tbl, page, table_id, pdf_page):
    cap_el = tbl.find("caption")
    caption = txt(cap_el) if cap_el else ""

    head = tbl.find("thead")
    body = tbl.find("tbody")
    if not head or not body:
        return [], "no thead/tbody"

    # Some tables carry the whole Specification / Form / Temper / Thickness /
    # Basis stack in the <thead>; others keep only Specification there and put
    # the rest in the first rows of the <tbody>.  Treat a row as a header row
    # wherever it sits, keyed on its own label.
    all_rows = head.find_all("tr") + body.find_all("tr")

    def header_key(tr):
        cells = tr.find_all(["th", "td"])
        if not cells or "prop-section" in (tr.get("class") or []):
            return None
        lbl = norm_label(txt(cells[0]))
        return HEADER_KEYS.get(lbl) or HEADER_KEYS.get(lbl.replace(" ", ""))

    # Where a Basis row exists it has one cell per data column and so defines the
    # column count exactly.  Steel tables have no basis row, so fall back to the
    # widest header row, which is the most granular split of the same columns.
    ncols = None
    for tr in all_rows:
        cells = tr.find_all(["th", "td"])
        if cells and norm_label(txt(cells[0])) == "basis":
            ncols = sum(int(c.get("colspan", 1) or 1) for c in cells[1:])
            break
    if not ncols:
        widths = [sum(int(c.get("colspan", 1) or 1)
                      for c in tr.find_all(["th", "td"])[1:])
                  for tr in all_rows if header_key(tr)]
        ncols = max(widths) if widths else 0
    if not ncols:
        return [], "no usable header row"

    # Column descriptors from each recognised header row.
    cols = [{} for _ in range(ncols)]
    for tr in all_rows:
        key = header_key(tr)
        if not key:
            continue
        cells = tr.find_all(["th", "td"])
        for i, v in enumerate(expand(cells[1:], ncols)):
            cols[i][key] = v

    # Walk the body, tracking the current property group.
    props = [{} for _ in range(ncols)]
    current = None
    problems = []

    for tr in body.find_all("tr"):
        cls = tr.get("class") or []
        cells = tr.find_all(["th", "td"])
        if not cells:
            continue
        if header_key(tr):            # a header row living in the tbody
            continue
        label = txt(cells[0])
        key = norm_label(label)

        if "prop-section" in cls:                    # "Mechanical Properties:"
            continue
        if "prop-group" in cls:                      # "Ftu, ksi:"
            current = prop_key(label)
            if current is None and key:
                problems.append("unknown group: " + label)
            continue

        values = expand(cells[1:], ncols)

        # A row whose first cell is itself a property name (Fsu, E, G, mu, ...)
        direct = prop_key(label)
        if direct and "td-indent" not in (cells[0].get("class") or []):
            for i, v in enumerate(values):
                n = num(v)
                if n is not None:
                    props[i][direct] = n
            current = None
            continue

        if current is None:
            continue

        # Sub-row of the current group: grain direction or e/D ratio.
        sub = GRAIN.get(key)
        if sub is None:
            m = ED_RE.search(key)
            if m:
                sub = "eD" + m.group(1)
        if sub is None:
            continue

        for i, v in enumerate(values):
            n = num(v)
            if n is not None:
                props[i].setdefault(current, {})[sub] = n

    family = alloy_from_caption(caption)
    tnum = table_id.replace("table-", "")

    entries = []
    for i, c in enumerate(cols):
        if not props[i]:
            continue
        # Steel tables name the alloy per column; aluminium tables name it once
        # in the caption and split the columns by form/temper instead.
        entries.append({
            "id": "%s#%d" % (tnum, i),
            "table": tnum,
            "anchor": table_id,
            "page": page,
            "pdfPage": pdf_page,
            "caption": caption,
            "alloy": clean_alloy(c.get("alloy"), family),
            "family": family,
            "group": family_of(tnum),
            "_fromColumn": bool((c.get("alloy") or "").strip()),
            "clad": "Clad" in caption,
            "spec": c.get("spec") or None,
            "form": c.get("form") or None,
            "formGroup": form_group(c.get("form")),
            "temper": c.get("temper") or None,
            "thickness": parse_thickness(c.get("thickness", "")),
            "basis": c.get("basis") or None,
            "props": props[i],
        })
    return entries, (problems[0] if problems else None)


def main():
    entries = []
    stats = {"tables": 0, "ok": 0, "skipped": 0}
    skipped = []

    for path in sorted(glob.glob(os.path.join(ROOT, "Chapter*.html"))):
        page = os.path.basename(path)
        with io.open(path, encoding="utf-8") as fh:
            soup = BeautifulSoup(fh.read(), "html.parser")

        for wrap in soup.find_all("div", class_="hdbk-table-wrap"):
            tbl = wrap.find("table", class_="hdbk-table")
            if not tbl:
                continue
            stats["tables"] += 1
            table_id = wrap.get("id") or ""

            # The "Open this page of MIL-HDBK-5" link that follows the table.
            pdf_page = None
            sib = wrap.find_next_sibling()
            if sib is not None and hasattr(sib, "find"):
                a = sib.find("a", class_="hdbk-source-link")
                if a and "#page=" in (a.get("href") or ""):
                    pdf_page = int(a["href"].split("#page=")[1])

            got, why = parse_table(tbl, page, table_id, pdf_page)
            if got:
                entries.extend(got)
                stats["ok"] += 1
            else:
                stats["skipped"] += 1
                skipped.append("%s %s: %s" % (page, table_id, why))

    renamed = canonicalize_alloys(entries)

    payload = {
        "meta": {
            "source": "MIL-HDBK-5J",
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "tables": stats["ok"],
            "entries": len(entries),
            "note": "Generated by tools/extract-allowables.py from the digitized "
                    "chapter tables. Do not edit by hand.",
        },
        "entries": entries,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # Compact: this file is fetched by the browser on every lookup-page load.
    with io.open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"), ensure_ascii=False)

    print("tables seen    : %d" % stats["tables"])
    print("tables parsed  : %d" % stats["ok"])
    print("tables skipped : %d" % stats["skipped"])
    print("column entries : %d" % len(entries))
    print("alloy names pooled to their section: %d" % renamed)
    print("written        : %s" % os.path.relpath(OUT, ROOT))
    for s in skipped[:15]:
        print("  skip:", s)

    audit(entries)


# Plausible envelopes for each property, used only to flag suspect numbers for
# review -- nothing is dropped or corrected automatically.
RANGES = {
    "Ftu": (8, 400), "Fty": (5, 400), "Fcy": (5, 400), "Fsu": (3, 250),
    "Fbru": (10, 900), "Fbry": (8, 700), "E": (4, 45), "Ec": (4, 45),
    "G": (1, 20), "mu": (0.2, 0.45), "density": (0.03, 0.35),
    "elong": (0.2, 60),   # cast alloys legitimately run under 1%
}


def audit(entries):
    """Report values that cannot be right, so a human can check them against the
    handbook page. Catches both extractor mistakes and typos in the transcribed
    chapter tables."""
    out_of_range, inverted = [], []

    for x in entries:
        for k, v in x["props"].items():
            lo, hi = RANGES.get(k, (None, None))
            if lo is None:
                continue
            for sub in (v.values() if isinstance(v, dict) else [v]):
                if not (lo <= sub <= hi):
                    out_of_range.append((x["id"], x["alloy"], k, sub))

        ftu, fty = x["props"].get("Ftu"), x["props"].get("Fty")
        if isinstance(ftu, dict) and isinstance(fty, dict):
            for g in ("L", "LT", "ST"):
                if g in ftu and g in fty and fty[g] > ftu[g]:
                    inverted.append((x["id"], x["alloy"], g, ftu[g], fty[g]))

    print()
    print("audit: %d values outside a plausible range, %d with Fty > Ftu"
          % (len(out_of_range), len(inverted)))
    for r in out_of_range[:10]:
        print("  range : %s  %s  %s = %s" % r)
    for r in inverted[:10]:
        print("  Fty>Ftu: %s  %s  %s  Ftu=%s Fty=%s  <- check the source table" % r)


if __name__ == "__main__":
    main()

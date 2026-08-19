"""Turn a figure dict into Chart.js chart config(s), one per distinct y-axis
so curves that share an x-axis but use different y-scales (e.g. stress vs.
tangent modulus) don't get squashed onto the same scale.
"""
from __future__ import annotations

# Same chart palette used across the KasperCalc site (see e.g. the `PAL`
# array in Chapter2.3(steel).html), matching frontend/js/curves.js's
# DATASET_COLORS. Only used as a fallback here - every dataset the frontend
# creates already sets style.color explicitly, so this only matters for
# hand-edited or otherwise legacy figure JSON missing a color.
DEFAULT_COLORS = [
    "#3a6270", "#c87941", "#5a9aaa", "#b34040", "#4a7a4a", "#7a5a8a",
    "#40a0c0", "#a08040", "#2a4a55", "#c04060", "#3a7a5a", "#806030",
]
DEFAULT_WIDTH = 3


def figure_to_chartjs(figure: dict) -> dict:
    """Build a dict of Chart.js configs keyed by axis_y id.

    Returns: {"charts": {<axis_y_id>: <chart.js config dict>, ...}}
    Each config is a scatter/line chart with calibrated_points as data,
    x axis title/scale from the dataset's axis_x, y axis title/scale from
    axis_y.
    """
    axes_by_id = {axis["axis_id"]: axis for axis in figure.get("axes", [])}
    datasets = figure.get("datasets", [])

    datasets_by_y_axis: dict[str, list[dict]] = {}
    for ds in datasets:
        datasets_by_y_axis.setdefault(ds["axis_y"], []).append(ds)

    charts = {}
    for axis_y_id, ds_group in datasets_by_y_axis.items():
        axis_y = axes_by_id.get(axis_y_id, {})
        # all datasets in a group are assumed to share the same x axis in
        # practice, but fall back to the first dataset's axis_x for the title
        axis_x_id = ds_group[0]["axis_x"]
        axis_x = axes_by_id.get(axis_x_id, {})

        chartjs_datasets = []
        for i, ds in enumerate(ds_group):
            style = ds.get("style") or {}
            color = style.get("color") or DEFAULT_COLORS[i % len(DEFAULT_COLORS)]
            points = [
                {"x": p[0], "y": p[1]}
                for p in ds.get("calibrated_points", [])
            ]
            chartjs_datasets.append({
                "label": ds.get("label", ds.get("dataset_id")),
                "data": points,
                "borderColor": color,
                "backgroundColor": color,
                "borderWidth": style.get("width") or DEFAULT_WIDTH,
                "borderDash": [6, 3] if style.get("dash") == "dash" else [],
                "showLine": True,
                "fill": False,
                "pointRadius": 2,
            })

        charts[axis_y_id] = {
            "type": "scatter",
            "data": {"datasets": chartjs_datasets},
            "options": {
                "plugins": {
                    "title": {
                        "display": True,
                        "text": f"{figure.get('figure_label', '')} — {axis_y.get('label', axis_y_id)}",
                    },
                },
                "scales": {
                    "x": {
                        "type": "linear",
                        "title": {
                            "display": True,
                            "text": _axis_title(axis_x, axis_x_id),
                        },
                    },
                    "y": {
                        "type": "logarithmic" if axis_y.get("scale") == "log" else "linear",
                        "title": {
                            "display": True,
                            "text": _axis_title(axis_y, axis_y_id),
                        },
                    },
                },
            },
        }

    return {"charts": charts}


def _axis_title(axis: dict, fallback_id: str) -> str:
    label = axis.get("label", fallback_id)
    units = axis.get("units")
    return f"{label} ({units})" if units else label

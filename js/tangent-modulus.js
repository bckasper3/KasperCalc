/**
 * tangent-modulus.js — reads a tangent modulus out of the digitized
 * MIL-HDBK-5 stress-strain figures.
 *
 * Above the proportional limit a column no longer buckles on E, it buckles on
 * the slope of the stress-strain curve at the working stress. The handbook
 * publishes that slope as a curve drawn on the same frame as the stress-strain
 * curve, sharing the stress axis, with its own scale along the top edge. That
 * is how it has been digitized, so a tangent-modulus series carries
 *
 *     x = E_t in 10^3 ksi        y = stress in ksi
 *
 * which was confirmed by checking every curve's maximum against the alloy's
 * published Young's modulus (300M reads 29.1 against a published 29.0; the
 * 5000-series aluminiums read 10.4 against 10.2).
 *
 * Reading one therefore means interpolating x from y — the opposite of the
 * usual direction, and the reason each curve is sorted on stress up front.
 *
 * This file owns nothing but the data and the lookup: no DOM, no Chart.js, no
 * page-specific assumptions. Any page that wants a tangent modulus can include
 * it on its own. Units are the handbook's throughout (ksi, 10^3 ksi); a page
 * that displays metric converts at the edge.
 *
 * Usage:
 *     TangentModulus.curves('2014 Aluminum Alloy').then(function (cs) {
 *       var r = TangentModulus.at(cs[0], 55);   // 55 ksi
 *       r.et;        // tangent modulus, 10^3 ksi
 *       r.elastic;   // still on the initial slope
 *       r.offCurve;  // past the end of the published curve
 *     });
 */
'use strict';

window.TangentModulus = (function () {
  var INDEX_URL = 'js/data/design-figures.json';
  var SECTION_URL = 'js/data/figures/';

  var index = null;
  var sectionCache = {};

  /* A host page that already loads these files for its own purposes can hand
   * over its loader so the sections are fetched and parsed once rather than
   * twice. Both members are optional and both return promises. */
  var host = null;

  function useLoader(l) { host = l || null; }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  function ensureIndex() {
    if (host && host.index) return host.index();
    if (index) return Promise.resolve(index);
    return fetchJson(INDEX_URL).then(function (j) { index = j; return j; });
  }

  function loadSection(prefix) {
    if (host && host.section) return host.section(prefix);
    if (sectionCache[prefix]) return Promise.resolve(sectionCache[prefix]);
    return fetchJson(SECTION_URL + prefix + '.json').then(function (j) {
      sectionCache[prefix] = j;
      return j;
    });
  }

  /* ── identifying the curve ───────────────────────────────────────────────
   * Two layouts occur. Some figures carry E_t on their own x axis, in which
   * case every series drawn on them is a tangent-modulus curve. The rest share
   * the stress-strain frame, where only the series labelled as the tangent
   * modulus is one and the others are strain.
   */
  function isTangentSeries(label) {
    return /tangent\s*modulus|\bTM\b/i.test(label || '');
  }

  function isExposureCurve(label) {
    return /exposure|\bhr\b|\bhour/i.test(label || '');
  }

  /**
   * Every tangent-modulus curve published for an alloy, plain curves first.
   *
   * @param {string} alloy  alloy name exactly as the figure index spells it
   * @returns {Promise<Array<Object>>} each {label, fig, points, eMax, stressMax},
   *          points being [{et, stress}] sorted on stress. eMax is the curve's
   *          own initial slope in 10^3 ksi, which is E.
   */
  function curves(alloy) {
    if (!alloy) return Promise.resolve([]);
    return ensureIndex().then(function (idx) {
      var prefixes = (idx.byAlloy && idx.byAlloy[alloy]) || [];
      if (!prefixes.length) return [];
      return Promise.all(prefixes.map(loadSection)).then(function (parts) {
        var out = [];
        parts.forEach(function (p) {
          (p.figures || []).forEach(function (fig) {
            if (!/tangent[- ]modulus/i.test(fig.caption || '')) return;
            (fig.charts || []).forEach(function (ch) {
              var axisIsEt = /tangent/i.test((ch.opts && ch.opts.xLabel) || '');
              (ch.series || []).forEach(function (sr) {
                if (!axisIsEt && !isTangentSeries(sr.label)) return;
                if (!sr.data || sr.data.length < 3) return;

                // sorted on stress, because the lookup runs stress -> E_t
                var pts = sr.data.slice()
                  .map(function (d) { return { et: d.x, stress: d.y }; })
                  .sort(function (a, b) { return a.stress - b.stress; });

                var eMax = 0;
                pts.forEach(function (d) { if (d.et > eMax) eMax = d.et; });
                if (eMax <= 0) return;

                out.push({
                  label: sr.label || 'Tangent modulus',
                  fig: fig,
                  points: pts,
                  eMax: eMax,
                  stressMax: pts[pts.length - 1].stress
                });
              });
            });
          });
        });

        /* Plain room-temperature curves first. A figure showing the effect of
           a 1000-hour bake answers a specialised question; someone asking for
           a tangent modulus almost always wants the ordinary one. */
        out.sort(function (a, b) {
          return (isExposureCurve(a.label) ? 1 : 0) -
                 (isExposureCurve(b.label) ? 1 : 0);
        });
        return out;
      });
    }).catch(function () { return []; });
  }

  /**
   * Tangent modulus at a working stress.
   *
   * Below the curve's first point the material is still elastic, so E_t is the
   * initial slope — the curve's own maximum. Above the last point the handbook
   * stops and so does this: extrapolating past the top of a measured curve
   * into the collapse region would invent numbers exactly where they matter
   * most, so the last published value comes back with offCurve set and the
   * caller decides what to do about it.
   *
   * @param {Object} curve       one entry from curves()
   * @param {number} stressKsi   working stress, ksi
   * @returns {Object|null} {et, elastic, offCurve}, et in 10^3 ksi
   */
  function at(curve, stressKsi) {
    if (!curve || !curve.points || !curve.points.length) return null;
    var p = curve.points;

    if (stressKsi <= p[0].stress) {
      return { et: curve.eMax, elastic: true, offCurve: false };
    }
    if (stressKsi > p[p.length - 1].stress) {
      return { et: p[p.length - 1].et, elastic: false, offCurve: true };
    }
    for (var i = 0; i < p.length - 1; i++) {
      var a = p[i], b = p[i + 1];
      if (stressKsi >= a.stress && stressKsi <= b.stress) {
        var t = (b.stress === a.stress) ? 0
              : (stressKsi - a.stress) / (b.stress - a.stress);
        return { et: a.et + t * (b.et - a.et), elastic: false, offCurve: false };
      }
    }
    return { et: p[p.length - 1].et, elastic: false, offCurve: true };
  }

  /**
   * Alloys with at least one tangent-modulus curve, so a page can offer only
   * the materials it can actually answer for. Walks the figure files once and
   * caches them, so the pass costs the same as loading the figures normally.
   * @returns {Promise<string[]>} sorted alloy names
   */
  function alloys() {
    return ensureIndex().then(function (idx) {
      var names = Object.keys(idx.byAlloy || {});
      return names.reduce(function (chain, name) {
        return chain.then(function (acc) {
          return curves(name).then(function (cs) {
            if (cs.length) acc.push(name);
            return acc;
          });
        });
      }, Promise.resolve([])).then(function (acc) { return acc.sort(); });
    }).catch(function () { return []; });
  }

  return {
    curves: curves,
    at: at,
    alloys: alloys,
    isTangentSeries: isTangentSeries,
    useLoader: useLoader
  };
})();

"""
compress_bins.py — gzip-compress all .bin files from coolprop_data_v*/bin/
                   into a parallel coolprop_data_v*/gz/ tree.

Output layout (mirrors the bin/ tree):
  coolprop_data_v7.2.0/gz/<fluid>/meta.bin.gz
  coolprop_data_v7.2.0/gz/<fluid>/saturation.bin.gz
  coolprop_data_v7.2.0/gz/<fluid>/grid/grid_band_000_*.bin.gz
  ...

Usage:
  python compress_bins.py               # compress everything (skip existing)
  python compress_bins.py --force       # re-compress everything
  python compress_bins.py --workers 8   # override worker count (default: cpu_count)
  python compress_bins.py --level 6     # gzip level 1-9 (default: 9)
"""

import argparse
import gzip
import glob
import math
import multiprocessing
import os
import pathlib
import shutil
import sys
import time

# ── defaults ──────────────────────────────────────────────────────────────────
DEFAULT_LEVEL   = 9          # maximum compression
DEFAULT_WORKERS = None       # None → multiprocessing.cpu_count()
BIN_GLOB        = "coolprop_data_v*/bin/**/*.bin"


# ── worker (runs in subprocess) ───────────────────────────────────────────────

def _compress_one(args):
    """
    Compress a single .bin file to its .gz counterpart.
    Returns (src_path, gz_path, src_bytes, gz_bytes, skipped, error_msg).
    """
    src_path, gz_path, level, force = args
    src_path = pathlib.Path(src_path)
    gz_path  = pathlib.Path(gz_path)

    # skip if already up-to-date
    if not force and gz_path.exists():
        try:
            if gz_path.stat().st_mtime >= src_path.stat().st_mtime:
                src_sz = src_path.stat().st_size
                gz_sz  = gz_path.stat().st_size
                return (str(src_path), str(gz_path), src_sz, gz_sz, True, None)
        except OSError:
            pass  # fall through and recompress

    gz_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        src_sz = src_path.stat().st_size
        with open(src_path, 'rb') as f_in:
            data = f_in.read()
        with gzip.open(gz_path, 'wb', compresslevel=level) as f_out:
            f_out.write(data)
        gz_sz = gz_path.stat().st_size
        return (str(src_path), str(gz_path), src_sz, gz_sz, False, None)
    except Exception as e:
        return (str(src_path), str(gz_path), 0, 0, False, str(e))


# ── path helper ───────────────────────────────────────────────────────────────

def bin_to_gz_path(bin_path: pathlib.Path) -> pathlib.Path:
    """
    Replace the first 'bin' component (after coolprop_data_v*) with 'gz'
    and append '.gz' to the filename.

    Example:
      coolprop_data_v7.2.0/bin/Water/grid/grid_band_000_101325Pa_123456Pa.bin
      → coolprop_data_v7.2.0/gz/Water/grid/grid_band_000_101325Pa_123456Pa.bin.gz
    """
    parts = list(bin_path.parts)
    # Find the 'bin' segment that lives directly under coolprop_data_v*
    for i, part in enumerate(parts):
        if part == 'bin' and i > 0 and parts[i-1].startswith('coolprop_data_v'):
            parts[i] = 'gz'
            break
    gz_name = parts[-1] + '.gz'
    parts[-1] = gz_name
    return pathlib.Path(*parts)


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Gzip-compress CoolProp .bin files for browser use.')
    parser.add_argument('--force',   action='store_true', help='Re-compress even if .gz is newer than .bin')
    parser.add_argument('--workers', type=int, default=DEFAULT_WORKERS, metavar='N',
                        help='Parallel worker processes (default: cpu count)')
    parser.add_argument('--level',   type=int, default=DEFAULT_LEVEL,   metavar='L',
                        choices=range(1, 10),
                        help='Gzip compression level 1-9 (default: 9)')
    parser.add_argument('--dry-run', action='store_true', help='List files without compressing')
    args = parser.parse_args()

    workers = args.workers or multiprocessing.cpu_count()

    # ── discover .bin files ───────────────────────────────────────────────────
    cwd      = pathlib.Path.cwd()
    bin_files = sorted(cwd.glob(BIN_GLOB))

    if not bin_files:
        # also try relative to script location
        here      = pathlib.Path(__file__).parent
        bin_files = sorted(here.glob(BIN_GLOB))

    if not bin_files:
        print("No .bin files found matching:", BIN_GLOB)
        print("Run this script from the directory that contains coolprop_data_v*/")
        sys.exit(1)

    total_files = len(bin_files)
    print(f"Found {total_files:,} .bin files")
    print(f"Compression level : {args.level}")
    print(f"Workers           : {workers}")
    print(f"Force recompress  : {args.force}")
    print()

    if args.dry_run:
        for p in bin_files[:20]:
            gz = bin_to_gz_path(p)
            print(f"  {p.relative_to(cwd)}  →  {gz.relative_to(cwd)}")
        if total_files > 20:
            print(f"  ... ({total_files - 20} more)")
        return

    # ── build work list ───────────────────────────────────────────────────────
    work = [
        (str(p), str(bin_to_gz_path(p)), args.level, args.force)
        for p in bin_files
    ]

    # ── run compression pool ──────────────────────────────────────────────────
    t0             = time.perf_counter()
    n_done         = 0
    n_skipped      = 0
    n_errors       = 0
    total_src_bytes = 0
    total_gz_bytes  = 0
    errors         = []

    with multiprocessing.Pool(processes=workers) as pool:
        for result in pool.imap_unordered(_compress_one, work, chunksize=4):
            src_path, gz_path, src_sz, gz_sz, skipped, err = result
            n_done += 1
            if err:
                n_errors += 1
                errors.append((src_path, err))
            elif skipped:
                n_skipped += 1
                total_src_bytes += src_sz
                total_gz_bytes  += gz_sz
            else:
                total_src_bytes += src_sz
                total_gz_bytes  += gz_sz

            # progress line
            pct = 100 * n_done / total_files
            bar_len = 30
            filled  = int(bar_len * n_done / total_files)
            bar     = '█' * filled + '░' * (bar_len - filled)
            print(f"\r  [{bar}] {pct:5.1f}%  {n_done:,}/{total_files:,}  skip={n_skipped}  err={n_errors}",
                  end='', flush=True)

    elapsed = time.perf_counter() - t0
    print()  # newline after progress bar

    # ── report ────────────────────────────────────────────────────────────────
    compressed_files = n_done - n_skipped - n_errors

    def fmt_mb(b):
        return f"{b / 1_048_576:.1f} MB"

    saved = total_src_bytes - total_gz_bytes
    ratio = (total_gz_bytes / total_src_bytes * 100) if total_src_bytes else 0

    print()
    print("=" * 58)
    print("  COMPRESSION COMPLETE")
    print("=" * 58)
    print(f"  Files processed   : {compressed_files:,}")
    print(f"  Files skipped     : {n_skipped:,}  (already up-to-date)")
    print(f"  Errors            : {n_errors}")
    print(f"  Original size     : {fmt_mb(total_src_bytes)}")
    print(f"  Compressed size   : {fmt_mb(total_gz_bytes)}")
    print(f"  Space saved       : {fmt_mb(saved)}  ({100 - ratio:.1f}% reduction)")
    print(f"  Elapsed           : {elapsed:.1f} s  ({elapsed/max(compressed_files,1)*1000:.0f} ms/file avg)")
    print("=" * 58)

    if errors:
        print(f"\n  {n_errors} file(s) failed:")
        for path, msg in errors[:10]:
            print(f"    {path}")
            print(f"      {msg}")
        if len(errors) > 10:
            print(f"    ... ({len(errors) - 10} more)")

    # ── JavaScript decompression snippet ─────────────────────────────────────
    print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  JAVASCRIPT DECOMPRESSION  (DecompressionStream — no libs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Fetch a gzip-compressed .bin.gz file and return its raw
   * ArrayBuffer, ready for DataView / Float32Array parsing.
   *
   * Requires: Chromium 80+, Firefox 113+, Safari 16.4+
   *           (all support DecompressionStream natively)
   */
  async function fetchBinGz(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const ds = new DecompressionStream('gzip');
    const decompressed = response.body.pipeThrough(ds);
    return await new Response(decompressed).arrayBuffer();
  }

  // Example — read a grid band:
  const GZ_ROOT = 'coolprop_data_v7.2.0/gz/';

  async function loadGridBand(fluidSafe, bandFile) {
    const url = `${GZ_ROOT}${fluidSafe}/grid/${bandFile}.gz`;
    const buf = await fetchBinGz(url);
    // Each record: 11× Float32 (T,P,rho,cp,cv,h,s,u,visc,cond,prandtl) + 1× Uint8 (phase)
    const RECORD_BYTES = 11 * 4 + 1;   // 45 bytes
    const nRows = buf.byteLength / RECORD_BYTES;
    const view  = new DataView(buf);
    const rows  = [];
    const FIELDS = ['T','P','rho','cp','cv','h','s','u','visc','cond','prandtl'];
    for (let i = 0; i < nRows; i++) {
      const base = i * RECORD_BYTES;
      const row  = {};
      FIELDS.forEach((f, j) => {
        row[f] = view.getFloat32(base + j * 4, true);   // little-endian
      });
      row.phase = view.getUint8(base + 44);
      rows.push(row);
    }
    return rows;
  }

  // Example — read the saturation curve:
  async function loadSaturation(fluidSafe) {
    const url = `${GZ_ROOT}${fluidSafe}/saturation.bin.gz`;
    const buf = await fetchBinGz(url);
    // Each record: 14× Float32 + 1× Uint8 phase flag  (63 bytes)
    const RECORD_BYTES = 14 * 4 + 1;
    const nRows = buf.byteLength / RECORD_BYTES;
    const view  = new DataView(buf);
    const rows  = [];
    const FIELDS = ['T','P',
      'liq_density','liq_cp','liq_enthalpy','liq_entropy',
      'liq_viscosity','liq_conductivity',
      'vap_density','vap_cp','vap_enthalpy','vap_entropy',
      'vap_viscosity','vap_conductivity'];
    for (let i = 0; i < nRows; i++) {
      const base = i * RECORD_BYTES;
      const row  = {};
      FIELDS.forEach((f, j) => {
        row[f] = view.getFloat32(base + j * 4, true);
      });
      row.phase = view.getUint8(base + 56);
      rows.push(row);
    }
    return rows;
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")


if __name__ == '__main__':
    main()

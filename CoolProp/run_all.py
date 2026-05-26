"""
run_all.py — run the full pipeline for every fluid in parallel.

Reads  : CoolProp/fluid_list_callable.txt
Skips  : fluids already marked 'complete' in general/progress.json
Runs   : fluid_pipeline.run_fluid(fluid) per CPU core
Writes : general/progress.json, general/fluid_index.json, general/errors.json
"""

import datetime
import json
import multiprocessing as mp
import os
import sys

import fluid_pipeline

FLUID_LIST = 'CoolProp/fluid_list_callable.txt'
ROOT       = f"coolprop_data_v{fluid_pipeline.COOLPROP_VERSION}"

PROGRESS_PATH = f"{ROOT}/general/progress.json"
INDEX_PATH    = f"{ROOT}/general/fluid_index.json"
ERRORS_PATH   = f"{ROOT}/general/errors.json"


def load_json(path):
    with open(path) as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def main():
    # ── load fluid list ───────────────────────────────────────────────────────
    if not os.path.exists(FLUID_LIST):
        print(f"ERROR: {FLUID_LIST} not found.")
        sys.exit(1)

    with open(FLUID_LIST) as f:
        all_fluids = [line.strip() for line in f if line.strip()]

    # ── load shared state ─────────────────────────────────────────────────────
    progress    = load_json(PROGRESS_PATH)
    fluid_index = load_json(INDEX_PATH)
    errors      = load_json(ERRORS_PATH)

    # ── filter already complete ───────────────────────────────────────────────
    remaining = [
        fl for fl in all_fluids
        if progress.get(fl, {}).get('status') != 'complete'
    ]

    n_total   = len(all_fluids)
    n_done    = n_total - len(remaining)
    n_workers = min(mp.cpu_count(), len(remaining)) if remaining else 0

    print(f"CoolProp version : {fluid_pipeline.COOLPROP_VERSION}")
    print(f"Total fluids     : {n_total}")
    print(f"Already complete : {n_done}")
    print(f"To process       : {len(remaining)}")
    print(f"CPU cores        : {mp.cpu_count()}  ->  using {n_workers} workers")
    print()

    if not remaining:
        print("Nothing to do.")
        return

    # ── run ───────────────────────────────────────────────────────────────────
    completed = 0
    failed    = 0
    t_start   = datetime.datetime.now()

    with mp.Pool(n_workers) as pool:
        for result in pool.imap_unordered(fluid_pipeline.run_fluid, remaining):
            fluid = result['fluid']
            n_done_now = completed + failed + 1

            if result['status'] == 'complete':
                completed += 1

                progress[fluid] = result['progress_entry']

                fluid_index = [e for e in fluid_index if e.get('fluid') != fluid]
                fluid_index.append(result['index_entry'])

                pe   = result['progress_entry']
                elapsed = (datetime.datetime.now() - t_start).total_seconds()
                rate    = completed / elapsed if elapsed > 0 else 0
                eta_s   = (len(remaining) - n_done_now) / rate if rate > 0 else 0
                eta     = str(datetime.timedelta(seconds=int(eta_s)))

                print(f"[{n_done_now:>4}/{len(remaining)}]  OK    {fluid:<40}"
                      f"  grid={pe['n_grid_points']:>8,}"
                      f"  sat={pe['n_sat_points']:>4}"
                      f"  fail={pe['n_failed_pts']}"
                      f"  ETA {eta}")

            else:
                failed += 1
                ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
                errors.append({
                    'fluid':     fluid,
                    'timestamp': ts,
                    'error':     result['error'],
                })
                short_err = (result['error'] or '').splitlines()[-1][:80]
                print(f"[{n_done_now:>4}/{len(remaining)}]  FAIL  {fluid:<40}  {short_err}")

            # Write shared files after every result (incremental safety)
            save_json(PROGRESS_PATH, progress)
            save_json(INDEX_PATH,    fluid_index)
            save_json(ERRORS_PATH,   errors)

    # ── summary ───────────────────────────────────────────────────────────────
    elapsed = (datetime.datetime.now() - t_start).total_seconds()
    print(f"\nFinished in {elapsed:.1f}s")
    print(f"  Complete : {completed}")
    print(f"  Failed   : {failed}")
    if failed:
        print(f"\n  Failed fluids written to {ERRORS_PATH}")


if __name__ == '__main__':
    main()

# CoolProp thermodynamic property data

The precomputed CoolProp 7.2.0 property data that used to live in this folder
has been moved out of this repository. It was never small (multiple
gigabytes across 400+ fluids), and keeping it in git history made the
KasperCalc repo impractical to clone and pushed it toward GitHub's size
limits.

## Where the data actually lives now

**Live site data (what the calculators on kaspercalc.com fetch at runtime):**
Served from Cloudflare R2 via `https://data.kaspercalc.com/gz/`. This is a
gzip-compressed binary format — small, fast, and what
[`js/thermodynamicsland.js`](../js/thermodynamicsland.js) points at
(`GZ_ROOT`). You don't need to do anything to use the live calculators; this
is just for reference if you're reading the source.

**Full archive (for anyone who wants the raw data themselves):**
[github.com/bckasper3/KasperCalc-Coolprop-Data](https://github.com/bckasper3/KasperCalc-Coolprop-Data)

That repo contains:
- `gz/` — the same gzip-compressed binary grids served from R2 (~1.1GB)
- `bin/` — the uncompressed binary source format (~2.4GB)

## Using the R2-hosted data yourself

If you want to fetch the compressed grid/saturation data directly rather than
cloning the archive repo, the bucket is public and CORS-enabled for
browser use:

```
https://data.kaspercalc.com/gz/<FluidName>/meta.bin.gz
https://data.kaspercalc.com/gz/<FluidName>/saturation.bin.gz
https://data.kaspercalc.com/gz/<FluidName>/grid/grid_band_<NNN>_<PminPa>Pa_<PmaxPa>Pa.bin.gz
```

Fluid names match CoolProp's own naming (e.g. `Water`, `Air`,
`INCOMP::MEG[0.3]` — colons and brackets are used as-is in the path). See
[`js/thermodynamicsland.js`](../js/thermodynamicsland.js) for the exact
binary record layout (field order, byte widths) needed to decode the `.bin`
data after decompressing.

## License

This data is derived from [CoolProp](https://www.coolprop.org) 7.2.0
equations of state and is not covered by KasperCalc's own
[MIT license](../LICENSE) — refer to CoolProp's own licensing terms for the
underlying property data.

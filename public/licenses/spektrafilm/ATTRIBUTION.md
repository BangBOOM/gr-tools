# Attribution

## `kodak_gold_200.png`

Baked from the **spektrafilm** film profile `kodak_gold_200` — a spectral
photochemical simulation built from measured film datasheet density curves and
spectral sensitivities, not a hand-tuned approximation.

- **Author:** Andrea Volpato
- **Source:** <https://github.com/andreavolpato/spektrafilm>
- **License:** CC BY-SA 4.0 — the authoritative notice is
  [SPEKTRAFILM_LICENSE.txt](SPEKTRAFILM_LICENSE.txt), reproduced verbatim from
  upstream and shipped alongside the LUT. [LICENSE](LICENSE) in this directory
  points at it and adds nothing to it.
- **Modified:** yes — see below.

### What was changed

Baked to a level-8 HaldCLUT PNG (512×512, 64³ cube), sRGB in and sRGB out, with
the print profile `kodak_portra_endura` (which is the value of the Gold 200
profile's own `target_print` field).

One parameter was deliberately changed from spektrafilm's default:

    stops_above_midgray = 2.47      (spektrafilm's default is "auto", i.e. 4.0)

sRGB's native headroom above mid-grey is `log2(1.0 / 0.18) = 2.47` stops. That
is the physically honest value for a display-referred input. spektrafilm defaults
to 4.0 as a deliberate aesthetic choice — its own documentation calls it "an
aesthetic interpretation, not a measurement" — so that encoded 1.0 lands on the
film's shoulder and the rolloff engages on already-rendered SDR sources.

Measured, at 4.0 that default lifts mid-grey from 0.500 to **0.779** — over a
stop of brightening applied to every photograph. At 2.47 mid-grey lands at 0.506.
Since this project's pipeline already does its own exposure and highlight rolloff
before the LUT, the LUT's job here is colour, not exposure. Hence 2.47.

To reproduce this file exactly, see
[../../docs/baking-the-default-lut.md](../../docs/baking-the-default-lut.md).

### Why this file is not MIT

The rest of this repository is MIT. This file is not, and cannot be.

spektrafilm's code is GPLv3 and its profile data is CC BY-SA 4.0, and its license
addresses this exact case explicitly:

> This license applies to the original spektrafilm profiles … **and to all direct
> derivatives of the profiles, such as copies in other projects, LUTs, or any
> other format that encodes the same content.** LUTs and similar artifacts are
> interpreted as direct encodings of the information in the original profiles.

A LUT baked from a profile is therefore that profile's data in a different
container, and it carries the profile's license. So this directory is a
per-directory license carve-out: **CC BY-SA 4.0, with attribution, share-alike.**

That quotation is an excerpt, and an excerpt is not a license. The terms that
bind are the ones in [SPEKTRAFILM_LICENSE.txt](SPEKTRAFILM_LICENSE.txt) — shipped
in this directory, verbatim from upstream, and authoritative over anything
written here or in [LICENSE](LICENSE). It carries terms no summary of it did:
a restriction on use of the spektrafilm name, a request regarding commercial AI
training, and the fact that removing the attribution ends the grant immediately.

### Film Lab's reading (ours, not Andrea's)

**Photographs you make with the LUT are yours.** No copyleft reaches your images
— only the LUT file itself and anything that re-encodes the same table.

That is this project's reading of the grant, stated here rather than in LICENSE
because it is an interpretation and not a term. The upstream notice says much the
same in its own words ("The works you make are yours, completely"); where the two
differ, the upstream notice is what counts.

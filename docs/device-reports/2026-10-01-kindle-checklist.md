# Device checklist — Kindle, 2026-10-01

Run by the owner with [the device checklist](../device-checklist.md) on version `18e798a`, Timings shown.

| Item | Target | Measured | Pass |
|---|---|---|---|
| Device (model, firmware) | — | Kindle (as the 2026-09-29 probe; model / firmware not recorded) | |
| Version (commit, date) | — | `18e798a` | |
| Home ready, cold start | < 3 000 ms | 1 918 ms | yes |
| Library first results | < 4 000 ms | 2 225 ms | yes |
| Page turn (Z-machine reader, 9:05) | < 300 ms | 109 ms | yes |
| Page turn (Glulx reader, Three-Card Trick) | < 300 ms | 191 ms | yes |
| Z-machine turn, first / typical / worst (9:05) | < 1 000 ms | 178 / ~100 / 178 ms (six turns: 178, 130, 63, 103, 42, 146) | yes |
| Glulx turn, first / typical / worst (Three-Card Trick) | < 3 000 ms | 32 / ~220 / 889 ms (eight turns: 32, 730, 249, 5, 213, 241, 203, 889) | yes |
| Home, Library, game page work as described | — | yes | yes |
| Save, restore, undo, resume after reload | — | yes | yes |
| Ink and Twine play | — | yes (the bundled Ink fixture; Twine) | yes |
| Problems seen | — | 1. "The time does not change during a game": the timings line only showed page turns, game turn times were in the status line. 2. "Some games do not work": which ones to be named. | |

The turn times were measured afterwards on the preview of PR #59, where game turns also appear in the timings line
(`Turn played in … ms`). Follow-up: the games that did not work are to be named and investigated.

# Release notes template

Copy this into the GitHub release of a `v*` tag (the Ebook workflow builds the books and attaches them to it). Fill the device results
from the [device checklist](device-checklist.md), run on the release's build.

```markdown
## Inkventure vX.Y.Z — YYYY-MM-DD

### New
- Story SX.Y: what a reader can now do, in one line.

### Fixed
- What was wrong, in one line (#PR).

### Device results
Checklist run on the build of commit `abcdef1` (docs/device-reports/YYYY-MM-DD-<device>-checklist.md).

| Device (model, firmware) | Home ready | Library results | Page turn | Z turn (typical / worst) | Glulx turn (typical / worst) | Checklist |
|---|---|---|---|---|---|---|
| Kindle … | … ms | … ms | … ms | … / … ms | … / … ms | pass / issues below |

Targets: Home < 3 s, Library < 4 s, page turn < 300 ms, Z-machine turn < 1 s, Glulx turn < 3 s (SPEC §4.5, §10).

### Sizes
Kindle first load: … KiB gz of 200 KiB (`npm run check:size`).

### Known issues
- What still goes wrong on a device, and the story or issue that follows it up.

### Ebooks
The EN and FR ebooks (EPUB and AZW3) are attached, and published at <host>/ebook/.
```

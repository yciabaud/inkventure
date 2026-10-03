# Kindle offline check of the app (S5.3), 2026-10-03

Same Kindle as the earlier reports (experimental browser), PR #77 preview
(`https://yciabaud.github.io/inkventure/pr-preview/pr-77/`, commit `106c3c4`). Device checklist, section 7. Results as
reported by the owner.

| Step | Result |
|---|---|
| 1. Wi-Fi on, *Keep offline* on a Z-machine game | Pass: *Kept on this device: … KB* |
| 2. Airplane mode, reload, browser closed and reopened: Home opens, Library says it is offline | Pass |
| 3. The kept game plays, saves and resumes after a reload; a game that is not kept says *Needs Wi-Fi* | Pass |
| 4. The ebook's link in airplane mode | Not tested: the ebook links to the released app, not to a PR preview. To check after the release. |
| 5. Wi-Fi back on, *Settings → Kept on this device*, *Remove from device* | Pass |

Also seen: in Lost Pig, HELP's menu cannot be read (its subjects are in the upper window, cut after 3 rows). The same
happens online: not an offline issue, followed in [S1.22](../stories/S1.22-upper-window-menus.md).

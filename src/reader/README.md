# src/reader

Paginator, command bar and shortcut chips (SPEC §3.6).

- `paginator.ts`: pure pagination over measured line boxes (unit-tested with mocked metrics).
- `measure.ts`: reads line boxes from the DOM.
- `pageTurner.ts`: page state, reading position, tap zones, swipes, keys and re-pagination triggers.
- `PagedText.tsx`: the paged text view, with the last-page slot and the page indicator.
- `demo/`: static text for `#/play/demo`.
- `keys.ts`: the keys a single-key prompt names ("Press N", "1 or 2", menu legends), for the key chips.

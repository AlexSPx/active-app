For record layout changes, verify the native preview described in [native-verification.md](../../docs/design-review/history/native-verification.md). A browser render or text-only test does not establish Android layout correctness.

| Rule                                                           | Enforcement                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Table headings and values use the same native column geometry. | `RecordTableCell` owns column widths; `scripts/verify-history-preview.py` checks rendered Android bounds. |
| Stats retain visible dividers and section spacing.             | The native verification script checks screenshot pixels and Android bounds.                               |

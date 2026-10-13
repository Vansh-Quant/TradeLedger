# TradeLedger Personal Journal

The personal journal is a local-first workstation feature for recording trade execution and reviewing process quality. It does not submit orders or change OMS, risk, accounting, or competition state.

## Daily workflow

1. Before or immediately after a trade, record the symbol, date, direction, setup, session, entry, stop, size, and outcome.
2. Add the thesis and invalidation, higher-timeframe bias, liquidity target, and confluence tags.
3. Record the emotion, execution quality, mistake tag, and rule adherence separately from the financial outcome.
4. After the trade, write one lesson and one behavior to repeat or change.
5. Attach a chart screenshot only when it materially helps explain the setup. Images are compressed in the browser before storage.
6. Export a JSON backup periodically. Use CSV when you want to inspect or chart the tabular data in a spreadsheet.

## Performance definitions

All values are descriptive calculations over the entries currently stored in this browser. They are not independently reconciled against a broker statement.

- **Closed trades:** entries whose outcome is WIN, LOSS, or BREAKEVEN. OPEN entries are excluded from closed-trade statistics.
- **P&L sample:** closed entries with a finite realized P&L value. Expectancy and profit/loss calculations use this sample; missing P&L is not silently treated as zero.
- **Expectancy:** arithmetic mean of recorded realized P&L values in the P&L sample.
- **Gross profit / gross loss:** sum of positive P&L values and absolute sum of negative P&L values.
- **Profit factor:** gross profit divided by gross loss. It is shown as unavailable when there is no recorded gross loss, rather than presenting infinity.
- **Average win / average loss:** mean positive P&L and absolute mean negative P&L, respectively. Payoff ratio is average win divided by average loss when both exist.
- **Average R:** arithmetic mean of recorded R multiples for closed trades.
- **P&L drawdown:** peak-to-trough decline in the cumulative sequence of recorded P&L, ordered by trade date and then creation time. It is not account-equity drawdown and does not account for deposits, withdrawals, open exposure, or unjournaled trades.
- **Win/loss streaks:** consecutive WIN or LOSS outcomes in chronological order. A breakeven outcome resets the streak.
- **Setup/session/emotion breakdowns:** grouped closed trades, sorted by recorded net P&L. Win rate uses all closed trades in the group as the denominator, including breakeven outcomes.

Incomplete or inconsistent records can materially distort every statistic. Treat the analytics as a review aid, not as proof that a setup has an edge.

## Importing the old Private Trading Desk journal

1. Export the old application's localStorage data to a JSON file on a trusted device.
2. Open TradeLedger's Journal page and choose **Import**.
3. Select the JSON export. TradeLedger reads the `tl_trades` collection and intentionally ignores unrelated settings and rule collections.
4. Compare several imported trades against the old application, including short trades, negative P&L, R multiples, dates, and chart images.
5. Export a fresh TradeLedger JSON backup after validating the migration.

Import merges by entry ID; an imported entry with the same ID replaces the existing entry. Keep the original backup until the migration is verified.

## Storage and privacy

- Journal entries are stored in this browser profile's localStorage.
- The journal does not send these entries to the TradeLedger API or include them in Git commits.
- Browser localStorage is **not encrypted** by this feature and does not sync across browsers or devices. Anyone with access to the same unlocked browser profile may be able to read it.
- JSON backups contain journal notes and may contain compressed chart screenshots. Keep them private; never commit them to a public repository.
- CSV exports include textual and numeric journal fields but deliberately omit chart image payloads.
- Browser storage has finite capacity. If saving fails, export a backup and consider removing large screenshots before continuing.

## Validation before relying on it

Run `npm run typecheck`, `npm run test:glass`, and `npm run check` from the repository root before merging journal changes. Verify the import with a copy of the old export rather than deleting the original journal.

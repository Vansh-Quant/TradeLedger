<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All TradeLedger HTTP calls go through `src/api/client.ts`; components use hooks in `src/hooks/use-tradeledger.ts`. Why: backend is the source of truth; no scattered fetches.
- Never compute risk, P&L, or estimates client-side; missing backend values render "Unavailable". Why: deterministic backend owns all trading logic.
- API base URL, account and token are runtime settings (browser storage / VITE_ env), never hardcoded. Why: no secrets in source.

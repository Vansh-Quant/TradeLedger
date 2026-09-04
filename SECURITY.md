# Security Policy

TradeLedger is a private trading and quantitative research system. Security issues involving credentials, authentication, data isolation, execution controls, or unauthorized access should be treated as high priority.

## Reporting

Do not publish sensitive vulnerabilities, credentials, tokens, broker information, or private trading data in public issues or pull requests.

For now, report security concerns privately to the repository owner through GitHub's private communication mechanisms.

## Repository Rules

Never commit:

- API keys or access tokens
- Broker/exchange credentials
- Database passwords
- NAS credentials
- Private certificates or signing keys
- `.env` files containing secrets
- Private trading history or personally sensitive datasets
- Raw licensed market-data dumps
- Large model checkpoints unless explicitly approved

Use environment variables, local secret stores, or an approved secret-management system instead.

## Security Principle

Security controls must be designed into the architecture rather than added after the trading system is operational.

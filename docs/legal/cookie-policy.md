# TradeLedger Cookie and Browser Storage Policy — Draft for Owner Review

**Status:** Draft. Complete the inventory against the production domain before publishing.  
**Effective date:** [DATE]  
**Operator:** [LEGAL NAME OR BUSINESS NAME]  
**Contact:** [PRIVACY CONTACT EMAIL]

## 1. What this policy covers

Cookies are small browser values a website can store. Web applications can also use local storage, session storage, and similar browser mechanisms. This policy covers those technologies used by TradeLedger.

## 2. Technologies used

The current application includes a Supabase authentication client configured to persist and refresh sessions. The journal has also used browser local storage for local-only journal records. The precise cookies and storage keys depend on the deployed configuration and must be inventoried on the production domain.

Before publishing, complete this verified table:

| Technology / key | Purpose | Category | Lifetime |
| --- | --- | --- | --- |
| Supabase authentication/session storage | Keep a signed-in session and refresh it where configured | Strictly necessary for requested sign-in service | Verify actual storage mechanism and lifetime |
| tradeledger:personal-journal:v1 | Local-only journal records in a browser profile | User-requested local functionality | Until cleared by user/browser or application |
| tradeledger.api.config | Local workstation API configuration, if present | Development-only configuration | Verify; do not assume present in production |
| [OTHER OBSERVED COOKIES / KEYS] | [PURPOSE] | [CATEGORY] | [LIFETIME] |

This table is not a substitute for browser inspection. Remove entries not present in production and add all observed cookies and storage keys.

## 3. Choices and controls

Users can inspect and clear browser storage through browser settings, but clearing it may sign them out or remove local-only journal data. Clearing browser storage does not delete records already stored in the hosted Supabase database.

If non-essential analytics, advertising, or tracking technologies are introduced, document them and implement any consent or opt-out controls required by applicable law before enabling them. Do not state that consent is or is not required without reviewing actual technologies and jurisdictions.

## 4. Third-party services

Supabase may process authentication-related information. List other providers only after verifying deployed service configuration: [COMPLETE PROVIDER LIST AND LINKS].

## 5. Policy updates

Update this policy when cookies, storage technologies, providers, or purposes change. Include an effective date and explain material changes.

## Pre-publication checklist

- [ ] Inspect cookies, local storage, session storage, and IndexedDB on the production domain in a clean browser profile.
- [ ] Repeat inspection while signed out, signed in, and after signing out.
- [ ] Classify each technology and record its purpose and lifetime.
- [ ] Verify whether analytics, error reporting, embeds, or external assets set additional storage.
- [ ] Implement consent controls if required for actual technologies and target jurisdictions.
- [ ] Complete operator details and legal review.

---
name: privacy-review
description: Audit location, photo, consent, and sharing behavior in love-map-mini against the privacy-first rules in CLAUDE.md and docs/PRIVACY.md.
---

Review the current implementation specifically for privacy regressions. Cross-check
against CLAUDE.md "Privacy and safety requirements" and docs/PRIVACY.md.

Focus on:
- Location sharing OFF by default; no background/continuous tracking anywhere.
- Check-in is user-initiated only; temporary share has an expiry.
- Partner location visible only after explicit consent (PrivacyConsent).
- Public map OFF by default; only `visibility=public` data exposed; precise home/
  school/work coordinates are not leaked (coordinate fuzzing).
- Users can delete check-ins, memories, and photo metadata (soft delete honored in reads).
- Tokens/DTOs leak no more than necessary (no openid/unionid/session_key to clients).
- Secrets only from env; mock login disabled in production.

Do not modify code unless explicitly asked. Summarize findings (severity + file:line +
fix) and update docs/PRIVACY.md only if a rule or default changed.

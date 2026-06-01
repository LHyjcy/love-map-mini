---
name: security-review
description: Review auth, privacy, secrets, and access-control risks in love-map-mini.
---

Focus on:
- requireAuth on private APIs
- user_id and couple_id authorization
- location sharing defaults
- public map only exposing public data
- deletion and soft-delete behavior
- hardcoded secrets
- OSS/COS keys in frontend
- unvalidated writes
- missing transactions for points and inventory

Do not modify code unless explicitly asked. Write docs/REVIEW_REPORT.md.

# Ops one-click feature API keys

## Goal
From Ops, mint a usable credential for any site product in one click, with operator-chosen duration (default 30 days).

## Features
| UI label | type | Revealed credential |
|---|---|---|
| QA Mailboxes | api | `hm_api_…` (+ licence created) |
| Mail Grade | grade | `hm_api_…` |
| Sender Check | sender | `hm_api_…` |
| DMARC Reports | reports | `hm_api_…` |
| Bounce Read | bounce | `hm_api_…` |
| Complaint Read | complaint | `hm_api_…` |
| TLS Reports | tls | `hm_api_…` |
| Deliverability Suite | suite | `hm_api_…` |
| Outbound Send | outbound | `HM-…` licence (+ optional `hm_send_…`) |
| Pro Inbox | pro | `HM-…` licence |

## Controls
- Days (required, default 30), optional label
- Feature buttons — one click creates + reveals
- List remains masked; no env/credential-source copy

## Backend
`POST /api/admin/licenses` also returns `apiKey` (when `canIssueApiKey(type)`) and, for outbound, optionally `sendKey` when `issueSendKey: true` (default true for one-click outbound).

# M0 ZoneMTA spike gate report

## Scope

This report records the evidence produced by Tasks 1–3. No new tests or engineering decisions are part of this gate.

## ZoneMTA version

`3.10.3`.

## Final dependency overrides

The final `overrides` block in `mta/package.json` is:

```json
"overrides": {
  "nodemailer": "^10.6.0",
  "smtp-server": "^3.21.6",
  "undici": "^7.30.2",
  "js-yaml": "^4.3.2",
  "find-my-way": "^9.10.1",
  "uuid": "^11.1.1",
  "joi": "^17.13.9",
  "fast-xml-parser": "^5.12.1",
  "toml": "^5.0.1",
  "form-data": "^2.5.6",
  "qs": "^6.17.1",
  "tough-cookie": "^4.1.4",
  "send": "^0.19.2",
  "jest": {
    "glob": "^14.0.2",
    "minimatch": "^11.0.1"
  }
}
```

## Audit gate

- `npm audit --audit-level=high` exit code: `0`.
- Exactly two moderate advisories remain: `request`, and `zone-mta` because it depends on `request`.
- There is no patched version upstream. The dismissal reason is recorded in `.cursor/rules/dependencies.mdc`: “no patched version; ZoneMTA reaches `request` only for HTTP-upload delivery, which is not configured”.

## Deliver test

**PASS.** Real mail was delivered by the real `zone-mta@3.10.3` binary in Docker. `mailauth`’s `dkimVerify` performed cryptographic verification and returned `result: "pass"` against the delivered message.

## Hold test

**PASS.** A held message was confirmed through ZoneMTA’s own `GET /queued/deferred/default` API. The response was `200` with `type: "deferred"`, a future `queued` retry timestamp, and `deferred: 1`. This proves the message entered a deferred/retry-eligible state, rather than merely being absent from the receiver.

## Major findings for M1

1. `request`’s `require('uuid/v4')` is incompatible with every `uuid` version the audit override can legally use: `uuid` versions >=8 break that import, while versions <8 reintroduce the CVE the override fixes. The compatibility issue is fixed with the additive `patch-package` patch `mta/patches/request+2.88.2.patch`, not by changing `overrides`. The patch is fragile if a future lockfile regeneration resolves a different `request` version; this is documented in `mta/README.md`.
2. ZoneMTA’s own process cannot run on Node >=24: `restify` → `spdy` calls `process.binding('http_parser')`, which Node 24 removes. This was confirmed empirically across Node 18/20/22 (work) and Node 24 (crashes). The ZoneMTA Docker runtime is therefore pinned to `node:22-bookworm-slim`, separately from this repository’s Node 24+ host-tooling convention. M1 must plan `mta/` deployment around this Node-22 ceiling.

## Deferred/minor items

- The plugin has no dedicated test for the Redis-rejection path.
- An empty/null sender address holds rather than passing through. This is acceptable for the spike and is a product-design question for M1.
- ZoneMTA’s `DEFAULT_DEFER_TIMES` caps a hold at approximately 48 hours. M1 should decide whether `queue.deferTimes` needs overriding for a longer or indefinite hold per spec section 5.5.
- `zone-mta@3.10.3` is npm-deprecated and renamed upstream to `@zone-eu/zone-mta`; the pinned version remains required by the specification.

## Verdict

**PASS.**

## Next action

**Write M1 plan.** M0 is green-lit for M1 planning. The controller session will perform the planning; this report does not start M1.

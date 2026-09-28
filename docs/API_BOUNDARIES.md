# External API boundaries

The product primarily uses typed Next.js server actions, not a public REST API. An OpenAPI/Swagger layer is not required for those actions and would not describe Clerk session/SQL authorization correctly on its own. This file documents the actual implemented HTTP routes without inventing endpoints.

| Endpoint | Current request contract | Authentication and response |
| --- | --- | --- |
| `POST /api/webhooks/clerk` | Clerk signed provider event, unmodified body; actual primary verified email/provider timestamp | Clerk webhook signature secret required; missing verification config 503, invalid signed event 400. Supported identity events sync/disable through restricted worker path; errors must remain retryable rather than acknowledging a failed mutation. No user password or role grant accepted. |
| `POST /api/crons/outbox` | Raw QStash-signed body | QStash signature mandatory; invalid/missing signature 401. Dispatcher currently returns 503 rather than fabricating Clerk delivery. Not a public invocation endpoint. |
| `POST /api/evidence/sign` | No authorized upload contract configured | Requires Clerk session; signed-out 401. Signed-in currently 503 until parent/classification/metadata ownership checks are implemented. No arbitrary folder or public URL is an accepted evidence authorization. |

`GET /api/health` now returns cheap liveness (`status:ok`) and configured release identity with `Cache-Control:no-store`. `GET /api/ready` returns ready/not_ready (200/503) with bounded runtime/identity-role database probes and Redis/configuration availability; it does not reveal credentials. These are source-defined handlers; deployed reachability and release identity still need verification. Readiness is not a blanket proof of every provider workflow.

Do not list placeholder endpoints as active API contracts. Private evidence download remains unimplemented.

Server actions derive actor from Clerk on the server and use operation-specific validation/capability checks. A client-supplied department narrows allowed scope; it does not grant access. Mutations need expected versions and reasons where defined; retryable create actions reuse command keys. Service errors use `{success:false,error,code,statusCode}` rather than pretending business failures are successful writes. Provider secrets, raw database connection strings, protected storage keys and internal error traces must never reach consumers.

If an external consumer is added, derive a limited OpenAPI document from its final real route handlers and test auth/error/content-type behavior. Avoid publishing a speculative schema for internal server actions or unimplemented private-file download routes.

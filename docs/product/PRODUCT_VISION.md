# Product vision

A department-aware government infrastructure register that helps officers identify inspection and restoration needs, find the evidence behind complaints, and compare regional condition with coverage and sourced restoration estimates.

**Users:** department officers, independent senior reviewers, department administrators and explicitly authorised central planners. Departments are tenants within an authority; central scope is an explicit grant, not nationwide access.

**Core:** authority → departments → members and versioned asset definitions → fixed assets → evidence, inspections, complaints, restoration works, milestones and retained history. Department experts define fields, inspection components and lifecycle transitions. Independent seniors publish definitions and approve consequential decisions.

**Trust:** registration, lifecycle, availability, inspected condition and work progress are separate meanings. A complaint is reported concern. Age is context. Completed work needs a subsequent approved inspection before condition improves. Unknown and stale evidence remain visible.

**Success in the demonstration:** trace a public building complaint through independent inspection review, sourced restoration proposal, work acceptance and reassessment; compare regional coverage and priced/unpriced backlog; show an assigned role cannot be retired and source names survive language changes.

**Delivery boundary:** production `/app` routes now use authenticated, actor-scoped database reads and selected persisted mutations: asset drafts/corrections/registration review and existing inspection/work decisions. Login leads directly into a plain light workspace, with pending access when no active domain grant is available. Preview personas and synthetic fixture inventory are not used in the production routes.

The complete complaint → new inspection → sourced work proposal → completion evidence → accepted work → approved reassessment journey remains incomplete. Definition/governance/invitation administration, secure file upload/delivery, comparable trend reporting and full seven-language production coverage still require implementation. The local SQL harness passes 38 behavior/security groups; this is separate from hosted application acceptance, external vendor delivery and deployment verification. Treat the current deliverable as a partially connected prototype, not a certified or production-verified government system.

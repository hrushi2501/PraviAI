# Core concepts

| Concept | Meaning |
| --- | --- |
| Authority | Governing boundary for central access, roles and department governance |
| Department | Tenant owning its records and assignments |
| Identity | Clerk identity; login alone does not grant domain access |
| Role | Editable name and permission bundle, immutable authority/department scope |
| Asset definition | Versioned fields, inspection components, stages and transitions; independent publication |
| Asset | Fixed infrastructure, pinned to a published definition version |
| Inspection | Dated observations; only independently approved observations establish trusted condition |
| Complaint | Reported concern; urgency never overwrites inspected condition |
| Restoration work | Proposal, estimate, authorisation, execution and independent acceptance |
| Evidence | Referenced document/media with source, author and classification |
| Audit | Who, what, when, before, after and why; historical attribution survives role changes |

Registration: draft/submitted/verified/correction required. Lifecycle: department-defined stages. Availability: in service/restricted/closed/unknown. Condition: good/fair/poor/critical/unknown with observation date and freshness. Work: proposed/approved/in progress/completion submitted/accepted/correction required/cancelled.

Supported dynamic field types match SQL: text, select, number, integer, date and boolean. Textarea is a rendering option for text; money belongs to sourced work estimates in integer paise. Arbitrary multiselect, cross-asset relationships, calculated fields and custom rule code are deferred. The Relationships detail tab explains the deferred boundary rather than inventing persisted links.

Published definitions never change in place; new drafts produce new versions. Existing asset definitions retain their version. The prototype builder is bounded configuration, not a universal workflow engine.

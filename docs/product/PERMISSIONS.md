# Capability matrix

Titles are examples only; no production role name is hardcoded as an authorisation rule. Database permission IDs are the contract.

| Operation | Capability | Independence / restriction |
| --- | --- | --- |
| Read department assets | `read` | Current membership in exact department |
| Register/edit draft | `asset_write` | Published pinned definition; draft ownership/version |
| Verify registration | `asset_verify` | Different creator/submitter |
| Draft definition | `template_write` | Cannot edit published version |
| Publish definition | `template_approve` | Different creator/submitter |
| Submit inspection | `inspection_write` | Component observations and evidence |
| Approve inspection | `inspection_approve` | Different assessor/submitter |
| Log complaint | `complaint_write` | Does not change inspected condition |
| Propose/execute work | `work_write` | Execution limited to assigned actor |
| Authorise/accept work | `work_approve` | Different proposer/executor/submitter |
| Decide lifecycle action | `lifecycle_approve` | Pending request; independent actor; version checked |
| Invite/manage department member | `member_manage` | No self-promotion or privileged delegation |
| Read authorised departments | `authority_read` | Authority-scoped central grant |
| Propose governance | `authority_admin` | No change until approval |
| Approve governance | `governance_approve` | Different from proposer; last effective admin and approver protected |

Frontend officer/reviewer/central selectors are labelled preview personas. They are test controls, not login identity changes or trusted RBAC. Assigned roles cannot be retired while active/inactive assignments or pending invitations reference them. Rename preserves role identity. Removal needs explicit reassignment/revocation followed by independent approval.

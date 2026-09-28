# Authority startup and role management

The signed-in authority administrator uses `/app/administration` (Administration in the sidebar, also linked from Settings). Every read and command executes with the authenticated Clerk actor under database RLS.

## Startup order

1. Submit **Add department** with the department code/name, verified initial manager and departmental manager role. The other authority administrator reviews and approves the request. Approval creates the department and its first membership atomically.
2. Use **Assign department access** to establish a separate senior approver. The SQL contract forbids the deciding actor from assigning their own department membership. With two administrators, the recipient submits their own membership request; the other administrator approves it.
3. Submit **Add region** starting with a state, then districts and appropriate local levels. Each region request requires independent approval. The hierarchy is checked by the database.
4. Select the department in the header. In **Asset definitions**, create a draft from a standard starter, edit fields/components and record its policy. Submit it; a different departmental actor with template approval publishes it.
5. Register assets against the published version and canonical region. Submit registrations for independent verification. Verified assets offer inspection-draft and restoration-proposal creation.

An authority role controls governance, while department roles control operational writes and reviews. Authority administration alone does not automatically grant departmental write permissions.

## Directory and roles

The user directory lists visible authority members and departmental members, including inactive memberships and disabled/unverified identities. Search by name, email, department or role; filter department, role and status. Each identity displays verification/disabled state, registration date, preferred language, memberships, expiry and assigned role permissions. These are assigned permissions; inactive/expired memberships and disabled identities do not imply effective access.

**Change access** opens a prefilled governed membership proposal. **Edit role** opens its current permissions and version. Role creation, editing and retirement are reviewed independently. Department and region name/status edits use the existing canonical commands. The UI retains records rather than deleting them.

Directory lists are authority scoped, with an explicit first-100-record limit. Accounts that have never been assigned to this authority do not appear in the tenant directory. An administrator can find a registered official by an exact verified primary email, reconcile their actual provider identity, and propose authority or departmental membership. This targeted lookup does not grant access or list unrelated accounts. Email invitation delivery remains unfinished; officials must first sign up through the app.

## Validation and remaining gaps

Authenticated local browser verification confirmed all seven setup forms, the directory filters, both administrator identities, and the definitions route. Desktop/mobile checks found no horizontal overflow. Actor-scoped live database reads were verified without creating business records. Governance writes and independent approval invariants are also exercised by the existing local SQL harness.

Secure parent-bound evidence upload/delivery and completion/reinspection flows are still incomplete. Inspection drafts and restoration proposals can be recorded, but evidence-dependent transitions must not be represented as fully operational until those integrations are complete. No approval is recorded on behalf of the second administrator.

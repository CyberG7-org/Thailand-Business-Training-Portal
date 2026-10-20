# Submanager role — draft design

Date: 2026-10-19

Status: Owner-approved design; implementation and deployment not yet authorized

## Intent

A Manager can delegate DBD uploads and learner creation without handing over editing, deletion, detailed quiz/interview results, appointments, or access to another Manager's team. A Manager may have multiple Submanagers. The existing Manager remains responsible for correcting DBD problems and managing the team's records.

## Account and team model

- Add the role `submanager` between `manager` and `learner`. Each Submanager belongs to exactly one Manager's existing team; no nested team is created.
- Its login ID is the Manager's full login ID + `s` + exactly two ASCII alphanumeric characters in any combination, e.g. `tf38s01` or `tf38sA7`. The typed suffix has no sequential or letter/digit-mix rule. Follow the portal's existing case-insensitive login convention and reject duplicate full IDs.
- Only that Manager can create, reset the password of, suspend/reactivate, and remove their Submanagers on a dedicated **Submanagers** page. Multiple accounts per Manager are allowed. Submanagers can use the existing own-profile password change flow.
- The **Delete** action removes login access and hides the Submanager from the normal management list, but retains the profile identity and login ID as an archived account. DBDs, learners, assignments, results, and creator/audit references remain intact. Suspended accounts stay visible and can be reactivated; archived accounts cannot log in or be reactivated through the normal page. No login ID is reused.
- A Manager suspended by the Owner must not leave active Submanagers with access to that Manager's team.

## Submanager screens

The Submanager navigation has exactly two working pages: **Create Learner & DBD** and **Learner Record**. Their profile dropdown may still include Change Password and Log Out.

### Create Learner & DBD

- Reuse the existing two-tab layout and all three upload methods: image, PDF poster, ZIP. A Submanager may create a DBD by uploading, but may not create a blank manually editable DBD, open the company detail/editor, edit fields, delete a record, re-index, resolve an exception, or manage documents after initial upload.
- Show all DBD records in the Manager's team, including ones uploaded by the Manager or another Submanager. Record name/status are display-only for a Submanager. Keep the existing confirmed/taken status behavior.
- A Submanager may create a learner and assign them only to a confirmed, unassigned DBD whose immutable `created_by` equals that Submanager's profile ID. Clicking **Assign learner** on any other team DBD shows: **“This DBD has not been created by you.”** It does not open or prefill the learner form. If a client bypasses the button, the server rejects the same unauthorized assignment. Records from other teams are not listed or assignable.
- The Manager can correct or confirm a Submanager-uploaded DBD without changing its creator. After confirmation, its original Submanager may assign a learner to it. A Submanager cannot change learner details after creation, including password and DBD assignment.
- Uploads that need factual correction or validation are marked as needing attention for the Manager. A failed image/PDF extraction currently may remove its draft entirely; implementation must preserve enough of a failed upload or otherwise create a visible Manager-owned error handoff so the Manager can see and address it. The Submanager is told that Manager action is needed, not offered an edit screen.

### Learner Record

- Reuse the Manager's table layout and show **all** learners of the Submanager's Manager, regardless of who created them.
- Login ID, company, quiz result, interview result, and appointment are plain display text/status, with no links. Do not render delete, edit, booking, attempt-history, interview-history, or other action controls. The table is not a doorway to any detail screen.
- The Submanager may see only the row-level quiz/interview statuses, not underlying answers, attempts, turns, or detail pages. Other teams' data is unavailable even by a guessed URL or direct API call.

## Security and implementation boundaries

- Do not add `submanager` to the current broad `is_staff()`/`requireStaff()` permissions without splitting them: these presently grant editing, content, appointment, interview-detail, and company-detail capabilities.
- Add dedicated authorization checks for Submanager creation/upload, learner creation, own-created-record assignment, and summary-only reads. Resolve the team from the signed-in profile; never trust a submitted Manager ID or creator ID.
- Extend the role constraint, metadata synchronization, team-membership invariant, session types, login routing, middleware, and translations. `profiles.manager_id` can identify the parent Manager for Submanagers as well as learners; adjust the existing trigger that currently allows only learners to carry it.
- Keep `dbd_records.team_id` as the Manager's ID and `created_by` as the Submanager's ID. The present upload actions, direct storage upload, post-upload record updates, background extraction and validation need carefully separated permissions: allow the initial upload workflow without granting the Submanager general UPDATE/DELETE rights.
- The current learner form requires a confirmed DBD and performs a service-role account create followed by assignment. Its server action must explicitly derive the Submanager's parent Manager, verify the DBD belongs to that team and was created by this Submanager, then create the learner under the Manager's team.
- Build a summary-only result read for Submanagers; do not make raw assessment/interview history readable just to populate the Learner Record table. Audit account creation, password reset, suspension, removal, DBD upload and learner creation with the real actor ID.

## Acceptance checks

1. Two Submanagers under one Manager can both see all team learners in a static Learner Record table, but each can assign only DBD records they personally uploaded.
2. Clicking another team member's DBD **Assign learner** shows the specified alert; direct form submission is also denied.
3. A Submanager cannot edit, delete, open DBD/learner/quiz/interview detail pages, book appointments, or access another Manager's data through URL/API/RLS.
4. All three upload methods create records in the parent Manager's team with the Submanager retained as creator; errors reach the Manager for correction.
5. Suspending or removing a Submanager stops sign-in/access promptly while every company, learner, assignment, result and creator trail remains.
6. Existing Owner, Manager and Learner behavior remains unchanged; staging migrations and tests pass before release.

## Codebase findings informing this design

- `lib/auth/session.ts`, `lib/db/middleware.ts`, and `components/staff/staff-nav.tsx` currently recognize only Owner/Manager as staff.
- `supabase/migrations/20260923010100_team_columns.sql` rejects `manager_id` on any role but learner. Team/RLS helpers and policies rely heavily on `is_manager()` and `is_staff()`.
- `app/[locale]/(admin)/admin/users/actions.ts` currently treats anyone other than a Manager as an Owner who may submit `managerId`; this must not apply to Submanagers.
- `app/[locale]/(admin)/admin/learners/page.tsx` links Login ID, company, quiz/interview histories and booking, and renders deletion.
- `app/[locale]/(admin)/admin/dbd-records/new/image-actions.ts` creates a record and subsequently updates it, and currently cleans up a draft after an extraction/upload failure.
- `lib/db/provisioning.ts` already supports 6–8 character account passwords and checks duplicate IDs; the existing two-character Manager suffix validation can inform, but not replace, the new Submanager prefix rule.

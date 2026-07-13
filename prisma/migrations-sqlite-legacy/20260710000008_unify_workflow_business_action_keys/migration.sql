-- Space resources remain on ApprovalRequest for permission and ownership context,
-- but workflow identity is now always the registered base business action.
DELETE FROM "WorkflowPolicy"
WHERE "businessActionKey" LIKE 'space.%';

UPDATE "ApprovalRequest"
SET "businessActionKey" = REPLACE("businessActionKey", 'space.department.tasks.', 'work.tasks.')
WHERE "businessActionKey" LIKE 'space.department.tasks.%';

UPDATE "ApprovalRequest"
SET "businessActionKey" = REPLACE("businessActionKey", 'space.committee.tasks.', 'work.tasks.')
WHERE "businessActionKey" LIKE 'space.committee.tasks.%';

UPDATE "ApprovalRequest"
SET "businessActionKey" = REPLACE("businessActionKey", 'space.company.tasks.', 'work.tasks.')
WHERE "businessActionKey" LIKE 'space.company.tasks.%';

UPDATE "ApprovalRequest"
SET "businessActionKey" = REPLACE("businessActionKey", 'space.department.projects.', 'work.projects.')
WHERE "businessActionKey" LIKE 'space.department.projects.%';

UPDATE "ApprovalRequest"
SET "businessActionKey" = REPLACE("businessActionKey", 'space.committee.projects.', 'work.projects.')
WHERE "businessActionKey" LIKE 'space.committee.projects.%';

UPDATE "ApprovalRequest"
SET "businessActionKey" = REPLACE("businessActionKey", 'space.company.projects.', 'work.projects.')
WHERE "businessActionKey" LIKE 'space.company.projects.%';

UPDATE "ApprovalRequest"
SET "businessActionKey" = REPLACE("businessActionKey", 'space.department.templates.', 'docs.editor.')
WHERE "businessActionKey" LIKE 'space.department.templates.%';

UPDATE "ApprovalRequest"
SET "businessActionKey" = REPLACE("businessActionKey", 'space.committee.templates.', 'docs.editor.')
WHERE "businessActionKey" LIKE 'space.committee.templates.%';

UPDATE "ApprovalRequest"
SET "businessActionKey" = REPLACE("businessActionKey", 'space.company.templates.', 'docs.editor.')
WHERE "businessActionKey" LIKE 'space.company.templates.%';

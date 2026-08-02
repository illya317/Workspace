-- workspace:migration-mode=maintenance
-- HR employment and assignment integrity is enforced by write contracts and inspected internally.
-- These checks are not user-subscription events.

DELETE FROM "NotificationSubscription"
WHERE "eventKey" IN (
    'platform.businessData.alert',
    'hr.active-employment.unique',
    'hr.active-employee.current-assignment',
    'hr.current-assignment.organization-complete',
    'hr.current-assignment.workload-total'
);

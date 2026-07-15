BEGIN;

-- 余额层自动配对已退役；未经人工调整的旧结果不能继续冒充人工确认。
DELETE FROM "FinanceBalanceReclassAdjustment"
WHERE "sourceType" = 'balance_residual'
  AND "status" = 'approved';

COMMIT;

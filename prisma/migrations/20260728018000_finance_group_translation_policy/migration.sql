ALTER TABLE "FinanceGroupAccountRevision"
  ADD CONSTRAINT "FinanceGroupAccountRevision_translation_policy_check"
  CHECK (
    "translationRateType" = CASE
      WHEN "consolidationRole" = 'difference'
        OR "code" ~ '^(4003|4005)'
        OR "name" ~ '(外币报表折算差额|其他综合收益)'
        THEN 'translationDifference'
      WHEN "code" ~ '^(4104|310415)'
        OR "name" LIKE '%未分配利润%'
        THEN 'retainedEarningsRollforward'
      WHEN "consolidationRole" IN ('shareCapital', 'capitalReserve')
        OR "code" ~ '^(4001|3001|4002|3002|4101|3101)'
        OR "name" ~ '(实收资本|股本|资本公积|盈余公积|其他权益工具|库存股)'
        THEN 'historical'
      WHEN "consolidationRole" = 'cashFlow'
        OR "category" IN ('revenue', 'cost', 'expense')
        THEN 'average'
      WHEN "category" = 'equity'
        THEN 'historical'
      ELSE 'closing'
    END
  ) NOT VALID;

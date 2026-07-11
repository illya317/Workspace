UPDATE "Employment"
SET "title" = "personnelType"
WHERE "personnelType" IN ('董事', '常务委员', '轮值委员')
  AND ("title" IS NULL OR "title" = '');

UPDATE "Employment"
SET "personnelType" = '其他'
WHERE "personnelType" IN ('董事', '常务委员', '轮值委员');

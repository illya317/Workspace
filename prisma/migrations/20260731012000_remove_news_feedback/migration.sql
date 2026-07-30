-- Internal feedback was removed from the product before production release.
-- Keep the applied NEWS migration immutable and remove the unused tables forward.
DROP TABLE "NewsFeedbackEvent";
DROP TABLE "NewsFeedback";

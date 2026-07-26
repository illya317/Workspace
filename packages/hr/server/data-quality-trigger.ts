import "server-only";

export async function queueHrDataQualityEvaluation(entityType: string, entityIds: Array<string | number>) {
  try {
    const { enqueueDataQualityEvaluations } = await import("@workspace/platform/server/data-quality-queue");
    await enqueueDataQualityEvaluations(entityIds.map((entityId) => ({
      domain: "hr",
      entityType,
      entityId,
    })));
  } catch (error) {
    console.error(JSON.stringify({
      event: "hr_data_quality_enqueue_failed",
      entityType,
      entityIds: entityIds.map(String),
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

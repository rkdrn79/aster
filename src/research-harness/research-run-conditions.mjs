// Same fields and rules as compareRecordedConditions in src/shared/research/research-run-manifest.ts.
function conditionFields(metric) {
  const definition = (field) => [
    `metrics.definitions.${metric}.${field}`,
    (manifest) => manifest.metrics?.definitions?.[metric]?.[field]
  ]
  return [
    // Why: without a primary metric there is no metric definition to compare.
    ...(metric
      ? [
          ['metric unit', ...definition('unit')],
          ['metric aggregation', ...definition('aggregation')],
          ['metric direction', ...definition('direction')]
        ]
      : []),
    ['dataset', 'evaluation.datasetId', (manifest) => manifest.evaluation?.datasetId],
    [
      'dataset version',
      'evaluation.datasetRevision',
      (manifest) => manifest.evaluation?.datasetRevision
    ],
    ['split', 'evaluation.split', (manifest) => manifest.evaluation?.split],
    [
      'evaluator version',
      'evaluation.evaluatorRevision',
      (manifest) => manifest.evaluation?.evaluatorRevision
    ]
  ]
}

/** Per field, the values of `manifests` that differ or are missing; `metric` may be null. */
export function compareRecordedConditions(manifests, metric) {
  const differences = []
  const missing = []
  for (const [name, field, pick] of conditionFields(metric)) {
    const values = manifests.map((manifest) => (manifest ? (pick(manifest) ?? null) : null))
    const present = values.filter(Boolean)
    if (new Set(present).size > 1) {
      differences.push({ name, field, values })
    } else if (present.length !== manifests.length) {
      missing.push({ name, field, values })
    }
  }
  return { differences, missing }
}

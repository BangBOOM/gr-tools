import type { Selection } from '../../../packages/firmware-core/src/index.ts';
import { fitCube } from '../../../packages/firmware-fit/src/index.ts';
import { inspectStylePackage } from '../../../packages/style-contract/src/index.ts';
import type { TaskProgressEvent } from './progress.ts';

/** Prepare the submitted snapshot. Core plan independently verifies every fit. */
export async function prepareBuildInput(input: Selection, onProgress: (event: TaskProgressEvent) => void) {
  const prepared = structuredClone(input);
  if (!('slots' in prepared)) return prepared;
  const targets = prepared.slots.filter(slot => !slot.reference);
  for (const [index, slot] of targets.entries()) {
    onProgress({ phase: 'prepare-style', completed: index, total: targets.length });
    if (!slot.fitReport) {
      const packaged = await inspectStylePackage(slot.packageBytes!);
      const fit = packaged.camera?.fit ?? await fitCube(slot.cubeBytes!, { nodes: 65 });
      slot.recipe = { matrix_q13: fit.matrix_q13, curves_q14: fit.curves_q14 };
      slot.fitReport = fit.report;
      slot.fitOrigin = packaged.camera ? 'compiled-style' : undefined;
    }
    // Bind the build request to the exact fit. This field is not human review evidence.
    slot.acceptedFitHash = slot.fitReport.fit_sha256;
  }
  return prepared;
}

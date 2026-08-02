export function formatCodeVolumeInTenThousands(lines: number) {
  if (lines === 0) return "—";
  if (lines < 1_000) return "<0.1";
  return (lines / 10_000).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBalancedCodeVolumeInTenThousands(displayLines: number, sourceLines: number) {
  if (sourceLines === 0) return "—";
  if (displayLines < 1_000) return "<0.1";
  return formatCodeVolumeInTenThousands(displayLines);
}

interface FlowEdge {
  to: number;
  reverseIndex: number;
  capacity: number;
  cost: number;
}

function addFlowEdge(graph: FlowEdge[][], from: number, to: number, capacity: number, cost: number) {
  const forward: FlowEdge = { to, reverseIndex: graph[to].length, capacity, cost };
  const reverse: FlowEdge = { to: from, reverseIndex: graph[from].length, capacity: 0, cost: -cost };
  graph[from].push(forward);
  graph[to].push(reverse);
}

function apportionedUnits(totals: readonly number[], targetUnits: number, quantum: number) {
  const units = totals.map((total) => Math.floor(total / quantum));
  const remaining = targetUnits - units.reduce((sum, value) => sum + value, 0);
  const largestRemainders = totals
    .map((total, index) => ({ index, remainder: total % quantum }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) {
    units[largestRemainders[index].index] += 1;
  }
  return units;
}

/**
 * Rounds a code-volume matrix to 0.01 万行 (100-line) units while preserving
 * both displayed row totals and displayed column totals. Raw snapshot values
 * remain untouched; this only prevents independent cell rounding from creating
 * visible 0.01 discrepancies in the table.
 */
export function balanceCodeVolumeMatrix(sourceMatrix: readonly (readonly number[])[]) {
  if (sourceMatrix.length === 0) return [];
  const columnCount = sourceMatrix[0].length;
  if (sourceMatrix.some((row) => row.length !== columnCount)) {
    throw new Error("Code-volume matrix rows must have equal width");
  }
  if (sourceMatrix.some((row) => row.some((value) => !Number.isInteger(value) || value < 0))) {
    throw new Error("Code-volume matrix values must be non-negative integers");
  }
  if (columnCount === 0) return sourceMatrix.map(() => []);

  const quantum = 100;
  const rowCount = sourceMatrix.length;
  const rowTotals = sourceMatrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = Array.from({ length: columnCount }, (_, columnIndex) =>
    sourceMatrix.reduce((sum, row) => sum + row[columnIndex], 0));
  const grandTotalUnits = Math.round(rowTotals.reduce((sum, value) => sum + value, 0) / quantum);
  const rowTargetUnits = apportionedUnits(rowTotals, grandTotalUnits, quantum);
  const columnTargetUnits = apportionedUnits(columnTotals, grandTotalUnits, quantum);
  const baseUnits = sourceMatrix.map((row) => row.map((value) => Math.floor(value / quantum)));
  const rowNeeds = baseUnits.map((row, rowIndex) =>
    rowTargetUnits[rowIndex] - row.reduce((sum, value) => sum + value, 0));
  const columnNeeds = columnTargetUnits.map((target, columnIndex) =>
    target - baseUnits.reduce((sum, row) => sum + row[columnIndex], 0));

  const sourceNode = 0;
  const rowNodeStart = 1;
  const columnNodeStart = rowNodeStart + rowCount;
  const sinkNode = columnNodeStart + columnCount;
  const graph: FlowEdge[][] = Array.from({ length: sinkNode + 1 }, () => []);
  const cellEdgeIndexes = sourceMatrix.map(() => Array.from({ length: columnCount }, () => -1));

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    addFlowEdge(graph, sourceNode, rowNodeStart + rowIndex, rowNeeds[rowIndex], 0);
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const rowNode = rowNodeStart + rowIndex;
      cellEdgeIndexes[rowIndex][columnIndex] = graph[rowNode].length;
      addFlowEdge(
        graph,
        rowNode,
        columnNodeStart + columnIndex,
        1,
        quantum - (sourceMatrix[rowIndex][columnIndex] % quantum),
      );
    }
  }
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    addFlowEdge(graph, columnNodeStart + columnIndex, sinkNode, columnNeeds[columnIndex], 0);
  }

  const requiredFlow = rowNeeds.reduce((sum, value) => sum + value, 0);
  let flow = 0;
  while (flow < requiredFlow) {
    const distance = Array.from({ length: graph.length }, () => Number.POSITIVE_INFINITY);
    const previousNode = Array.from({ length: graph.length }, () => -1);
    const previousEdge = Array.from({ length: graph.length }, () => -1);
    const queued = Array.from({ length: graph.length }, () => false);
    const queue = [sourceNode];
    distance[sourceNode] = 0;
    queued[sourceNode] = true;

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const node = queue[queueIndex];
      queued[node] = false;
      for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
        const edge = graph[node][edgeIndex];
        if (edge.capacity === 0 || distance[edge.to] <= distance[node] + edge.cost) continue;
        distance[edge.to] = distance[node] + edge.cost;
        previousNode[edge.to] = node;
        previousEdge[edge.to] = edgeIndex;
        if (!queued[edge.to]) {
          queue.push(edge.to);
          queued[edge.to] = true;
        }
      }
    }

    if (previousNode[sinkNode] === -1) {
      throw new Error("Code-volume matrix could not be balanced");
    }
    let addedFlow = requiredFlow - flow;
    for (let node = sinkNode; node !== sourceNode; node = previousNode[node]) {
      addedFlow = Math.min(addedFlow, graph[previousNode[node]][previousEdge[node]].capacity);
    }
    for (let node = sinkNode; node !== sourceNode; node = previousNode[node]) {
      const edge = graph[previousNode[node]][previousEdge[node]];
      edge.capacity -= addedFlow;
      graph[node][edge.reverseIndex].capacity += addedFlow;
    }
    flow += addedFlow;
  }

  return baseUnits.map((row, rowIndex) => row.map((base, columnIndex) => {
    const rowNode = rowNodeStart + rowIndex;
    const roundedUp = graph[rowNode][cellEdgeIndexes[rowIndex][columnIndex]].capacity === 0;
    return (base + (roundedUp ? 1 : 0)) * quantum;
  }));
}

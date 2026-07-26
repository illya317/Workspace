const MONEY_TOLERANCE = 0.01;

export function reconcileShipmentReceivedAmount({
  amount,
  receivedAmount,
  uncollectedAmount,
}) {
  if (receivedAmount !== null) {
    return { value: receivedAmount, reconciled: false };
  }

  if (
    amount !== null
    && uncollectedAmount !== null
    && Math.abs(amount - uncollectedAmount) <= MONEY_TOLERANCE
  ) {
    return { value: 0, reconciled: true };
  }

  return { value: null, reconciled: false };
}

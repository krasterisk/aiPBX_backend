/** Balance depleted (≤0): service blocked; skip low-balance / runway / critical alerts. */
export function isBalanceDepleted(balanceUsd: number): boolean {
    return !Number.isFinite(balanceUsd) || balanceUsd <= 0;
}

export interface CallTypeCounts {
  incoming: number;
  outgoing: number;
  internal: number;
}
export function withCallTypeCounts<T extends { label: string }>(
  points: T[],
  records: Array<{ createdAt?: string | Date; callType?: string }>,
): Array<T & { byCallType: CallTypeCounts }> {
  const groups = new Map<string, CallTypeCounts>();
  for (const record of records) {
    if (!record.createdAt) continue;
    const date = new Date(record.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const stamp = date.toISOString();
    const type =
      record.callType === "outgoing" || record.callType === "internal"
        ? record.callType
        : "incoming";
    for (const key of [
      stamp.slice(0, 7),
      stamp.slice(0, 10),
      stamp.slice(0, 13),
    ]) {
      const counts = groups.get(key) ?? {
        incoming: 0,
        outgoing: 0,
        internal: 0,
      };
      counts[type]++;
      groups.set(key, counts);
    }
  }
  return points.map((point) => ({
    ...point,
    byCallType: groups.get(
      point.label.slice(0, point.label.includes("T") ? 13 : point.label.length),
    ) ?? { incoming: 0, outgoing: 0, internal: 0 },
  }));
}

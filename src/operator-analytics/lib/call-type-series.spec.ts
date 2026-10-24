import { withCallTypeCounts } from "./call-type-series";
it("preserves totals and splits UTC hour/day/month buckets by all three call types", () => {
  const rows = [
    { createdAt: "2026-10-24T13:00:00+07:00", callType: "incoming" },
    { createdAt: "2026-10-24T06:59:59Z", callType: "outgoing" },
    { createdAt: "2026-10-24T07:00:00Z", callType: "internal" },
    { createdAt: "2026-10-24T07:30:00Z" },
  ];
  const counts = { incoming: 2, outgoing: 1, internal: 1 };
  expect(
    withCallTypeCounts([{ label: "2026-10-24", callsCount: 4 }], rows)[0]
      .byCallType,
  ).toEqual(counts);
  expect(
    withCallTypeCounts([{ label: "2026-10" }], rows)[0].byCallType,
  ).toEqual(counts);
  expect(
    withCallTypeCounts([{ label: "2026-10-24T06:00:00.000Z" }], rows)[0]
      .byCallType,
  ).toEqual({ incoming: 1, outgoing: 1, internal: 0 });
  expect(
    withCallTypeCounts([{ label: "2026-10-25" }], rows)[0].byCallType,
  ).toEqual({ incoming: 0, outgoing: 0, internal: 0 });
});

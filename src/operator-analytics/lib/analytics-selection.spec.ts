import { Op, Sequelize } from "sequelize";
import {
  applyAnalyticsSelection,
  appendAnalyticsSelectionSql,
  selectedOperators,
} from "./analytics-selection";
import { buildDashboardCdrWhere } from "./dashboard-aggregation";

describe("scoped analytics selection", () => {
  const operatorFilters = JSON.stringify([
    { userId: "99", operatorId: "203" },
    { userId: "100", operatorId: "203" },
  ]);
  it("intersects the operator union with the authorized tenant and project", () => {
    const where: any = buildDashboardCdrWhere(
      { projectId: 5, operatorFilters, callType: "outgoing" },
      false,
      "99",
      (v) => ({ [Op.like]: v }),
    );
    expect(where.userId).toBe("99");
    expect(where.projectId).toBe(5);
    expect(where[Op.and][0][Op.or]).toEqual([
      { userId: "99", operatorId: "203" },
      { userId: "100", operatorId: "203" },
    ]);
    expect(where[Op.and][1]).toEqual({ callType: "outgoing" });
    const sequelize = new Sequelize("qa", "qa", "qa", {
      dialect: "postgres",
      logging: false,
    });
    const sql = (
      sequelize.getQueryInterface() as any
    ).queryGenerator.whereItemsQuery(where);
    expect(sql).toContain("\"userId\" = '99'");
    expect(sql).toContain('"projectId" = 5');
    expect(sql).toContain(') AND "userId" = \'99\' AND "projectId" = 5');
    expect(sql).toContain(" OR ");
  });
  it("binds exact identities and types without interpolating supplied strings", () => {
    const clauses = ["authorized_scope"];
    const replacements = {};
    const name = "O'Brien'; DROP TABLE ignored; --";
    appendAnalyticsSelectionSql(
      "postgres",
      "c",
      {
        operatorFilters: JSON.stringify([
          { userId: "99", operatorNameExact: name },
        ]),
        callType: "internal",
      },
      clauses,
      replacements,
    );
    expect(clauses.join(" ")).not.toContain(name);
    expect(replacements).toEqual({
      selectedOp0userId: "99",
      selectedOp0assistantName: name,
      selectedCallType: "internal",
    });
    expect(clauses.join(" ")).toContain(":selectedOp0assistantName");
  });
  it("retains existing predicates and counts legacy missing type as incoming", () => {
    const where: any = { userId: "99", [Op.and]: [{ projectId: 5 }] };
    applyAnalyticsSelection(where, { callType: "incoming" });
    expect(where[Op.and][0]).toEqual({ projectId: 5 });
    expect(where[Op.and][1][Op.or]).toEqual([
      { callType: "incoming" },
      { callType: null },
    ]);
  });
  it.each([
    "not json",
    "{}",
    "[{}]",
    JSON.stringify([{ operatorId: 203 }]),
    JSON.stringify(Array.from({ length: 101 }, () => ({ operatorId: "1" }))),
  ])("rejects malformed/oversized selections %s", (raw) => {
    expect(() => selectedOperators(raw)).toThrow();
  });
  it("rejects unknown call types and allows an empty selection", () => {
    expect(() =>
      applyAnalyticsSelection({}, { callType: "unknown" }),
    ).toThrow();
    expect(selectedOperators("[]")).toEqual([]);
  });
});

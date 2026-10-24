import { BadRequestException } from "@nestjs/common";
import { Op } from "sequelize";

export interface AnalyticsSelection {
  operatorFilters?: string;
  callType?: string;
}
interface SelectedOperator {
  userId?: string;
  operatorId?: string;
  operatorNameExact?: string;
  withoutOperator?: boolean;
}

export function selectedOperators(raw?: string): SelectedOperator[] {
  if (raw == null || raw === "") return [];
  if (typeof raw !== "string" || raw.length > 20000)
    throw new BadRequestException("Invalid operator selection");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException("Invalid operator selection");
  }
  if (!Array.isArray(parsed) || parsed.length > 100)
    throw new BadRequestException("Invalid operator selection");
  return parsed.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new BadRequestException("Invalid operator selection");
    const item: SelectedOperator = {};
    for (const key of ["userId", "operatorId", "operatorNameExact"] as const) {
      if (value[key] == null) continue;
      if (
        typeof value[key] !== "string" ||
        !value[key].trim() ||
        value[key].length > 200
      )
        throw new BadRequestException("Invalid operator identity");
      item[key] = value[key];
    }
    if (value.withoutOperator === true) item.withoutOperator = true;
    if (!item.operatorId && !item.operatorNameExact && !item.withoutOperator)
      throw new BadRequestException("Missing operator identity");
    return item;
  });
}

function selectedType(raw?: string): string | undefined {
  if (raw == null || raw === "") return undefined;
  if (!["incoming", "outgoing", "internal"].includes(raw))
    throw new BadRequestException("Invalid call type");
  return raw;
}

/** Always AND with the existing authorized tenant/project scope. */
export function applyAnalyticsSelection(
  where: any,
  filters: AnalyticsSelection,
): void {
  const clauses: any[] = [];
  const operators = selectedOperators(filters.operatorFilters);
  if (operators.length)
    clauses.push({
      [Op.or]: operators.map((item) => ({
        ...(item.userId ? { userId: item.userId } : {}),
        ...(item.operatorId
          ? { operatorId: item.operatorId }
          : item.operatorNameExact
            ? { assistantName: item.operatorNameExact }
            : {
                [Op.and]: [
                  { [Op.or]: [{ operatorId: null }, { operatorId: "" }] },
                  {
                    [Op.or]: [
                      { assistantName: null },
                      { assistantName: "" },
                      { assistantName: "Unknown Operator" },
                    ],
                  },
                ],
              }),
      })),
    });
  const type = selectedType(filters.callType);
  if (type)
    clauses.push(
      type === "incoming"
        ? { [Op.or]: [{ callType: "incoming" }, { callType: null }] }
        : { callType: type },
    );
  if (clauses.length) where[Op.and] = [...(where[Op.and] ?? []), ...clauses];
}

export function appendAnalyticsSelectionSql(
  dialect: string,
  alias: string,
  filters: AnalyticsSelection,
  clauses: string[],
  replacements: Record<string, unknown>,
): void {
  const column = (name: string) =>
    alias + "." + (dialect === "mysql" ? "`" + name + "`" : '"' + name + '"');
  const operators = selectedOperators(filters.operatorFilters);
  if (operators.length)
    clauses.push(
      "(" +
        operators
          .map((item, index) => {
            const parts: string[] = [];
            const bind = (name: string, value: string) => {
              const key = "selectedOp" + index + name;
              replacements[key] = value;
              parts.push(column(name) + " = :" + key);
            };
            if (item.userId) bind("userId", item.userId);
            if (item.operatorId) bind("operatorId", item.operatorId);
            else if (item.operatorNameExact)
              bind("assistantName", item.operatorNameExact);
            else
              parts.push(
                "COALESCE(" +
                  column("operatorId") +
                  ", '') = '' AND COALESCE(" +
                  column("assistantName") +
                  ", '') IN ('', 'Unknown Operator')",
              );
            return "(" + parts.join(" AND ") + ")";
          })
          .join(" OR ") +
        ")",
    );
  const type = selectedType(filters.callType);
  if (type) {
    replacements.selectedCallType = type;
    clauses.push(
      "COALESCE(" + column("callType") + ", 'incoming') = :selectedCallType",
    );
  }
}

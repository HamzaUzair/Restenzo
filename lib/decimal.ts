import { Decimal } from "@prisma/client/runtime/library";

export { Decimal };

export type DecimalLike = Decimal | number | string | null | undefined;

export function toNumber(v: DecimalLike): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return Number(v.toString());
}

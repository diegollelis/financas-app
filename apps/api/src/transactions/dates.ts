/** `YYYY-MM-DD` ↔ the Date Prisma uses for a DATE column (midnight UTC, no time zone shift). */
export const toDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
export const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

/** `undefined` keeps the field as it is; `null` clears it. */
export function optionalDate(isoDate: string | null | undefined) {
  if (isoDate === undefined) return undefined;
  return isoDate === null ? null : toDate(isoDate);
}

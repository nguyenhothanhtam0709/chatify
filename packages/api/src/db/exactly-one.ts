/** The one row a query is known to return (an insert's `returning`, a row just locked). */
export const exactlyOne = <T>(rows: T[], what: string): T => {
  const [row] = rows;
  if (row === undefined) throw new Error(`Expected ${what}`);
  return row;
};

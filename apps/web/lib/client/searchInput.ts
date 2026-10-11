/** Search input helpers shared by the search bar and its focused tests. */
export function readRouteSearchQuery(value: string | string[] | undefined): string {
  // Next.js query parameters have already been URL-decoded.
  // A second decodeURIComponent call can throw on literal '%' or mangle '%20'.
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

export function appendSearchOperator(query: string, operator: string): string {
  if (!query || /\s$/.test(query)) return query + operator;
  return query + " " + operator;
}

export function removeUnsupportedSearchSymbols(query: string): string {
  return query.replace(/%/g, "");
}

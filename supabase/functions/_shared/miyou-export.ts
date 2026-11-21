import { collectExportRows } from './export-pagination.ts';

export const miyouExportTables = ['miyou_people', 'miyou_links', 'miyou_messages', 'miyou_pets', 'miyou_care_events', 'miyou_reports'] as const;

type PageResult = { data: { rows: unknown[]; total: number } | null; error: unknown };
export async function collectMiyouExport(fetchPage: (kind: string, offset: number) => PromiseLike<PageResult>) {
  const result: Record<string, unknown[]> = {};
  for (const table of miyouExportTables) {
    result[table] = await collectExportRows(async from => {
      const { data, error } = await fetchPage(table, from);
      return {data: data?.rows ?? null, count: data?.total ?? null, error};
    });
  }
  return result;
}

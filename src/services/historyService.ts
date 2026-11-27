import { supabase } from '../lib/supabase';

/**
 * Centralised access to the three history tables.
 *
 * History rows are written only when the user explicitly saves a result
 * (previously every keystroke inserted a row). Supabase returns errors in
 * the response instead of throwing, so the error is checked explicitly and
 * returned to the caller for display.
 */

export type HistoryTable = 'calculation_history' | 'estimation_history' | 'recommendation_history';

const TYPE_COLUMN: Record<HistoryTable, string> = {
  calculation_history: 'calculation_type',
  estimation_history: 'estimation_type',
  recommendation_history: 'recommendation_type',
};

export interface HistoryEntryInput {
  table: HistoryTable;
  /** Value for the table's *_type column, e.g. 'domestic', 'unified', 'solar'. */
  type: string;
  inputs: unknown;
  results: unknown;
}

/** Inserts one history row. Resolves to an error message, or null on success. */
export async function saveHistoryEntry(userId: string, entry: HistoryEntryInput): Promise<string | null> {
  try {
    const { error } = await supabase.from(entry.table).insert({
      user_id: userId,
      [TYPE_COLUMN[entry.table]]: entry.type,
      inputs: entry.inputs,
      results: entry.results,
    });
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Unexpected error while saving.';
  }
}

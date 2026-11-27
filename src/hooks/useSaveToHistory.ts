import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { saveHistoryEntry, HistoryEntryInput } from '../services/historyService';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveState {
  key: string;
  status: Exclude<SaveStatus, 'idle'>;
  error?: string;
}

/**
 * Explicit, de-duplicated save of a calculation result to history.
 * The status is tied to the exact inputs/results that were saved, so once the
 * user edits anything the status resets and the new result can be saved again,
 * while saving the same result twice is prevented.
 */
export function useSaveToHistory(entry: HistoryEntryInput) {
  const { user } = useAuth();
  const key = JSON.stringify(entry);
  const [state, setState] = useState<SaveState | null>(null);

  const current = state && state.key === key ? state : null;
  const status: SaveStatus = current ? current.status : 'idle';

  const save = useCallback(async () => {
    if (!user) return;
    setState({ key, status: 'saving' });
    const error = await saveHistoryEntry(user.id, entry);
    setState(error ? { key, status: 'error', error } : { key, status: 'saved' });
    // `key` is the serialised form of `entry`, so it fully captures it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, key]);

  return {
    save,
    status,
    error: current?.error ?? null,
    signedIn: Boolean(user),
    canSave: Boolean(user) && status !== 'saving' && status !== 'saved',
  };
}

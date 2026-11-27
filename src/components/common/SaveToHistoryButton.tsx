import React from 'react';
import { Save, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useSaveToHistory } from '../../hooks/useSaveToHistory';
import { HistoryEntryInput } from '../../services/historyService';

interface SaveToHistoryButtonProps {
  entry: HistoryEntryInput;
  disabled?: boolean;
}

const SaveToHistoryButton: React.FC<SaveToHistoryButtonProps> = ({ entry, disabled = false }) => {
  const { save, status, error, signedIn, canSave } = useSaveToHistory(entry);

  const label =
    status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved to history' : 'Save to history';
  const Icon = status === 'saving' ? Loader2 : status === 'saved' ? Check : Save;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void save()}
        disabled={disabled || !canSave}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon className={`h-4 w-4 ${status === 'saving' ? 'animate-spin' : ''}`} aria-hidden="true" />
        <span>{label}</span>
      </button>
      <p className="min-h-[1.25rem] text-sm" role="status" aria-live="polite">
        {status === 'error' && (
          <span className="inline-flex items-center gap-1 text-red-600">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Could not save: {error}
          </span>
        )}
        {!signedIn && <span className="text-gray-500">Sign in to save results.</span>}
        {disabled && signedIn && <span className="text-gray-500">Enter valid values to save.</span>}
      </p>
    </div>
  );
};

export default SaveToHistoryButton;

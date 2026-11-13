import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { submitModerationReport } from '../../lib/communityService';
import { ReportItem } from '../../types/luga';

interface ReportModalProps {
  target: {
    targetType: ReportItem['targetType'];
    targetId: string;
    targetSummary: string;
  } | null;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ReportModal({ target, onClose, onSubmitted }: ReportModalProps) {
  const { profile } = useAuth();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!target || !profile) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Please describe why you are reporting this content.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitModerationReport({
        targetType: target.targetType,
        targetId: target.targetId,
        targetSummary: target.targetSummary,
        reason,
        reporterId: profile.uid,
        reporterName: profile.fullName,
      });
      setReason('');
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-label="Report inappropriate content"
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Report {target.targetType}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report dialog"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/70 p-3 rounded-lg truncate">
          {target.targetSummary}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="report-reason" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Reason for Report
            </label>
            <textarea
              id="report-reason"
              rows={3}
              required
              minLength={3}
              maxLength={400}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain what policy or school guideline is violated..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

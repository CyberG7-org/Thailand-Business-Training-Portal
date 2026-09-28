'use client';

import { useRef, useState } from 'react';

type Labels = { play: string; pause: string; loading: string; error: string };
type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

/**
 * Thai read-aloud control on the band (design handoff, 02): fetches the cached/synthesized audio
 * URL on first play. The button is the control; the label beside it says what it will do.
 */
export function ReadAloudPlayer({ materialId, labels }: { materialId: string; labels: Labels }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  async function toggle() {
    if (status === 'playing') {
      audioRef.current?.pause();
      setStatus('paused');
      return;
    }
    if (status === 'paused' && audioRef.current) {
      await audioRef.current.play();
      setStatus('playing');
      return;
    }
    setStatus('loading');
    try {
      const response = await fetch('/api/tts?material=' + encodeURIComponent(materialId));
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? 'failed');
      const audio = new Audio(body.url);
      audio.onended = () => setStatus('idle');
      audio.onerror = () => setStatus('error');
      audioRef.current = audio;
      await audio.play();
      setStatus('playing');
    } catch {
      setStatus('error');
    }
  }

  const label =
    status === 'playing' ? labels.pause : status === 'loading' ? labels.loading : labels.play;

  return (
    <div className="mt-4 inline-flex flex-wrap items-center gap-3 rounded-full border border-white/20 bg-white/10 py-1.5 pr-4 pl-1.5 text-sm font-medium text-white">
      <button
        type="button"
        onClick={toggle}
        disabled={status === 'loading'}
        aria-pressed={status === 'playing'}
        aria-busy={status === 'loading'}
        aria-label={label}
        data-testid="read-aloud"
        data-status={status}
        className="grid size-11 place-items-center rounded-full bg-white text-brand-900 transition-colors hover:bg-gold-100 focus-visible:outline-gold-100 disabled:opacity-60"
      >
        {status === 'playing' ? (
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <span aria-hidden="true">{label}</span>
      {status === 'error' && (
        <span role="alert" className="rounded-full bg-bad-600 px-2.5 py-px text-white">
          {labels.error}
        </span>
      )}
    </div>
  );
}

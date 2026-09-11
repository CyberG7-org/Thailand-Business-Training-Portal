'use client';

import { useRef, useState } from 'react';

type Labels = { play: string; pause: string; loading: string; error: string };
type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

/** Thai read-aloud control: fetches the cached/synthesized audio URL on first play. */
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
      const response = await fetch(`/api/tts?material=${encodeURIComponent(materialId)}`);
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
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={status === 'loading'}
        aria-pressed={status === 'playing'}
        aria-busy={status === 'loading'}
        data-testid="read-aloud"
        data-status={status}
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        🔊 {label}
      </button>
      {status === 'error' && (
        <span role="alert" className="text-sm text-red-700">
          {labels.error}
        </span>
      )}
    </div>
  );
}

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { WebCallConfig } from '@/lib/integrations/vapi/config';
import { attachVapiCallAction, simulateCallAction, startCallSessionAction } from './actions';

type Phase = 'idle' | 'starting' | 'connecting' | 'live' | 'ending' | 'ended' | 'error';

type VapiLike = {
  start: (assistant: unknown, overrides?: unknown) => Promise<{ id?: string } | null>;
  stop: () => void;
  on: (event: string, handler: (payload?: unknown) => void) => unknown;
  removeAllListeners?: () => void;
};

const KNOWN_ERRORS = ['not_open', 'max_sessions', 'not_configured', 'no_assignment', 'not_found'];

/**
 * Drives one bank-call training session in the browser. With the real provider the call runs
 * over WebRTC through `@vapi-ai/web`; with the fake provider a "Simulate" button completes the
 * session server-side so the flow is testable without keys.
 */
export function CallPanel({ provider }: { provider: 'vapi' | 'fake' }) {
  const locale = useLocale();
  const t = useTranslations('bankCall');
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const vapiRef = useRef<VapiLike | null>(null);

  useEffect(() => () => vapiRef.current?.stop(), []);

  function showError(code: string) {
    setError(KNOWN_ERRORS.includes(code) ? t(`errors.${code}` as 'errors.not_open') : code);
    setPhase('error');
  }

  async function startLive(id: string, config: WebCallConfig) {
    setPhase('connecting');
    const { default: Vapi } = await import('@vapi-ai/web');
    const vapi = new Vapi(config.publicKey) as unknown as VapiLike;
    vapiRef.current = vapi;
    vapi.on('call-start', () => setPhase('live'));
    vapi.on('speech-start', () => setAssistantSpeaking(true));
    vapi.on('speech-end', () => setAssistantSpeaking(false));
    vapi.on('call-end', () => {
      setPhase('ended');
      router.refresh();
    });
    vapi.on('error', (payload) => {
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : t('errors.call_failed');
      setError(message);
      setPhase('error');
    });
    try {
      const call = await vapi.start(config.assistant, config.overrides);
      if (call?.id) await attachVapiCallAction(locale, id, call.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.call_failed'));
      setPhase('error');
    }
  }

  async function onStart() {
    setError(null);
    setPhase('starting');
    const result = await startCallSessionAction(locale);
    if (!result.ok) return showError(result.error);
    setSessionId(result.sessionId);
    if (result.provider === 'vapi' && result.config)
      return startLive(result.sessionId, result.config);
    setPhase('live');
  }

  async function onSimulate() {
    if (!sessionId) return;
    setPhase('ending');
    const result = await simulateCallAction(locale, sessionId);
    if (!result.ok) return showError(result.error ?? 'unknown');
    setPhase('ended');
    router.refresh();
  }

  function onHangUp() {
    setPhase('ending');
    vapiRef.current?.stop();
  }

  return (
    <div className="grid max-w-md gap-3 rounded border p-4" data-testid="call-panel">
      <p className="text-sm" data-testid="call-phase">
        {t(`phase.${phase}`)}
        {phase === 'live' && provider === 'vapi' && assistantSpeaking
          ? ` · ${t('assistantSpeaking')}`
          : ''}
      </p>
      {error && (
        <p role="alert" data-testid="call-error" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {(phase === 'idle' || phase === 'ended' || phase === 'error') && (
        <button
          type="button"
          onClick={onStart}
          data-testid="start-call"
          className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white"
        >
          {phase === 'idle' ? t('start') : t('startAgain')}
        </button>
      )}
      {phase === 'live' && provider === 'vapi' && (
        <button
          type="button"
          onClick={onHangUp}
          data-testid="hang-up"
          className="justify-self-start rounded border px-4 py-2"
        >
          {t('hangUp')}
        </button>
      )}
      {phase === 'live' && provider === 'fake' && (
        <div className="grid gap-2">
          <p className="text-xs text-gray-600">{t('fakeHint')}</p>
          <button
            type="button"
            onClick={onSimulate}
            data-testid="simulate-call"
            className="justify-self-start rounded border px-4 py-2"
          >
            {t('simulate')}
          </button>
        </div>
      )}
    </div>
  );
}

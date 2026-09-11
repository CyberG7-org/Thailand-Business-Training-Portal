import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { getOrCreateTtsAudioUrl } from '@/lib/db/tts';
import { getTtsProvider } from '@/lib/integrations/tts';
import { TtsError } from '@/lib/integrations/tts/types';

/**
 * GET /api/tts?material=<id> — Thai read-aloud for an approved study card.
 * Only active materials whose Thai localization has tts_enabled are ever synthesized.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.status !== 'active') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const materialId = request.nextUrl.searchParams.get('material');
  if (!materialId) return NextResponse.json({ error: 'not_available' }, { status: 400 });

  const db = await createSupabaseServerClient();
  const { data: localization } = await db
    .from('study_material_localizations')
    .select('body, title, tts_enabled, study_materials!inner(active, type)')
    .eq('material_id', materialId)
    .eq('language', 'th')
    .maybeSingle();
  const material = localization?.study_materials as { active: boolean; type: string } | null;
  if (!localization || !localization.tts_enabled || !material?.active || material.type !== 'card') {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  const provider = getTtsProvider();
  if (!provider) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  try {
    const text = `${localization.title}\n\n${localization.body ?? ''}`.trim();
    const url = await getOrCreateTtsAudioUrl(text, provider);
    return NextResponse.json({ url });
  } catch (e) {
    const code = e instanceof TtsError ? e.code : 'provider';
    return NextResponse.json({ error: code }, { status: 502 });
  }
}

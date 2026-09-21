import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Anonymous client for browser-side storage calls that carry their own authorisation (signed
 * upload URLs). It never holds a session; every data query still goes through server actions.
 */
function storageClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
  }
  return client;
}

/**
 * Sends a document from the browser straight to the `dbd-documents` bucket under a signed upload
 * URL issued by a server action — a function's request body is capped at 4.5 MB on Vercel, and
 * DBD packs are bigger. The bucket itself enforces the PDF type and the 30 MB limit.
 */
export async function uploadDocumentToSignedUrl(
  path: string,
  token: string,
  file: File,
): Promise<void> {
  const { error } = await storageClient()
    .storage.from('dbd-documents')
    .uploadToSignedUrl(path, token, file, { contentType: 'application/pdf' });
  if (error) throw new Error(error.message);
}

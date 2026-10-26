import { z } from 'zod';

export const initialUploadSchema = z.object({
  // 'failed': a Submanager upload stopped; the Manager reviews the retained source.
  state: z.enum(['pending', 'claimed', 'failed']),
  files: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      group: z.enum(['pack', 'invoice', 'agreement']),
    }),
  ),
});

export type InitialUpload = z.infer<typeof initialUploadSchema>;
export type InitialUploadFile = InitialUpload['files'][number];

/** Only flat paths inside this exact record prefix can be signed or removed. */
export function initialUploadFiles(id: string, structured: unknown): InitialUploadFile[] {
  const manifest = initialUploadSchema.safeParse(
    (structured as Record<string, unknown> | null)?.initial_upload,
  );
  return manifest.success
    ? manifest.data.files.filter((f) => {
        if (!f.path.startsWith(`${id}/`)) return false;
        const name = f.path.slice(id.length + 1);
        return /^[A-Za-z0-9._-]+$/.test(name) && !name.includes('..');
      })
    : [];
}

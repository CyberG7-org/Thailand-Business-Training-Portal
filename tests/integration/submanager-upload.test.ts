import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const state = vi.hoisted(() => ({ client: null as unknown, fail: false }));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('@/lib/db/server', () => ({ createSupabaseServerClient: async () => state.client }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('@/lib/integrations/extraction/company-image', async (original) => {
  const real = await original<typeof import('@/lib/integrations/extraction/company-image')>();
  return {
    ...real,
    extractCompanyImage: async () => {
      if (state.fail) throw new Error('provider unavailable');
      return real.companyImageSchema.parse({ company_name_en: 'Uploaded company' });
    },
  };
});
vi.mock('@/lib/integrations/extraction/company-pdf', async (original) => {
  const real = await original<typeof import('@/lib/integrations/extraction/company-pdf')>();
  const { companyImageSchema } = await import('@/lib/integrations/extraction/company-image');
  return {
    ...real,
    companyPdfAvailable: () => true,
    extractCompanyPdf: async () => {
      if (state.fail) throw new Error('provider unavailable');
      return companyImageSchema.parse({ company_name_en: 'Uploaded PDF' });
    },
  };
});
import {
  uploadCompanyImageAction,
  uploadCompanyPdfAction,
} from '@/app/[locale]/(admin)/admin/dbd-records/new/image-actions';
import {
  prepareUploadsAction,
  registerUploadsAction,
  saveDbdRecordAction,
  extractDocumentAction,
} from '@/app/[locale]/(admin)/admin/dbd-records/actions';
import {
  listTeamCompaniesForSubmanager,
  submanagerUploadContext,
} from '@/lib/db/submanager-upload';
import { deleteDbdRecord } from '@/lib/db/dbd-records';

describe('Submanager initial upload capability', () => {
  const svc = adminClient();
  let manager: TestUser;
  let sub: TestUser;
  let peer: TestUser;
  let client: Client;
  const records = new Set<string>();
  beforeAll(async () => {
    manager = await createTestUser('manager');
    sub = await createTestUser('submanager', { managerId: manager.id });
    peer = await createTestUser('submanager', { managerId: manager.id });
    client = await clientFor(sub);
    state.client = client;
  });
  afterAll(async () => {
    const { data } = await svc.from('dbd_records').select('id').eq('team_id', manager.id);
    for (const r of data ?? []) {
      const { data: files } = await svc.storage.from('dbd-documents').list(r.id);
      if (files?.length)
        await svc.storage.from('dbd-documents').remove(files.map((f) => `${r.id}/${f.name}`));
      await svc.from('dbd_records').delete().eq('id', r.id);
    }
    for (const user of [peer, sub, manager]) await deleteTestUser(user.id);
  });
  it.each(['image', 'pdf'] as const)(
    '%s preserves parent team and actual uploader',
    async (kind) => {
      const f = new FormData();
      f.set('locale', 'en');
      f.set(
        kind,
        new File(
          [
            kind === 'pdf'
              ? readFileSync('tests/fixtures/three-pages.pdf')
              : Buffer.from([255, 216, 255, 0]),
          ],
          `profile.${kind}`,
        ),
      );
      const result = await (kind === 'image' ? uploadCompanyImageAction : uploadCompanyPdfAction)(
        { error: null, recordId: null },
        f,
      );
      expect(result.error).toBeNull();
      expect(result.recordId).toBeTruthy();
      records.add(result.recordId!);
      const { data } = await svc
        .from('dbd_records')
        .select('*')
        .eq('id', result.recordId!)
        .single();
      expect(data).toMatchObject({ team_id: manager.id, created_by: sub.id });
    },
  );
  it.each(['image', 'pdf'] as const)(
    '%s extraction failure retains a source and Manager-visible attention record',
    async (kind) => {
      state.fail = true;
      const f = new FormData();
      f.set('locale', 'en');
      f.set(
        kind,
        new File(
          [
            kind === 'pdf'
              ? readFileSync('tests/fixtures/three-pages.pdf')
              : Buffer.from([255, 216, 255, 0]),
          ],
          `failed.${kind}`,
        ),
      );
      const result = await (kind === 'image' ? uploadCompanyImageAction : uploadCompanyPdfAction)(
        { error: null, recordId: null },
        f,
      );
      state.fail = false;
      expect(result.error).toContain('Manager');
      const { data } = await (
        await clientFor(manager)
      )
        .from('dbd_records')
        .select('*')
        .eq('created_by', sub.id);
      const failed = data?.find(
        (r) =>
          JSON.stringify(r.extraction_raw).includes('manager_review_required') &&
          JSON.stringify(r.structured_data).includes(
            kind === 'pdf' ? 'application/pdf' : 'image/jpeg',
          ),
      );
      expect(failed).toBeTruthy();
      const source = (failed!.structured_data as { source_image: { path: string } }).source_image;
      expect((await svc.storage.from('dbd-documents').download(source.path)).error).toBeNull();
    },
  );
  it('ZIP registers only its original manifest once; peers and forged paths cannot claim it', async () => {
    const prepared = await prepareUploadsAction({
      locale: 'en',
      id: null,
      links: { website: 'https://example.com', facebook: null },
      files: [{ name: 'dbd.pdf', size: 200, type: 'application/pdf' }],
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    records.add(prepared.id);
    const upload = prepared.uploads[0];
    expect(
      (
        await client.storage
          .from('dbd-documents')
          .uploadToSignedUrl(
            upload.path,
            upload.token,
            readFileSync('tests/fixtures/three-pages.pdf'),
            { contentType: 'application/pdf' },
          )
      ).error,
    ).toBeNull();
    const args = {
      locale: 'en',
      id: prepared.id,
      uploads: [{ path: upload.path, name: 'dbd.pdf' }],
      redirect: true,
    };
    state.client = await clientFor(peer);
    expect((await registerUploadsAction(args)).ok).toBe(false);
    state.client = client;
    expect(
      (
        await registerUploadsAction({
          ...args,
          uploads: [{ path: `${prepared.id}/forged.pdf`, name: 'bad.pdf' }],
        })
      ).ok,
    ).toBe(false);
    const attempts = await Promise.all([registerUploadsAction(args), registerUploadsAction(args)]);
    expect(attempts.filter((r) => r.ok)).toHaveLength(1);
    expect(attempts.find((r) => r.ok)).toMatchObject({
      ok: true,
      redirectTo: '/en/admin/users',
    });
    expect((await registerUploadsAction(args)).ok).toBe(false);
    expect(
      (
        await prepareUploadsAction({
          locale: 'en',
          id: prepared.id,
          files: [{ name: 'dbd.pdf', size: 200, type: 'application/pdf' }],
        })
      ).ok,
    ).toBe(false);
    const { data } = await svc
      .from('dbd_records')
      .select('team_id, created_by')
      .eq('id', prepared.id)
      .single();
    expect(data).toEqual({ team_id: manager.id, created_by: sub.id });
    const { data: docs } = await svc
      .from('dbd_documents')
      .select('uploaded_by')
      .eq('record_id', prepared.id);
    expect(docs).toEqual([{ uploaded_by: sub.id }]);
    const { data: audit } = await svc
      .from('audit_logs')
      .select('actor_id')
      .eq('entity_id', prepared.id)
      .eq('action', 'dbd_records.upload');
    expect(audit).toEqual([{ actor_id: sub.id }]);
  });
  it('retains staff-only generic edits and extraction, and denies direct RLS edits/deletes', async () => {
    const id = [...records][0];
    const f = new FormData();
    f.set('locale', 'en');
    f.set('id', id);
    await expect(
      saveDbdRecordAction({ ok: false, error: null, fieldErrors: {} }, f),
    ).rejects.toThrow('redirect:');
    await expect(extractDocumentAction({ ok: false, error: null }, f)).rejects.toThrow('redirect:');
    expect(
      (await client.from('dbd_records').update({ company_name_en: 'forged' }).eq('id', id).select())
        .data ?? [],
    ).toEqual([]);
    expect((await client.from('dbd_records').delete().eq('id', id).select()).data ?? []).toEqual(
      [],
    );
    expect((await svc.from('dbd_records').select('id').eq('id', id).single()).data?.id).toBe(id);
  });
  it('lists all team companies as display-only summaries and marks the actual creator', async () => {
    const { data: other } = await svc
      .from('dbd_records')
      .insert({ team_id: manager.id, created_by: peer.id, company_name_en: 'Peer company' })
      .select('id')
      .single();
    const rows = await listTeamCompaniesForSubmanager(sub.id);
    expect(rows.find((r) => r.id === other!.id)).toMatchObject({
      createdByMe: false,
      displayOnly: true,
    });
    expect(rows.find((r) => r.id === [...records][0])).toMatchObject({
      createdByMe: true,
      displayOnly: true,
    });
    expect(
      rows.every(
        (r) => !('structured_data' in r) && !('extraction_raw' in r) && !('document_path' in r),
      ),
    ).toBe(true);
  });
  it('rechecks the parent before both upload steps and summary reads', async () => {
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);
    try {
      await expect(submanagerUploadContext(sub.id)).rejects.toThrow('not-allowed');
      await expect(listTeamCompaniesForSubmanager(sub.id)).rejects.toThrow('not-allowed');
    } finally {
      await svc.from('profiles').update({ status: 'active' }).eq('id', manager.id);
    }
  });

  async function partialZip() {
    state.client = client;
    const prepared = await prepareUploadsAction({
      locale: 'en',
      id: null,
      links: { website: 'https://example.com', facebook: null },
      files: ['first.pdf', 'missing.pdf', 'retained.pdf'].map((name) => ({
        name,
        size: 200,
        type: 'application/pdf',
      })),
    });
    if (!prepared.ok) throw new Error(prepared.error);
    for (const index of [0, 2]) {
      const upload = prepared.uploads[index];
      expect(
        (
          await client.storage
            .from('dbd-documents')
            .uploadToSignedUrl(
              upload.path,
              upload.token,
              readFileSync('tests/fixtures/three-pages.pdf'),
              { contentType: 'application/pdf' },
            )
        ).error,
      ).toBeNull();
    }
    const result = await registerUploadsAction({
      locale: 'en',
      id: prepared.id,
      uploads: prepared.uploads.map((u, i) => ({
        path: u.path,
        name: ['first.pdf', 'missing.pdf', 'retained.pdf'][i],
      })),
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain('Manager');
    return prepared;
  }

  it('preserves partial ZIP source associations through a Manager save', async () => {
    const prepared = await partialZip();
    try {
      const before = await svc
        .from('dbd_records')
        .select('structured_data')
        .eq('id', prepared.id)
        .single();
      state.client = await clientFor(manager);
      const form = new FormData();
      form.set('locale', 'en');
      form.set('id', prepared.id);
      form.set('company_name_en', 'Manager corrected');
      expect(
        await saveDbdRecordAction({ ok: false, error: null, fieldErrors: {} }, form),
      ).toMatchObject({ ok: true });
      const after = await svc
        .from('dbd_records')
        .select('structured_data')
        .eq('id', prepared.id)
        .single();
      expect((after.data!.structured_data as Record<string, unknown>).initial_upload).toEqual(
        (before.data!.structured_data as Record<string, unknown>).initial_upload,
      );
      expect(
        (await svc.storage.from('dbd-documents').download(prepared.uploads[2].path)).error,
      ).toBeNull();
    } finally {
      state.client = client;
      await svc.storage.from('dbd-documents').remove(prepared.uploads.map((u) => u.path));
      await svc.from('dbd_records').delete().eq('id', prepared.id);
    }
  });

  it('Manager deletion removes registered and manifest-only sources after interrupted ZIP registration', async () => {
    const prepared = await partialZip();
    try {
      expect(await deleteDbdRecord(await clientFor(manager), prepared.id, null)).toBe(true);
      for (const index of [0, 2]) {
        expect(
          (await svc.storage.from('dbd-documents').download(prepared.uploads[index].path)).data,
        ).toBeNull();
      }
    } finally {
      await svc.storage.from('dbd-documents').remove(prepared.uploads.map((u) => u.path));
      await svc.from('dbd_records').delete().eq('id', prepared.id);
    }
  });
});

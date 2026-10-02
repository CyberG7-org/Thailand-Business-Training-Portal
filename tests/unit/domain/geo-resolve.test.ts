import { describe, expect, it } from 'vitest';
import { resolveRegisteredAddress } from '@/lib/domain/geo/resolve';
import type { GeoLookup } from '@/lib/domain/geo/types';

/** A tiny slice of the country, shaped like the tables. */
function memoryLookup(): GeoLookup {
  const provinces = [
    { id: 33, regionId: 3, nameTh: 'ร้อยเอ็ด', nameEn: 'Roi Et' },
    { id: 1, regionId: 2, nameTh: 'กรุงเทพมหานคร', nameEn: 'Bangkok' },
  ];
  const districts = [
    { id: 4507, provinceId: 33, nameTh: 'โพนทอง', nameEn: 'Phon Thong', prefixTh: 'อำเภอ' },
    { id: 1004, provinceId: 1, nameTh: 'บางรัก', nameEn: 'Bang Rak', prefixTh: 'เขต' },
  ];
  const subdistricts = [
    {
      id: 450705,
      districtId: 4507,
      nameTh: 'หนองใหญ่',
      nameEn: 'Nong Yai',
      prefixTh: 'ตำบล',
      postcode: '45110',
    },
    // Two places in one district that differ by a mark only.
    {
      id: 450790,
      districtId: 4507,
      nameTh: 'นาแก้ว',
      nameEn: 'Na Kaeo',
      prefixTh: 'ตำบล',
      postcode: '45110',
    },
    {
      id: 450791,
      districtId: 4507,
      nameTh: 'นาแก่ว',
      nameEn: 'Na Kaeo (2)',
      prefixTh: 'ตำบล',
      postcode: '45110',
    },
    {
      id: 100403,
      districtId: 1004,
      nameTh: 'สุริยวงศ์',
      nameEn: 'Suriyawong',
      prefixTh: 'แขวง',
      postcode: '10500',
    },
  ];
  return {
    provinceByName: async (n) => provinces.find((p) => p.nameTh === n) ?? null,
    districtByName: async (pid, n) =>
      districts.find((d) => d.provinceId === pid && d.nameTh === n) ?? null,
    subdistrictByName: async (did, n) =>
      subdistricts.find((s) => s.districtId === did && s.nameTh === n) ?? null,
    provinces: async () => provinces,
    districtsOf: async (pid) => districts.filter((d) => d.provinceId === pid),
    subdistrictsOf: async (did) => subdistricts.filter((s) => s.districtId === did),
  };
}

const ROI_ET = 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด';

describe('resolveRegisteredAddress', () => {
  it('resolves to the subdistrict and takes the postcode from geography when none is printed', async () => {
    const a = await resolveRegisteredAddress(ROI_ET, memoryLookup());
    expect(a).toMatchObject({
      status: 'resolved',
      issues: [],
      house_no: '87',
      moo: '9',
      subdistrict: 'หนองใหญ่',
      district: 'โพนทอง',
      province: 'ร้อยเอ็ด',
      province_id: 33,
      district_id: 4507,
      subdistrict_id: 450705,
      postcode: '45110',
      postcode_source: 'geography',
    });
  });

  it('keeps a printed postcode and flags one that disagrees', async () => {
    const ok = await resolveRegisteredAddress(`${ROI_ET} 45110`, memoryLookup());
    expect(ok).toMatchObject({ status: 'resolved', postcode_source: 'printed' });
    const bad = await resolveRegisteredAddress(`${ROI_ET} 45000`, memoryLookup());
    expect(bad).toMatchObject({ status: 'partial', issues: ['postcode_mismatch'] });
  });

  it('reports a district it cannot find instead of guessing, keeping the province', async () => {
    const a = await resolveRegisteredAddress(
      'เลขที่ 1 ตำบลหนองใหญ่ อำเภอไม่มีจริง จังหวัดร้อยเอ็ด',
      memoryLookup(),
    );
    expect(a).toMatchObject({
      status: 'partial',
      issues: ['district_not_found'],
      province_id: 33,
      district_id: null,
    });
  });

  it('is unresolved without an address or a known province', async () => {
    expect(await resolveRegisteredAddress(null, memoryLookup())).toMatchObject({
      status: 'unresolved',
      issues: ['no_address'],
    });
    expect(
      await resolveRegisteredAddress('เลขที่ 1 จังหวัดไม่มีจริง', memoryLookup()),
    ).toMatchObject({ status: 'unresolved', issues: ['province_not_found'] });
  });

  it('resolves names a reader dropped marks from, and spells the address as the tables do (D92)', async () => {
    // ร้อยเอ็ด, โพนทอง and หนองใหญ่ with every mark a PDF font keeps as a private glyph gone.
    const a = await resolveRegisteredAddress(
      'เลขที่ 87 หมูที่ 9 ตำบลหนองใหญ อำเภอโพนทอง จังหวัดรอยเอด',
      memoryLookup(),
    );
    expect(a).toMatchObject({
      status: 'resolved',
      issues: [],
      moo: '9',
      subdistrict: 'หนองใหญ่',
      province: 'ร้อยเอ็ด',
      subdistrict_id: 450705,
      full: ROI_ET,
    });
    // An address printed correctly is stored exactly as printed.
    expect((await resolveRegisteredAddress(ROI_ET, memoryLookup())).full).toBe(ROI_ET);
  });

  it('does not choose between two places that differ only by a mark', async () => {
    const a = await resolveRegisteredAddress(
      'เลขที่ 1 ตำบลนาแกว อำเภอโพนทอง จังหวัดร้อยเอ็ด',
      memoryLookup(),
    );
    expect(a).toMatchObject({ status: 'partial', issues: ['subdistrict_not_found'] });
    expect(a.full).toContain('ตำบลนาแกว');
    // Printed with its mark, each is found.
    const exact = await resolveRegisteredAddress(
      'เลขที่ 1 ตำบลนาแก้ว อำเภอโพนทอง จังหวัดร้อยเอ็ด',
      memoryLookup(),
    );
    expect(exact).toMatchObject({ status: 'resolved', subdistrict_id: 450790 });
  });

  it('resolves Bangkok through แขวง and เขต', async () => {
    const a = await resolveRegisteredAddress(
      'เลขที่ 999/9 ถนนพระราม 4 แขวงสุริยวงศ์ เขตบางรัก กรุงเทพฯ',
      memoryLookup(),
    );
    expect(a).toMatchObject({ status: 'resolved', postcode: '10500', road: 'พระราม 4' });
  });
});

import { describe, expect, it } from 'vitest';
import { FIXED_ROLE, dbdPeople, isDbdPerson, withStandardRole } from '@/lib/domain/standard-role';

const ONE = { directors: ['นางสาวกุลธิดา พลเยี่ยม'] };
const TWO = { directors: ['นางสาวกุลธิดา พลเยี่ยม', 'นายสมชาย ใจดี'] };

describe('withStandardRole (D94)', () => {
  it('gives every learner the same position, responsibilities and relationship', () => {
    expect(FIXED_ROLE).toEqual({
      position: 'กรรมการ',
      responsibilities: 'ดูแลการดำเนินงานของบริษัท',
      relationship_to_shareholders: 'เพื่อน',
    });
    const typed = {
      holder_name: 'นายสมชาย ใจดี',
      position: 'ผู้จัดการ',
      responsibilities: 'ดูแลลูกค้า',
      relationship_to_shareholders: 'พี่น้อง',
    };
    // What was typed for them before is not read; the picked name is kept.
    expect(withStandardRole(typed, TWO)).toEqual({ holder_name: 'นายสมชาย ใจดี', ...FIXED_ROLE });
  });

  it('takes the only director when nobody picked a name', () => {
    expect(withStandardRole({ holder_name: null }, ONE).holder_name).toBe('นางสาวกุลธิดา พลเยี่ยม');
    expect(withStandardRole({ holder_name: '  ' }, ONE).holder_name).toBe('นางสาวกุลธิดา พลเยี่ยม');
  });

  it('never chooses between several directors, and has no name without one', () => {
    expect(withStandardRole({ holder_name: null }, TWO).holder_name).toBeNull();
    expect(withStandardRole({ holder_name: null }, { directors: [] }).holder_name).toBeNull();
    expect(
      withStandardRole({ holder_name: null }, { directors: ['', '  '] }).holder_name,
    ).toBeNull();
  });
});

describe('the people printed in the DBD documents', () => {
  const record = {
    directors: [
      { name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null },
      { name_th: ' นายสมชาย ใจดี ', name_en: null },
    ],
    structured_data: {
      business: {
        shareholders: [
          { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: 'ไทย', shares: 18000, percent: null },
          { name: 'นางวันดี มีสุข', nationality: 'ไทย', shares: 2000, percent: null },
        ],
      },
    },
  };

  it('lists the directors, then the shareholders who are not directors, each once', () => {
    expect(dbdPeople(record)).toEqual({
      directors: ['นางสาวกุลธิดา พลเยี่ยม', 'นายสมชาย ใจดี'],
      people: ['นางสาวกุลธิดา พลเยี่ยม', 'นายสมชาย ใจดี', 'นางวันดี มีสุข'],
    });
    expect(dbdPeople(null)).toEqual({ directors: [], people: [] });
    expect(dbdPeople({ directors: null, structured_data: null })).toEqual({
      directors: [],
      people: [],
    });
  });

  it('accepts only a name that is printed there, spaces aside', () => {
    const { people } = dbdPeople(record);
    expect(isDbdPerson('นางวันดี มีสุข', people)).toBe(true);
    expect(isDbdPerson('นางวันดี  มีสุข', people)).toBe(true);
    expect(isDbdPerson('นายภายนอก', people)).toBe(false);
  });
});

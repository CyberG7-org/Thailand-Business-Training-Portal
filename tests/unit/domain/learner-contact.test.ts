import { describe, expect, it } from 'vitest';
import { firstContactProblem, learnerContactSchema } from '@/lib/domain/learner-contact';

const valid = { phone: '081-234-5678', contactEmail: 'somchai@example.co.th' };

/** D80: the contact details a manager gives a learner. */
describe('learnerContactSchema', () => {
  it('takes a Thai mobile in any usual shape and keeps it normalized', () => {
    for (const phone of ['0812345678', '081-234-5678', '+66 81 234 5678', '66812345678']) {
      expect(learnerContactSchema.parse({ ...valid, phone }).phone, phone).toBe('0812345678');
    }
  });

  it('requires a phone and an email, and names the field that is wrong', () => {
    const noPhone = learnerContactSchema.safeParse({ ...valid, phone: '02-123-4567' });
    expect(noPhone.success).toBe(false);
    if (!noPhone.success) expect(firstContactProblem(noPhone.error)).toBe('phone');

    const noEmail = learnerContactSchema.safeParse({ ...valid, contactEmail: 'not-an-email' });
    expect(noEmail.success).toBe(false);
    if (!noEmail.success) expect(firstContactProblem(noEmail.error)).toBe('contactEmail');

    expect(learnerContactSchema.safeParse({ ...valid, contactEmail: '' }).success).toBe(false);
  });

  it('leaves the website and Facebook page optional', () => {
    const parsed = learnerContactSchema.parse({ ...valid, website: ' ', facebookPage: '' });
    expect(parsed.website).toBeNull();
    expect(parsed.facebookPage).toBeNull();
  });

  it('stores a website with its scheme, however it was typed', () => {
    const parse = (website: string) => learnerContactSchema.parse({ ...valid, website }).website;
    expect(parse('example.co.th')).toBe('https://example.co.th');
    expect(parse('www.example.com/shop')).toBe('https://www.example.com/shop');
    expect(parse('http://example.com/')).toBe('http://example.com');
  });

  it('refuses a website that is not a host with a dot', () => {
    const bad = learnerContactSchema.safeParse({ ...valid, website: 'my shop' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(firstContactProblem(bad.error)).toBe('website');
  });

  it('takes a Facebook page as its address or as the page name', () => {
    const parse = (facebookPage: string) =>
      learnerContactSchema.parse({ ...valid, facebookPage }).facebookPage;
    expect(parse('tharavanich')).toBe('https://www.facebook.com/tharavanich');
    expect(parse('thara.vanich')).toBe('https://www.facebook.com/thara.vanich');
    expect(parse('facebook.com/tharavanich')).toBe('https://facebook.com/tharavanich');
    expect(parse('https://www.facebook.com/tharavanich/')).toBe(
      'https://www.facebook.com/tharavanich',
    );
    const bad = learnerContactSchema.safeParse({ ...valid, facebookPage: 'two words' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(firstContactProblem(bad.error)).toBe('facebookPage');
  });
});

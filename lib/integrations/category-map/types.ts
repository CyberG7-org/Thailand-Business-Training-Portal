export type CategoryOption = { key: string; label_th: string; label_en: string };
export type CategoryMapInput = {
  natureOfBusiness: string;
  productsServices: string | null;
  categories: CategoryOption[];
};
/** `key` is one of the given keys or null; `confidence` is 0–1. */
export type CategoryMapResult = { key: string | null; confidence: number };

export interface CategoryMapper {
  readonly name: 'claude' | 'fake';
  /** Recorded on the stored decision; null for the fake. */
  readonly model: string | null;
  map(input: CategoryMapInput): Promise<CategoryMapResult>;
}

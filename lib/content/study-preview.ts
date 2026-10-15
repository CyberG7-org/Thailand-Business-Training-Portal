export type StudyPreview = {
  introduction: string;
  facts: { label: string; value: string }[];
};

/** A compact excerpt from the same rendered Markdown used on the full study card. */
export function studyPreview(body: string): StudyPreview {
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const introduction = lines.find((line) => line && !line.startsWith('|')) ?? '';
  const tableRows = lines.filter((line) => line.startsWith('|') && line.endsWith('|'));
  const facts = tableRows
    .slice(2)
    .map((line) => {
      const [label, ...value] = line.slice(1, -1).split('|');
      return {
        label: label?.replace(/\*\*/g, '').trim() ?? '',
        value: value.join('|').replace(/\*\*/g, '').trim(),
      };
    })
    .filter(({ label, value }) => label && value && !value.includes('—'))
    .slice(0, 2);
  return { introduction, facts };
}

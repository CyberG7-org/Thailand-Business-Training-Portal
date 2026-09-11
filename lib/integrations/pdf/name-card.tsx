import 'server-only';
import path from 'node:path';
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { withThaiBreaks, type NameCardData } from '@/lib/domain/name-card';

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
let registered = false;

function registerFonts() {
  if (registered) return;
  Font.register({
    family: 'Sarabun',
    fonts: [
      { src: path.join(FONT_DIR, 'Sarabun-Regular.ttf'), fontWeight: 400 },
      { src: path.join(FONT_DIR, 'Sarabun-Bold.ttf'), fontWeight: 700 },
    ],
  });
  // Thai has no spaces between words; disable hyphenation and rely on the ZWSP breaks we insert.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

// Standard Thai business card: 90 mm × 54 mm (1 mm = 2.8346 pt).
const MM = 2.8346;
const styles = StyleSheet.create({
  page: { fontFamily: 'Sarabun', padding: 6 * MM, backgroundColor: '#ffffff' },
  company: { fontSize: 13, fontWeight: 700, color: '#111827' },
  companyEn: { fontSize: 8, color: '#4b5563', marginTop: 1 },
  holder: { fontSize: 11, fontWeight: 700, marginTop: 5 * MM },
  title: { fontSize: 8, color: '#374151' },
  footer: { marginTop: 'auto', fontSize: 7, color: '#374151', lineHeight: 1.4 },
  rule: { borderTopWidth: 0.5, borderTopColor: '#9ca3af', marginVertical: 2 * MM },
  meta: { fontSize: 6, color: '#9ca3af', marginTop: 1 },
});

export function NameCardDocument({ data }: { data: NameCardData }) {
  return (
    <Document title={`นามบัตร ${data.companyNameTh}`} language="th">
      <Page size={[90 * MM, 54 * MM]} style={styles.page}>
        <View>
          <Text style={styles.company}>{withThaiBreaks(data.companyNameTh)}</Text>
          {data.companyNameEn && <Text style={styles.companyEn}>{data.companyNameEn}</Text>}
        </View>
        <View>
          <Text style={styles.holder}>{withThaiBreaks(data.holderName)}</Text>
          <Text style={styles.title}>{withThaiBreaks(data.holderTitle)}</Text>
        </View>
        <View style={styles.footer}>
          <View style={styles.rule} />
          <Text>{withThaiBreaks(data.address)}</Text>
          <Text>โทร. {data.phoneDisplay}</Text>
          {data.juristicId && <Text>เลขทะเบียนนิติบุคคล {data.juristicId}</Text>}
          <Text style={styles.meta}>{data.templateVersion}</Text>
        </View>
      </Page>
    </Document>
  );
}

export interface PdfRenderer {
  readonly name: string;
  renderNameCard(data: NameCardData): Promise<Uint8Array>;
}

export class ReactPdfRenderer implements PdfRenderer {
  readonly name = 'react-pdf';
  async renderNameCard(data: NameCardData): Promise<Uint8Array> {
    registerFonts();
    const buffer = await renderToBuffer(<NameCardDocument data={data} />);
    return new Uint8Array(buffer);
  }
}

import 'server-only';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  Defs,
  Document,
  Font,
  LinearGradient,
  Page,
  Path,
  Polygon,
  Rect,
  Stop,
  StyleSheet,
  type Styles,
  Svg,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { NAME_CARD_COPY, thaiWords, type NameCardData } from '@/lib/domain/name-card';

type Style = Styles[string];

/** Nothing on a card is hyphenated; the engine reads this from the Text node itself. */
const wholeWord = (word: string): string[] => [word];

/**
 * Sara am (ำ) as one code point loses a glyph in the engine's glyph maps (a word's first or
 * last one); written as its two marks (nikhahit + sara aa) it draws the same and keeps them all.
 */
const shape = (text: string): string => text.replaceAll('\u0e33', '\u0e4d\u0e32');

function T({ children, style }: { style?: Style | Style[]; children?: React.ReactNode }) {
  return (
    <Text hyphenationCallback={wholeWord} style={style}>
      {typeof children === 'string' ? shape(children) : children}
    </Text>
  );
}

/**
 * Thai text that wraps between words and never hyphenates: each piece from thaiWords is its
 * own Text in a row that wraps, so the row breaks between pieces and the text engine, which
 * hyphenates any break it makes inside a word, never has to break. `style` is the type;
 * margins and clipping go on `box`.
 */
function ThaiText({ style, box, children }: { style: Style; box?: Style; children: string }) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap' }, box ?? {}]}>
      {thaiWords(children).map((word, i) => (
        <T key={i} style={style}>
          {word}
        </T>
      ))}
    </View>
  );
}

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
let registered = false;

/**
 * The portal's display and body faces when their files are present, Sarabun otherwise (the
 * only Thai face shipped so far); either way the PDF embeds what it uses.
 */
function registerFonts() {
  if (registered) return;
  const font = (file: string) => path.join(FONT_DIR, file);
  const sarabun = [
    { src: font('Sarabun-Regular.ttf'), fontWeight: 400 },
    { src: font('Sarabun-Bold.ttf'), fontWeight: 700 },
  ];
  Font.register({
    family: 'Display',
    fonts: existsSync(font('Trirong-SemiBold.ttf'))
      ? [
          { src: font('Trirong-Regular.ttf'), fontWeight: 400 },
          { src: font('Trirong-SemiBold.ttf'), fontWeight: 600 },
        ]
      : sarabun,
  });
  Font.register({
    family: 'Body',
    fonts: existsSync(font('IBMPlexSansThai-Regular.ttf'))
      ? [
          { src: font('IBMPlexSansThai-Regular.ttf'), fontWeight: 400 },
          { src: font('IBMPlexSansThai-Medium.ttf'), fontWeight: 500 },
          { src: font('IBMPlexSansThai-SemiBold.ttf'), fontWeight: 600 },
        ]
      : sarabun,
  });
  registered = true;
}

// Standard Thai business card: 90 mm × 54 mm (1 mm = 2.8346 pt).
const MM = 2.8346;
const W = 90 * MM;
const H = 54 * MM;

/** The design tokens of app/globals.css, as a PDF cannot read CSS variables. */
const C = {
  brand900: '#0c1a3a',
  brand700: '#1c3470',
  brand50: '#eef3fc',
  gold500: '#c8963e',
  gold100: '#f6ecd6',
  gold700: '#6e4c10',
  brand100: '#dbe5f8',
  ink900: '#111827',
  ink700: '#374151',
  ink500: '#5b6472',
  ink300: '#cbd2dc',
  ink100: '#e7eaef',
  white: '#ffffff',
};

const s = StyleSheet.create({
  // wrap=false keeps a card on one page; minHeight (not height) keeps the page at card size.
  page: { fontFamily: 'Body', backgroundColor: C.white, color: C.ink900, minHeight: H },
  abs: { position: 'absolute' },
  display: { fontFamily: 'Display', fontWeight: 600 },
  // Front
  mono: { fontFamily: 'Display', fontWeight: 600, fontSize: 40, color: C.white, lineHeight: 1 },
  monoSub: { fontSize: 4.6, color: C.gold100, letterSpacing: 1.1, marginTop: 4 },
  companyTh: {
    fontFamily: 'Display',
    fontWeight: 600,
    fontSize: 12,
    color: C.brand900,
    lineHeight: 1.3,
  },
  companyEn: { fontSize: 5.2, color: C.ink700, letterSpacing: 0.9, marginTop: 3 },
  nature: { fontSize: 5.6, color: C.ink700, lineHeight: 1.5 },
  tagline: {
    alignSelf: 'flex-start',
    marginTop: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: C.gold100,
    color: C.gold700,
    fontSize: 4.4,
    fontWeight: 600,
    letterSpacing: 1,
  },
  sloganTh: {
    fontFamily: 'Display',
    fontWeight: 600,
    fontSize: 6.4,
    color: C.white,
    lineHeight: 1.4,
  },
  sloganEn: {
    fontSize: 4.4,
    color: C.brand100,
    letterSpacing: 0.6,
    marginTop: 1.5,
    lineHeight: 1.5,
  },
  backTagline: {
    fontSize: 4.2,
    color: C.gold700,
    fontWeight: 600,
    letterSpacing: 1,
    textAlign: 'right',
    lineHeight: 1.7,
  },
  rule: { height: 0.5, backgroundColor: C.ink100 },
  reg: { fontSize: 4.6, color: C.ink500, marginTop: 3, textAlign: 'right' },
  // Back
  holderTh: {
    fontFamily: 'Display',
    fontWeight: 600,
    fontSize: 11,
    color: C.brand900,
    lineHeight: 1.3,
  },
  fact: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4.2 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: C.brand900,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4.5,
    marginTop: 0.5,
  },
  factText: { fontSize: 5.8, lineHeight: 1.4 },
  factSub: { fontSize: 4.4, color: C.ink500, marginTop: 0.5 },
  watermark: {
    fontFamily: 'Display',
    fontWeight: 600,
    fontSize: 58,
    color: C.brand50,
    lineHeight: 1,
  },
});

const ICONS: Record<'phone' | 'mail' | 'pin' | 'globe' | 'facebook', string[]> = {
  phone: [
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
  ],
  mail: [
    'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z',
    'M22 6l-10 7L2 6',
  ],
  pin: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  globe: [
    'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z',
    'M2 12h20',
    'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  ],
  facebook: ['M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z'],
};

function Dot({ icon }: { icon: keyof typeof ICONS }) {
  return (
    <View style={s.dot}>
      <Svg viewBox="0 0 24 24" width={5} height={5}>
        {ICONS[icon].map((d) => (
          <Path key={d} d={d} stroke={C.white} strokeWidth={2.4} fill="none" />
        ))}
      </Svg>
    </View>
  );
}

function Fact({
  icon,
  children,
  sub,
  thai,
}: {
  icon: keyof typeof ICONS;
  children: string;
  sub?: string;
  /** Thai text wraps between words (see ThaiText). */
  thai?: boolean;
}) {
  return (
    <View style={s.fact}>
      <Dot icon={icon} />
      <View style={{ flex: 1 }}>
        {thai ? (
          <ThaiText style={s.factText}>{children}</ThaiText>
        ) : (
          <T style={s.factText}>{children}</T>
        )}
        {sub && <T style={s.factSub}>{sub}</T>}
      </View>
    </View>
  );
}

/** Front: the company. The navy sweep with its gold edge carries the monogram. */
function Front({ data }: { data: NameCardData }) {
  return (
    <Page size={[W, H]} style={s.page} wrap={false}>
      <Svg width={W} height={H} style={[s.abs, { top: 0, left: 0 }]}>
        <Defs>
          <LinearGradient id="navy" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={C.brand900} />
            <Stop offset="1" stopColor={C.brand700} />
          </LinearGradient>
        </Defs>
        <Polygon points={'0,0 118,0 92,' + H + ' 0,' + H} fill="url(#navy)" />
        <Polygon points={'118,0 121,0 95,' + H + ' 92,' + H} fill={C.gold500} />
      </Svg>
      <View style={[s.abs, { left: 12 * MM - 20, top: 11 * MM }]}>
        <T style={s.mono}>{data.companyInitials}</T>
        {data.companyNameEn && <T style={s.monoSub}>{shortEnglishName(data.companyNameEn)}</T>}
      </View>
      <View style={[s.abs, { left: 130, top: 12 * MM, width: W - 130 - 12 }]}>
        <ThaiText style={s.companyTh}>{data.companyNameTh}</ThaiText>
        {data.companyNameEn && <T style={s.companyEn}>{data.companyNameEn.toUpperCase()}</T>}
        <T style={s.tagline}>{NAME_CARD_COPY.tagline}</T>
        {data.natureOfBusiness && (
          <View style={{ maxHeight: 30, overflow: 'hidden' }}>
            <ThaiText style={s.nature} box={{ marginTop: 7 }}>
              {data.natureOfBusiness}
            </ThaiText>
          </View>
        )}
      </View>
      <View style={[s.abs, { left: 12 * MM - 20, bottom: 9 * MM, width: 78 }]}>
        <ThaiText style={s.sloganTh}>{NAME_CARD_COPY.sloganTh}</ThaiText>
        <T style={s.sloganEn}>{NAME_CARD_COPY.sloganEn}</T>
      </View>
      <View style={[s.abs, { left: 130, right: 12, bottom: 9 }]}>
        <View style={s.rule} />
        {data.juristicId && <T style={s.reg}>{'เลขทะเบียนนิติบุคคล ' + data.juristicId}</T>}
      </View>
    </Page>
  );
}

/**
 * Back: the holder and how to reach them (D99): phone, company email, head office address, and
 * the learner's website and Facebook page when a manager gave them. Nothing else is printed.
 */
function Back({ data }: { data: NameCardData }) {
  return (
    <Page size={[W, H]} style={s.page} wrap={false}>
      <Svg width={W} height={3} style={[s.abs, { top: 0, left: 0 }]}>
        <Defs>
          <LinearGradient id="strip" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={C.brand900} />
            <Stop offset="0.6" stopColor={C.brand700} />
            <Stop offset="1" stopColor={C.gold500} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={3} fill="url(#strip)" />
      </Svg>
      <T style={[s.abs, s.watermark, { right: 4, bottom: 0 }]}>{data.companyInitials}</T>
      <T style={[s.abs, s.backTagline, { right: 12, top: 12, width: 70 }]}>
        {NAME_CARD_COPY.tagline.split(' · ').join('\n')}
      </T>
      <View style={[s.abs, { left: 12, top: 12, width: 170 }]}>
        <ThaiText style={s.holderTh}>{data.holderName}</ThaiText>
      </View>
      <View style={[s.abs, { left: 12, top: 52, width: 190 }]}>
        <Fact icon="phone">{data.phoneDisplay}</Fact>
        {data.email && <Fact icon="mail">{data.email}</Fact>}
        <Fact icon="pin" thai>
          {data.address}
        </Fact>
        {data.website && <Fact icon="globe">{data.website}</Fact>}
        {data.facebookPage && <Fact icon="facebook">{data.facebookPage}</Fact>}
      </View>
    </Page>
  );
}

/** "THARA VANICH CO., LTD." → "THARA VANICH", for the small line under the monogram. */
function shortEnglishName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[,.]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) => w && !['CO', 'LTD', 'LIMITED', 'COMPANY', 'PUBLIC', 'PCL', 'PLC', 'INC'].includes(w),
    )
    .join(' ');
}

export function NameCardDocument({ data }: { data: NameCardData }) {
  return (
    <Document title={'นามบัตร ' + data.companyNameTh} language="th">
      <Front data={data} />
      <Back data={data} />
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

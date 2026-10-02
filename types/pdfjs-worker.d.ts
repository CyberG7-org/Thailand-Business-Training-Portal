/** pdf.js ships no types for its worker build; `lib/pdf/render-pages.ts` only hands it over. */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}

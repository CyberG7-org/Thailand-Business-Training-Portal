import type { AppLocale } from '@/i18n/routing';

/** Fixed officer wording. No text generation or translation service runs during an interview. */
export const OFFICER_COPY: Record<
  AppLocale,
  {
    greeting: string;
    reask: string;
    pasted: string;
    next: string;
    probing: string;
    complete: string;
    limit: string;
    evasions: string;
    correct: string;
    wrong: string;
    ready: string;
    practise: string;
  }
> = {
  th: {
    greeting: 'สวัสดีค่ะ ดิฉันเป็นเจ้าหน้าที่ธนาคาร ขอสอบถามข้อมูลบริษัทนะคะ ',
    reask: 'ขอถามอีกครั้งนะคะ ',
    pasted: 'กรุณาตอบด้วยคำพูดของคุณเองนะคะ ',
    next: 'รับทราบค่ะ ',
    probing: 'ขอกลับมาที่ข้อนี้อีกครั้งนะคะ ',
    complete: 'ขอบคุณค่ะ ครบทุกข้อแล้ว ระบบจะสรุปผลให้นะคะ',
    limit: 'ขอบคุณค่ะ การสัมภาษณ์ครบจำนวนข้อความที่กำหนดแล้ว ธนาคารจะสรุปผลให้นะคะ',
    evasions: 'ขออภัยค่ะ วันนี้ธนาคารยังไม่สามารถดำเนินการต่อได้ ขอบคุณที่มาค่ะ',
    correct: 'ตรงกับข้อมูลบริษัท',
    wrong: 'ไม่ตรงกับข้อมูลบริษัท',
    ready: 'ผู้สมัครตอบคำถามเกี่ยวกับบริษัทได้ถูกต้องและครบถ้วน พร้อมสำหรับขั้นตอนต่อไป',
    practise: 'ธนาคารพบว่าบางคำตอบยังไม่ชัดเจน ควรทบทวนและลองอีกครั้ง',
  },
  en: {
    greeting: 'Hello, I am the bank officer. I will ask about your company. ',
    reask: 'Let me ask that again. ',
    pasted: 'Please answer in your own words. ',
    next: 'Thank you. ',
    probing: 'Let us return to this question. ',
    complete: 'Thank you. That is all the questions. Your result will be summarised now.',
    limit:
      'Thank you. The interview has reached its message limit. Your result will be summarised now.',
    evasions: 'I am sorry, the bank cannot continue today. Thank you.',
    correct: 'Matches the company information',
    wrong: 'Does not match the company information',
    ready: 'You answered the company questions correctly and are ready for the next step.',
    practise: 'Some answers need more practice. Review them and try again.',
  },
  zh: {
    greeting: '您好，我是银行工作人员。请回答几个关于您公司的问题。',
    reask: '请再回答一次。',
    pasted: '请用您自己的话回答。',
    next: '谢谢。',
    probing: '我们再回到这个问题。',
    complete: '谢谢，问题已全部问完。现在将汇总您的结果。',
    limit: '谢谢，面试已达到消息数量上限。现在将汇总您的结果。',
    evasions: '抱歉，银行今天无法继续。谢谢。',
    correct: '与公司资料一致',
    wrong: '与公司资料不符',
    ready: '您已正确回答公司相关问题，可以进入下一步。',
    practise: '部分答案仍需练习。请复习后再试一次。',
  },
  ms: {
    greeting: 'Helo, saya pegawai bank. Saya akan bertanya tentang syarikat anda. ',
    reask: 'Biar saya tanya sekali lagi. ',
    pasted: 'Sila jawab dengan kata-kata anda sendiri. ',
    next: 'Terima kasih. ',
    probing: 'Mari kembali kepada soalan ini. ',
    complete:
      'Terima kasih. Semua soalan telah selesai. Keputusan anda akan diringkaskan sekarang.',
    limit:
      'Terima kasih. Temu duga telah mencapai had mesej. Keputusan anda akan diringkaskan sekarang.',
    evasions: 'Maaf, bank tidak dapat meneruskan hari ini. Terima kasih.',
    correct: 'Sepadan dengan maklumat syarikat',
    wrong: 'Tidak sepadan dengan maklumat syarikat',
    ready: 'Anda menjawab soalan syarikat dengan betul dan bersedia untuk langkah seterusnya.',
    practise: 'Beberapa jawapan perlu diperbaiki. Semak dan cuba lagi.',
  },
  ta: {
    greeting: 'வணக்கம், நான் வங்கி அதிகாரி. உங்கள் நிறுவனத்தைப் பற்றி கேட்கிறேன். ',
    reask: 'மீண்டும் கேட்கிறேன். ',
    pasted: 'உங்கள் சொந்த வார்த்தைகளில் பதிலளிக்கவும். ',
    next: 'நன்றி. ',
    probing: 'இந்தக் கேள்விக்கு மீண்டும் வருவோம். ',
    complete: 'நன்றி. எல்லாக் கேள்விகளும் முடிந்தன. உங்கள் முடிவு இப்போது தொகுக்கப்படும்.',
    limit: 'நன்றி. நேர்காணலுக்கான செய்தி வரம்பு முடிந்தது. உங்கள் முடிவு இப்போது தொகுக்கப்படும்.',
    evasions: 'மன்னிக்கவும், வங்கியால் இன்று தொடர முடியாது. நன்றி.',
    correct: 'நிறுவனத் தகவலுடன் பொருந்துகிறது',
    wrong: 'நிறுவனத் தகவலுடன் பொருந்தவில்லை',
    ready:
      'நிறுவனம் பற்றிய கேள்விகளுக்குச் சரியாகப் பதிலளித்துள்ளீர்கள்; அடுத்த கட்டத்திற்குத் தயாராக உள்ளீர்கள்.',
    practise: 'சில பதில்களுக்கு மேலும் பயிற்சி தேவை. அவற்றைப் படித்து மீண்டும் முயற்சிக்கவும்.',
  },
};

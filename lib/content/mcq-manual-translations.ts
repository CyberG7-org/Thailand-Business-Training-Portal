import type { VariantText } from '@/lib/domain/mcq/variant';

type Translation = [prompt: string, options: [string, string, string, string], explanation: string];
type Language = 'ms' | 'ta';

/** Reviewed static wording for the v2 starter bank. Placeholders retain their source meaning. */
const WORDING: Record<Language, Record<string, Translation>> = {
  ms: {
    company_name: [
      'Apakah nama penuh syarikat yang didaftarkan?',
      [
        '{company_name_th}',
        '{company_name_th} (Awam)',
        '{company_name_th} (Thailand)',
        '{company_name_th} Holding',
      ],
      'Nama pada sijil ialah {company_name_th}. Sebut nama penuh tanpa menambah atau menggugurkan apa-apa.',
    ],
    registration_number: [
      'Apakah nombor pendaftaran syarikat?',
      [
        '{juristic_id}',
        '{juristic_id|id_mutation}',
        '{juristic_id|id_mutation}',
        '{juristic_id|id_mutation}',
      ],
      'Nombor pendaftaran mempunyai 13 digit: {juristic_id}.',
    ],
    registration_date: [
      'Bilakah syarikat didaftarkan?',
      [
        '{registered_on}',
        '{registered_on|date(-1y)}',
        '{registered_on|date(+1m)}',
        '{registered_on|date(-10d)}',
      ],
      'Tarikh pendaftaran pada sijil ialah {registered_on}.',
    ],
    registered_location: [
      'Di wilayah manakah syarikat didaftarkan?',
      [
        '{province}',
        '{province|geo_alt(region)}',
        '{province|geo_alt(region)}',
        '{province|geo_alt(region)}',
      ],
      'Alamat ibu pejabat pada sijil: {address}',
    ],
    director_count: [
      'Berapakah bilangan pengarah syarikat?',
      [
        '{director_count}',
        '{director_count|count(+1)}',
        '{director_count|count(+2)}',
        '{director_count|count(+3)}',
      ],
      'Sijil menyenaraikan {director_count} orang pengarah: {directors}.',
    ],
    director_identity: [
      'Siapakah pengarah syarikat yang berdaftar?',
      [
        '{directors}',
        'Semua pemegang saham syarikat',
        'Pendaftar yang menandatangani sijil',
        'Belum ada pengarah yang dilantik',
      ],
      'Sijil (perkara 2) menamakan pengarah: {directors}.',
    ],
    signing_authority: [
      'Siapakah yang berkuasa menandatangani bagi pihak syarikat?',
      [
        '{signing_authority}',
        'Mana-mana seorang pemegang saham boleh menandatangani',
        'Firma perakaunan menandatangani bagi pihak pengarah',
        'Mana-mana pekerja yang memegang cop syarikat',
      ],
      'Kuasa menandatangani pada sijil (perkara 3): {signing_authority}',
    ],
    registered_capital: [
      'Berapakah modal berdaftar syarikat?',
      [
        '{registered_capital}',
        '{registered_capital|numeric(x0.5)}',
        '{registered_capital|numeric(x2)}',
        '{registered_capital|numeric(x10)}',
      ],
      'Modal berdaftar pada sijil ialah {registered_capital}.',
    ],
    shareholder_count: [
      'Berapakah bilangan pemegang saham syarikat?',
      [
        '{shareholder_count}',
        '{shareholder_count|count(+1)}',
        '{shareholder_count|count(+2)}',
        '{shareholder_count|count(+3)}',
      ],
      'Senarai pemegang saham (BOJ.5) mempunyai {shareholder_count} nama: {shareholders}.',
    ],
    learner_shareholding: [
      'Berapakah jumlah saham yang anda miliki?',
      [
        '{my_shares} saham',
        '{my_shares|numeric(+1)} saham',
        '{my_shares|numeric(+2)} saham',
        'Saya tidak perlu tahu bilangan saham saya',
      ],
      'Semak senarai pemegang saham: anda memiliki {my_shares} saham.',
    ],
    actual_business: [
      'Apakah aktiviti perniagaan sebenar syarikat?',
      [
        '{nature_of_business}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
      ],
      'Aktiviti perniagaan utama syarikat: {nature_of_business}',
    ],
    products_services: [
      'Apakah produk atau perkhidmatan yang dijual oleh syarikat?',
      [
        '{products_services}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
      ],
      'Produk atau perkhidmatan syarikat: {products_services}',
    ],
    business_purpose: [
      'Mengapakah syarikat ditubuhkan?',
      [
        '{business_purpose}',
        'Untuk memegang aset bagi pihak orang lain',
        'Untuk membuka akaun bank bagi kegunaan orang lain',
        'Belum ada tujuan yang jelas',
      ],
      'Tujuan syarikat ditubuhkan: {business_purpose}',
    ],
    main_clients: [
      'Siapakah pelanggan utama syarikat?',
      [
        '{main_clients}',
        'Agensi kerajaan sahaja',
        'Pelanggan luar negara sahaja',
        'Belum ada pelanggan dan tidak tahu kepada siapa hendak menjual',
      ],
      'Pelanggan utama syarikat: {main_clients}',
    ],
    client_origin: [
      'Bagaimanakah syarikat mendapatkan pelanggan?',
      [
        '{client_origin}',
        'Saya tidak tahu dari mana pelanggan datang',
        'Orang yang tidak dikenali memindahkan wang sendiri',
        'Cara mendapatkan pelanggan belum difikirkan',
      ],
      'Sumber pelanggan syarikat: {client_origin}',
    ],
    main_suppliers: [
      'Siapakah pembekal utama syarikat?',
      [
        '{main_suppliers}',
        'Saya tidak tahu; orang lain mengurus semuanya',
        'Sesiapa yang paling murah pada hari itu; tiada pembekal tetap',
        'Orang yang tidak dikenali, tanpa dokumen',
      ],
      'Pembekal utama syarikat: {main_suppliers}',
    ],
    actual_business_location: [
      'Di manakah syarikat sebenarnya menjalankan perniagaan?',
      [
        '{business_address}',
        'Tiada tempat perniagaan; menggunakan alamat firma perakaunan',
        'Rumah seseorang yang tiada kaitan dengan syarikat',
        'Belum diketahui di mana syarikat akan beroperasi',
      ],
      'Tempat syarikat sebenarnya menjalankan perniagaan: {business_address}',
    ],
    monthly_revenue: [
      'Berapakah anggaran hasil bulanan syarikat?',
      [
        '{monthly_revenue_amount}',
        '{monthly_revenue_amount|numeric(x3)}',
        '{monthly_revenue_amount|numeric(x0.5)}',
        '{monthly_revenue_amount|numeric(x10)}',
      ],
      'Anggaran hasil bulanan syarikat: {monthly_revenue}',
    ],
    revenue_basis: [
      'Bagaimanakah anggaran hasil bulanan dikira?',
      [
        '{revenue_basis}',
        'Angka ini ditetapkan oleh firma perakaunan',
        'Dianggarkan berdasarkan pinjaman yang dijangka diterima',
        'Hanya tekaan tanpa asas',
      ],
      'Asas anggaran hasil: {revenue_basis}',
    ],
    average_transaction: [
      'Berapakah purata amaun setiap transaksi?',
      [
        '{average_transaction_amount}',
        '{average_transaction_amount|numeric(x2)}',
        '{average_transaction_amount|numeric(x0.2)}',
        '{average_transaction_amount|numeric(x10)}',
      ],
      'Purata amaun transaksi syarikat: {average_transaction}',
    ],
    monthly_transactions: [
      'Berapakah transaksi yang dijangka setiap bulan?',
      [
        '{monthly_transactions_count} jualan',
        '{monthly_transactions_count|numeric(x2)} jualan',
        '{monthly_transactions_count|numeric(x5)} jualan',
        '{monthly_transactions_count|numeric(x10)} jualan',
      ],
      'Bilangan transaksi syarikat setiap bulan: {monthly_transactions}',
    ],
    startup_source_of_funds: [
      'Dari manakah wang permulaan syarikat diperoleh?',
      [
        '{source_of_funds}',
        'Pinjaman tidak rasmi',
        'Wang yang diberikan orang lain supaya syarikat boleh dibuka',
        'Saya tidak tahu dari mana wang itu datang',
      ],
      'Sumber modal permulaan: {source_of_funds}',
    ],
    first_incoming_funds: [
      'Apakah wang pertama yang akan masuk ke dalam akaun?',
      [
        '{first_incoming_funds}',
        'Pindahan daripada orang yang tidak dikenali',
        'Deposit pelanggan untuk diserahkan kepada orang lain',
        'Saya tidak tahu wang itu akan datang dari mana',
      ],
      'Wang pertama yang masuk ke akaun syarikat: {first_incoming_funds}',
    ],
    bank_account_purpose: [
      'Mengapakah syarikat memerlukan akaun bank?',
      [
        '{account_purpose}',
        'Untuk menerima pindahan bagi pihak orang lain',
        'Kerana seseorang meminta akaun dibuka',
        'Untuk menyimpan simpanan peribadi',
      ],
      'Tujuan syarikat memerlukan akaun: {account_purpose}',
    ],
    promptpay_qr_purpose: [
      'Mengapakah syarikat memerlukan PromptPay atau QR?',
      [
        '{promptpay_qr_purpose}',
        'Supaya orang lain boleh menggunakannya untuk menerima wang',
        'Tidak diperlukan, tetapi lebih baik memilikinya',
        'Untuk mengelakkan rekod wang yang diterima',
      ],
      'Tujuan PromptPay / QR diperlukan: {promptpay_qr_purpose}',
    ],
    internet_banking_control: [
      'Siapakah yang patut mengawal perbankan internet syarikat?',
      [
        'Hanya pengarah syarikat yang diberi kuasa',
        'Firma perakaunan yang diupah syarikat',
        'Ejen yang membantu membuka akaun',
        'Mana-mana pekerja yang tahu kata laluan',
      ],
      'Bank mengharapkan pengarah yang diberi kuasa mengawal akaun sendiri dan tidak menyerahkannya kepada orang lain.',
    ],
    otp_control: [
      'Siapakah yang patut menyimpan telefon penerima OTP bank?',
      [
        'Pengarah syarikat yang diberi kuasa sendiri',
        'Firma perakaunan yang diupah syarikat',
        'Sesiapa yang membantu mendaftarkan syarikat',
        'Sesiapa sahaja yang meminta kod',
      ],
      'OTP mengesahkan transaksi akaun. Pengarah yang diberi kuasa menyimpan telefon dan menerima kod sendiri tanpa memberikannya kepada orang lain.',
    ],
    transaction_explanation: [
      'Apakah yang perlu dilakukan apabila bank bertanya tentang pindahan wang?',
      [
        'Terangkan asal wang dan tujuan perniagaan pindahan itu',
        'Katakan ia rahsia syarikat',
        'Katakan anda tidak tahu',
        'Minta orang lain menjawab bagi pihak anda',
      ],
      'Bank mengharapkan pengarah sendiri menerangkan asal wang dan tujuan transaksi.',
    ],
    supporting_documents: [
      'Dokumen apakah yang menyokong pembayaran perniagaan?',
      [
        'Invois, resit atau kontrak',
        'Tiada; rekod pindahan sudah mencukupi',
        'Hanya mesej dalam aplikasi sembang',
        'Dokumen yang dibuat kemudian apabila bank bertanya',
      ],
      'Transaksi perniagaan disokong oleh dokumen seperti invois, resit atau kontrak yang dibuat secara benar pada masa transaksi.',
    ],
    answer_consistency: [
      'Bagaimanakah jawapan anda harus sepadan dengan dokumen syarikat?',
      [
        'Sama seperti dokumen pendaftaran dan perniagaan sebenar',
        'Apa sahaja yang kedengaran paling baik',
        'Jawapan boleh berubah dari semasa ke semasa',
        'Apa sahaja yang dicadangkan pegawai',
      ],
      'Setiap jawapan sepadan dengan dokumen pendaftaran dan perniagaan sebenar syarikat, serta kekal sama setiap kali.',
    ],
  },
  ta: {
    company_name: [
      'நிறுவனத்தின் முழுப் பதிவு செய்யப்பட்ட பெயர் என்ன?',
      [
        '{company_name_th}',
        '{company_name_th} (பொது)',
        '{company_name_th} (தாய்லாந்து)',
        '{company_name_th} ஹோல்டிங்',
      ],
      'சான்றிதழில் உள்ள பெயர் {company_name_th}. எதையும் சேர்க்காமலும் விடாமலும் முழுப் பெயரைச் சொல்லுங்கள்.',
    ],
    registration_number: [
      'நிறுவனத்தின் பதிவெண் என்ன?',
      [
        '{juristic_id}',
        '{juristic_id|id_mutation}',
        '{juristic_id|id_mutation}',
        '{juristic_id|id_mutation}',
      ],
      'பதிவெண் 13 இலக்கங்களைக் கொண்டது: {juristic_id}.',
    ],
    registration_date: [
      'நிறுவனம் எப்போது பதிவு செய்யப்பட்டது?',
      [
        '{registered_on}',
        '{registered_on|date(-1y)}',
        '{registered_on|date(+1m)}',
        '{registered_on|date(-10d)}',
      ],
      'சான்றிதழில் உள்ள பதிவுத் திகதி {registered_on}.',
    ],
    registered_location: [
      'நிறுவனம் எந்த மாகாணத்தில் பதிவு செய்யப்பட்டுள்ளது?',
      [
        '{province}',
        '{province|geo_alt(region)}',
        '{province|geo_alt(region)}',
        '{province|geo_alt(region)}',
      ],
      'சான்றிதழில் உள்ள தலைமை அலுவலக முகவரி: {address}',
    ],
    director_count: [
      'நிறுவனத்தில் எத்தனை இயக்குநர்கள் உள்ளனர்?',
      [
        '{director_count}',
        '{director_count|count(+1)}',
        '{director_count|count(+2)}',
        '{director_count|count(+3)}',
      ],
      'சான்றிதழில் {director_count} இயக்குநர்கள் குறிப்பிடப்பட்டுள்ளனர்: {directors}.',
    ],
    director_identity: [
      'நிறுவனத்தின் பதிவு செய்யப்பட்ட இயக்குநர்கள் யார்?',
      [
        '{directors}',
        'நிறுவனத்தின் அனைத்து பங்குதாரர்களும்',
        'சான்றிதழில் கையெழுத்திட்ட பதிவாளர்',
        'இன்னும் இயக்குநர் நியமிக்கப்படவில்லை',
      ],
      'சான்றிதழின் 2ஆம் பகுதியில் இயக்குநர் பெயர் உள்ளது: {directors}.',
    ],
    signing_authority: [
      'நிறுவனத்தின் சார்பில் சட்டப்படி யார் கையெழுத்திட முடியும்?',
      [
        '{signing_authority}',
        'எந்த ஒரு பங்குதாரரும் கையெழுத்திடலாம்',
        'கணக்கியல் நிறுவனம் இயக்குநருக்குப் பதிலாக கையெழுத்திடும்',
        'நிறுவன முத்திரை வைத்திருக்கும் எந்த ஊழியரும்',
      ],
      'சான்றிதழின் 3ஆம் பகுதியில் உள்ள கையெழுத்து அதிகாரம்: {signing_authority}',
    ],
    registered_capital: [
      'நிறுவனத்தின் பதிவு செய்யப்பட்ட மூலதனம் எவ்வளவு?',
      [
        '{registered_capital}',
        '{registered_capital|numeric(x0.5)}',
        '{registered_capital|numeric(x2)}',
        '{registered_capital|numeric(x10)}',
      ],
      'சான்றிதழில் உள்ள பதிவு செய்யப்பட்ட மூலதனம் {registered_capital}.',
    ],
    shareholder_count: [
      'நிறுவனத்தில் எத்தனை பங்குதாரர்கள் உள்ளனர்?',
      [
        '{shareholder_count}',
        '{shareholder_count|count(+1)}',
        '{shareholder_count|count(+2)}',
        '{shareholder_count|count(+3)}',
      ],
      'பங்குதாரர் பட்டியலில் (BOJ.5) {shareholder_count} பெயர்கள் உள்ளன: {shareholders}.',
    ],
    learner_shareholding: [
      'உங்களிடம் எத்தனை பங்குகள் உள்ளன?',
      [
        '{my_shares} பங்குகள்',
        '{my_shares|numeric(+1)} பங்குகள்',
        '{my_shares|numeric(+2)} பங்குகள்',
        'எனது பங்குகளின் எண்ணிக்கையை நான் அறிய வேண்டியதில்லை',
      ],
      'பங்குதாரர் பட்டியலைப் பாருங்கள்: உங்களிடம் {my_shares} பங்குகள் உள்ளன.',
    ],
    actual_business: [
      'நிறுவனத்தின் உண்மையான வணிகச் செயல்பாடுகள் என்ன?',
      [
        '{nature_of_business}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
      ],
      'நிறுவனத்தின் முக்கிய வணிகச் செயல்பாடுகள்: {nature_of_business}',
    ],
    products_services: [
      'நிறுவனம் என்ன பொருட்கள் அல்லது சேவைகளை விற்கிறது?',
      [
        '{products_services}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
      ],
      'நிறுவனத்தின் பொருட்கள் அல்லது சேவைகள்: {products_services}',
    ],
    business_purpose: [
      'நிறுவனம் ஏன் தொடங்கப்பட்டது?',
      [
        '{business_purpose}',
        'மற்றொருவருக்காகச் சொத்துகளை வைத்திருக்க',
        'மற்றவர்கள் பயன்படுத்த வங்கிக் கணக்கைத் திறக்க',
        'இன்னும் தெளிவான நோக்கம் இல்லை',
      ],
      'நிறுவனம் தொடங்கப்பட்டதன் நோக்கம்: {business_purpose}',
    ],
    main_clients: [
      'நிறுவனத்தின் முக்கிய வாடிக்கையாளர்கள் யார்?',
      [
        '{main_clients}',
        'அரசு அமைப்புகள் மட்டுமே',
        'வெளிநாட்டு வாடிக்கையாளர்கள் மட்டுமே',
        'இன்னும் வாடிக்கையாளர்கள் இல்லை; யாருக்கு விற்க வேண்டும் என்பதும் தெரியாது',
      ],
      'நிறுவனத்தின் முக்கிய வாடிக்கையாளர்கள்: {main_clients}',
    ],
    client_origin: [
      'நிறுவனம் வாடிக்கையாளர்களை எப்படிப் பெறுகிறது?',
      [
        '{client_origin}',
        'வாடிக்கையாளர்கள் எங்கிருந்து வருகிறார்கள் என்று எனக்குத் தெரியாது',
        'அறிமுகமில்லாதவர்கள் தாங்களாகவே பணம் அனுப்புகிறார்கள்',
        'வாடிக்கையாளர்களை எப்படிப் பெறுவது என்று இன்னும் யோசிக்கவில்லை',
      ],
      'நிறுவனத்திற்கு வாடிக்கையாளர்கள் வரும் வழி: {client_origin}',
    ],
    main_suppliers: [
      'நிறுவனத்தின் முக்கிய வழங்குநர்கள் யார்?',
      [
        '{main_suppliers}',
        'எனக்குத் தெரியாது; மற்றொருவர் அனைத்தையும் கவனிக்கிறார்',
        'அன்று குறைந்த விலை தருபவர்; வழக்கமான வழங்குநர் இல்லை',
        'ஆவணங்கள் இல்லாமல் அறிமுகமில்லாதவர்களிடமிருந்து',
      ],
      'நிறுவனத்தின் முக்கிய வழங்குநர்கள்: {main_suppliers}',
    ],
    actual_business_location: [
      'நிறுவனம் உண்மையில் எங்கு செயல்படுகிறது?',
      [
        '{business_address}',
        'வணிக இடம் இல்லை; கணக்கியல் நிறுவனத்தின் முகவரியைப் பயன்படுத்துகிறது',
        'நிறுவனத்துடன் தொடர்பில்லாத ஒருவரின் வீடு',
        'நிறுவனம் எங்கு செயல்படும் என்று இன்னும் தெரியாது',
      ],
      'நிறுவனம் செயல்படும் உண்மையான இடம்: {business_address}',
    ],
    monthly_revenue: [
      'நிறுவனத்தின் மதிப்பிடப்பட்ட மாத வருமானம் எவ்வளவு?',
      [
        '{monthly_revenue_amount}',
        '{monthly_revenue_amount|numeric(x3)}',
        '{monthly_revenue_amount|numeric(x0.5)}',
        '{monthly_revenue_amount|numeric(x10)}',
      ],
      'நிறுவனத்தின் மதிப்பிடப்பட்ட மாத வருமானம்: {monthly_revenue}',
    ],
    revenue_basis: [
      'மாத வருமான மதிப்பீடு எப்படிக் கணக்கிடப்பட்டது?',
      [
        '{revenue_basis}',
        'இந்தத் தொகையை கணக்கியல் நிறுவனம் நிர்ணயித்தது',
        'நிறுவனம் பெறலாம் என எதிர்பார்க்கும் கடனை அடிப்படையாகக் கொண்டது',
        'ஆதாரமில்லாத வெறும் ஊகம்',
      ],
      'வருமான மதிப்பீட்டின் அடிப்படை: {revenue_basis}',
    ],
    average_transaction: [
      'ஒரு பரிவர்த்தனையின் சராசரி தொகை எவ்வளவு?',
      [
        '{average_transaction_amount}',
        '{average_transaction_amount|numeric(x2)}',
        '{average_transaction_amount|numeric(x0.2)}',
        '{average_transaction_amount|numeric(x10)}',
      ],
      'நிறுவனத்தின் சராசரி பரிவர்த்தனைத் தொகை: {average_transaction}',
    ],
    monthly_transactions: [
      'ஒவ்வொரு மாதமும் எத்தனை பரிவர்த்தனைகள் எதிர்பார்க்கப்படுகின்றன?',
      [
        '{monthly_transactions_count} விற்பனைகள்',
        '{monthly_transactions_count|numeric(x2)} விற்பனைகள்',
        '{monthly_transactions_count|numeric(x5)} விற்பனைகள்',
        '{monthly_transactions_count|numeric(x10)} விற்பனைகள்',
      ],
      'நிறுவனத்தின் மாதாந்திர பரிவர்த்தனைகள்: {monthly_transactions}',
    ],
    startup_source_of_funds: [
      'நிறுவனத்தின் தொடக்கப் பணம் எங்கிருந்து வந்தது?',
      [
        '{source_of_funds}',
        'முறையற்ற கடன்',
        'நிறுவனத்தைத் தொடங்க வேறொருவர் கொடுத்த பணம்',
        'பணம் எங்கிருந்து வந்தது என்று எனக்குத் தெரியாது',
      ],
      'தொடக்க மூலதனத்தின் மூலம்: {source_of_funds}',
    ],
    first_incoming_funds: [
      'கணக்கில் முதலில் வரும் பணம் எதற்கானது?',
      [
        '{first_incoming_funds}',
        'அறிமுகமில்லாதவரிடமிருந்து பணப் பரிமாற்றம்',
        'வேறொருவருக்கு அனுப்ப வேண்டிய வாடிக்கையாளரின் வைப்பு',
        'அது என்னவாக இருக்கும் என்று எனக்குத் தெரியாது',
      ],
      'நிறுவனக் கணக்கில் முதலில் வரும் பணம்: {first_incoming_funds}',
    ],
    bank_account_purpose: [
      'நிறுவனத்திற்கு வங்கிக் கணக்கு ஏன் தேவை?',
      [
        '{account_purpose}',
        'மற்றவர்களுக்காகப் பணப் பரிமாற்றங்களைப் பெற',
        'யாரோ கணக்கைத் திறக்கச் சொன்னதால்',
        'தனிப்பட்ட சேமிப்பை வைத்திருக்க',
      ],
      'நிறுவனத்திற்குக் கணக்கு தேவைப்படுவதன் நோக்கம்: {account_purpose}',
    ],
    promptpay_qr_purpose: [
      'நிறுவனத்திற்கு PromptPay அல்லது QR ஏன் தேவை?',
      [
        '{promptpay_qr_purpose}',
        'மற்றவர்கள் அதைப் பயன்படுத்திப் பணம் பெற',
        'தேவையில்லை; இருந்தால் நல்லது',
        'பெறப்பட்ட பணத்தின் பதிவைத் தவிர்க்க',
      ],
      'PromptPay / QR தேவைப்படுவதன் நோக்கம்: {promptpay_qr_purpose}',
    ],
    internet_banking_control: [
      'நிறுவனத்தின் இணைய வங்கிச் சேவையை யார் கட்டுப்படுத்த வேண்டும்?',
      [
        'அதிகாரம் பெற்ற நிறுவன இயக்குநர் மட்டுமே',
        'நிறுவனம் பணியமர்த்திய கணக்கியல் நிறுவனம்',
        'கணக்கைத் திறக்க உதவிய முகவர்',
        'கடவுச்சொல் தெரிந்த எந்த ஊழியரும்',
      ],
      'அதிகாரம் பெற்ற இயக்குநர் கணக்கைத் தாமே கட்டுப்படுத்த வேண்டும்; மற்றவரிடம் ஒப்படைக்கக் கூடாது என்று வங்கி எதிர்பார்க்கிறது.',
    ],
    otp_control: [
      'வங்கி OTP வரும் தொலைபேசியை யார் வைத்திருக்க வேண்டும்?',
      [
        'அதிகாரம் பெற்ற நிறுவன இயக்குநரே',
        'நிறுவனம் பணியமர்த்திய கணக்கியல் நிறுவனம்',
        'நிறுவனத்தைப் பதிவு செய்ய உதவியவர்',
        'குறியீட்டைக் கேட்கும் யாரும்',
      ],
      'OTP கணக்குப் பரிவர்த்தனைகளை உறுதிப்படுத்துகிறது. அதிகாரம் பெற்ற இயக்குநர் தொலைபேசியையும் குறியீட்டையும் தாமே வைத்திருக்க வேண்டும்.',
    ],
    transaction_explanation: [
      'பணப் பரிமாற்றம் பற்றி வங்கி கேட்டால் நீங்கள் என்ன செய்ய வேண்டும்?',
      [
        'பணம் எங்கிருந்து வந்தது, பரிமாற்றத்தின் வணிக நோக்கம் என்ன என்பதை விளக்க வேண்டும்',
        'இது நிறுவன ரகசியம் என்று சொல்ல வேண்டும்',
        'எனக்குத் தெரியாது என்று சொல்ல வேண்டும்',
        'வேறொருவர் பதிலளிக்கச் செய்ய வேண்டும்',
      ],
      'பணம் எங்கிருந்து வந்தது, பரிவர்த்தனையின் நோக்கம் என்ன என்பதை இயக்குநரே விளக்க வேண்டும் என்று வங்கி எதிர்பார்க்கிறது.',
    ],
    supporting_documents: [
      'வணிகக் கட்டணத்திற்கு எந்த ஆவணங்கள் ஆதாரமாக இருக்க வேண்டும்?',
      [
        'விலைப்பட்டியல், ரசீது அல்லது ஒப்பந்தம்',
        'எதுவும் தேவையில்லை; பணப் பரிமாற்றப் பதிவு போதும்',
        'அரட்டைச் செயலியின் செய்தி மட்டும்',
        'வங்கி கேட்கும்போது பின்னர் தயாரிக்கும் ஆவணங்கள்',
      ],
      'வணிகப் பரிவர்த்தனைக்கு விலைப்பட்டியல், ரசீது அல்லது ஒப்பந்தம் போன்ற, அப்போதே உண்மையாகத் தயாரிக்கப்பட்ட ஆவணம் ஆதாரமாக இருக்க வேண்டும்.',
    ],
    answer_consistency: [
      'உங்கள் பதில்கள் நிறுவன ஆவணங்களுடன் எப்படிப் பொருந்த வேண்டும்?',
      [
        'பதிவு ஆவணங்களுடனும் உண்மையான வணிகத்துடனும் ஒரே மாதிரியாக',
        'கேட்பதற்கு நன்றாக இருப்பது எதுவோ அது',
        'ஒவ்வொரு முறையும் வேறுபடலாம்',
        'அதிகாரி பரிந்துரைப்பது எதுவோ அது',
      ],
      'ஒவ்வொரு பதிலும் நிறுவனப் பதிவு ஆவணங்களுடனும் உண்மையான வணிகத்துடனும் பொருந்தி, ஒவ்வொரு முறையும் ஒரே மாதிரியாக இருக்க வேண்டும்.',
    ],
  },
};

export function starterQuizTranslation(
  conceptKey: string,
  language: Language,
  variantKey: string,
): VariantText | null {
  if (conceptKey === 'learner_shareholding' && !variantKey.endsWith('-1')) {
    return language === 'ms'
      ? {
          prompt: 'Berapakah peratus saham syarikat yang anda miliki?',
          options: {
            A: '{my_share_percent}',
            B: 'Saya tidak perlu tahu peratus pemilikan saya',
            C: 'Modal berdaftar ialah peratus pemilikan saya',
            D: 'Bank menentukan peratus pemilikan saya',
          },
          explanation:
            'Semak senarai pemegang saham: peratus pemilikan anda ialah {my_share_percent}.',
        }
      : {
          prompt: 'நிறுவனத்தில் உங்களுக்கு எத்தனை சதவீதப் பங்குகள் உள்ளன?',
          options: {
            A: '{my_share_percent}',
            B: 'எனது உரிமைச் சதவீதத்தை நான் அறிய வேண்டியதில்லை',
            C: 'பதிவு செய்யப்பட்ட மூலதனமே எனது உரிமைச் சதவீதம்',
            D: 'எனது உரிமைச் சதவீதத்தை வங்கி தீர்மானிக்கிறது',
          },
          explanation:
            'பங்குதாரர் பட்டியலைப் பாருங்கள்: உங்கள் உரிமைச் சதவீதம் {my_share_percent}.',
        };
  }
  const entry = WORDING[language][conceptKey];
  if (!entry) return null;
  const [prompt, [A, B, C, D], explanation] = entry;
  return { prompt, options: { A, B, C, D }, explanation };
}

/** Marathi catalogue, part 41. Keyed by the exact English source.
 * TestingPage.tsx coverage register and RouteGuard.tsx. */
export const MR_PART_41: Record<string, string> = {
  // Corporation `city` field values - passed to `t()` dynamically via
  // `cityName()` in corporations.ts, so no static i18n-audit scan ever finds
  // this call site; only a runtime sweep (or reading the source) surfaces it.
  Mumbai: 'मुंबई',
  Pune: 'पुणे',
  'Verified manually': 'स्वहस्ते पडताळणी केली',
  'Not yet covered': 'अद्याप समाविष्ट नाही',
  'Requires automation': 'स्वयंचलीकरण आवश्यक',
  'Permission engine': 'अनुमती इंजिन',
  'Data pipeline': 'माहिती पाइपलाइन',
  'Interface interaction': 'इंटरफेस परस्परसंवाद',
  'Build integrity': 'बांधणी अखंडता',
  'Route-level denial for a missing resource permission': 'गहाळ संसाधन अनुमतीसाठी मार्ग-स्तरीय नकार',
  'Signed in as Security Administrator and opened Water Intelligence directly by URL. The permission engine correctly returned "Access not authorised - Security Administrator does not hold intelligence:view", named the exact resource:action pair, and recorded the attempt rather than silently redirecting.':
    'सुरक्षा प्रशासक म्हणून प्रवेश करून URL द्वारे थेट जल बुद्धिमत्ता पान उघडले. अनुमती इंजिनने योग्यरित्या "प्रवेश अनुमत नाही - सुरक्षा प्रशासकाकडे intelligence:view नाही" असे परत दिले, नेमकी resource:action जोडी नमूद केली, आणि शांतपणे पुनर्निर्देशित करण्याऐवजी प्रयत्नाची नोंद केली.',
  'Action-level denial for a missing administer permission': 'गहाळ प्रशासन अनुमतीसाठी कृती-स्तरीय नकार',
  'Signed in as Municipal Commissioner and attempted to upload a CSV on Pilot Data Ingestion. Correctly blocked with "does not hold connector:administer" before the request reached the backend; switching to Security Administrator (which does hold it) then succeeded.':
    'महानगरपालिका आयुक्त म्हणून प्रवेश करून प्रायोगिक माहिती अंतर्ग्रहण पानावर CSV अपलोड करण्याचा प्रयत्न केला. विनंती बॅकएंडपर्यंत पोहोचण्यापूर्वीच "connector:administer नाही" असे सांगून योग्यरित्या अडवले गेले; सुरक्षा प्रशासकाकडे (ज्यांच्याकडे ती अनुमती आहे) वळल्यावर ते यशस्वी झाले.',
  'Every role\'s landing redirect resolves to a page it can actually read': 'प्रत्येक भूमिकेचा प्रारंभिक पुनर्निर्देश तिला प्रत्यक्षात वाचता येणाऱ्या पानावर पोहोचतो',
  "Fourteen demonstration roles exist in `demo-users.ts`; only two (Municipal Commissioner, Security Administrator) have had their post-sign-in landing route manually confirmed this session. The other twelve rely on `RoleLandingRedirect`'s declared logic, unexercised.":
    '`demo-users.ts` मध्ये चौदा प्रात्यक्षिक भूमिका आहेत; या सत्रात केवळ दोन (महानगरपालिका आयुक्त, सुरक्षा प्रशासक) यांचा प्रवेशोत्तर प्रारंभिक मार्ग स्वहस्ते पडताळला गेला आहे. उर्वरित बारा `RoleLandingRedirect` च्या नमूद तर्कावर अवलंबून आहेत, अद्याप न तपासलेले.',
  'Ward/zone resolution against a second corporation': 'दुसऱ्या महानगरपालिकेविरुद्ध प्रभाग/क्षेत्र निर्धारण',
  "`CORPORATIONS` now carries two records - Brihanmumbai and Pune - and `src/config/corporations.test.ts` runs `resolveWardCount`, `resolveZoneCount` and `resolveDivisions` against both generically (Pune resolves to 15 wards from its published ward-office count, a genuinely different regime and terminology to Brihanmumbai's 24). Automated, not manual - the one row in this category with a real test behind it.":
    '`CORPORATIONS` मध्ये आता दोन नोंदी आहेत - बृहन्मुंबई आणि पुणे - आणि `src/config/corporations.test.ts` दोन्हींविरुद्ध सर्वसाधारणपणे `resolveWardCount`, `resolveZoneCount` आणि `resolveDivisions` चालवते (पुणे त्याच्या प्रकाशित वॉर्ड-कार्यालय संख्येवरून १५ प्रभागांवर निर्धारित होते, बृहन्मुंबईच्या २४ पेक्षा खरोखर वेगळी रचना व संज्ञा). स्वयंचलित, स्वहस्ते नव्हे - या प्रवर्गातील खऱ्या चाचणीचा आधार असलेली ही एकमेव ओळ.',
  'Geography generator against a non-coastal city form': 'किनारपट्टी नसलेल्या शहर-स्वरूपाविरुद्ध भूगोल जनक',
  "Pune's `form.type` is `riverine` - landlocked, the opposite of Brihanmumbai's coastal shape. Generated via `scripts/preview-maps.mjs` and visually checked: a distinct, non-degenerate 15-ward tessellation with its own river backdrop, not a collapsed or overlapping shape. A manual check, not an automated one.":
    'पुण्याचा `form.type` हा `riverine` आहे - भूवेष्टित, बृहन्मुंबईच्या किनारी स्वरूपाच्या अगदी विरुद्ध. `scripts/preview-maps.mjs` द्वारे निर्माण करून दृश्यरीत्या तपासले: स्वतःच्या नदी पार्श्वभूमीसह एक वेगळी, सुयोग्य १५-प्रभाग विभागणी, कोसळलेली किंवा आच्छादित आकृती नव्हे. हा स्वहस्ते तपासलेला, स्वयंचलित नसलेला तपास.',
  'AI evaluation verdicts hold independent of tenant': 'AI मूल्यमापन निष्कर्ष टेनंटपासून स्वतंत्र राहतात',
  "Confirmed by reading `ai.service.ts`: `evaluations()` calls no `scopeToTenant` - the evaluation store is genuinely tenant-agnostic, not merely assumed so. This is a code-reading verification, not a runtime one.":
    '`ai.service.ts` वाचून पुष्टी केली: `evaluations()` कोणतेही `scopeToTenant` कॉल करत नाही - मूल्यमापन कोश खरोखर टेनंट-निरपेक्ष आहे, केवळ गृहीत धरलेले नाही. ही कोड-वाचन पडताळणी आहे, धावकालीन नव्हे.',
  'Marathi (mr) locale renders correctly end-to-end': 'मराठी (mr) भाषा सुरुवातीपासून शेवटपर्यंत योग्यरित्या दर्शवते',
  'The language switcher was confirmed present in the header; no page was actually switched to Marathi and visually checked for layout breakage, truncation or an untranslated string this session.':
    'भाषा स्विचर मथळ्यात उपस्थित असल्याची पुष्टी झाली; या सत्रात कोणतेही पान प्रत्यक्षात मराठीत बदलून मांडणी बिघाड, कापले जाणे किंवा अभाषांतरित मजकुरासाठी दृश्यरीत्या तपासले गेले नाही.',
  'Pilot CSV ingestion, full round trip': 'प्रायोगिक CSV अंतर्ग्रहण, संपूर्ण फेरी',
  'Uploaded a real 2-row CSV through the dev-server plugin, confirmed exact row/column counts and rendered content matched the file, then cleared it and confirmed the register returned to empty. The one genuinely non-simulated connector in this platform was exercised start to finish.':
    'डेव्ह-सर्व्हर प्लगइनद्वारे खऱ्या २-ओळींची CSV अपलोड केली, नेमकी ओळ/स्तंभ संख्या व सादर झालेला मजकूर फाइलशी जुळत असल्याची पुष्टी केली, नंतर ती हटवून नोंदवही रिकामी झाल्याची पुष्टी केली. या मंचावरील खऱ्या अर्थाने अनुकरण नसलेला एकमेव जोडणी बिंदू सुरुवातीपासून शेवटपर्यंत तपासला गेला.',
  'Every field cited in Data & Resources resolves to a live URL': 'माहिती व संसाधने मधील प्रत्येक उद्धृत क्षेत्र सक्रिय URL शी जुळते',
  '53 citations are recorded in `corporations.ts`. None has been re-fetched to confirm the source page still exists and still states what the note claims - link rot and source-content drift are unchecked.':
    '`corporations.ts` मध्ये ५३ उद्धरणे नोंदवली आहेत. स्रोत पान अजूनही अस्तित्वात आहे आणि टीपेत नमूद केल्याप्रमाणेच सांगते याची पुष्टी करण्यासाठी कोणतेही पुन्हा-आणले गेलेले नाही - दुवा-क्षरण व स्रोत-मजकूर बदल अनतपासलेले आहेत.',
  'Sign-in through to the console, live': 'प्रवेशापासून कन्सोलपर्यंत, प्रत्यक्ष',
  'Fresh browser state, root URL, through to Commissioner Cockpit: redirected to /login, signed in, landed on the portal front door, clicked a module tile, reached the full dashboard. Zero console errors at any step.':
    'ताजी ब्राउझर स्थिती, मूळ URL, आयुक्त कॉकपिटपर्यंत: /login वर पुनर्निर्देशित, प्रवेश केला, पोर्टलच्या प्रवेशद्वारावर पोहोचले, एक मॉड्यूल टाइल क्लिक केली, संपूर्ण डॅशबोर्डपर्यंत पोहोचले. कोणत्याही टप्प्यावर कन्सोल त्रुटी नाहीत.',
  'Contrast toggle actually changes application state': 'कॉन्ट्रास्ट टॉगल अनुप्रयोगाची स्थिती प्रत्यक्षात बदलतो',
  'Clicked High, then read `document.documentElement.dataset.contrast` directly rather than trusting the screenshot - confirmed it flips to "high". The visual difference is intentionally subtle, so this check has to be state-level, not pixel-level.':
    'उच्च क्लिक केले, नंतर स्क्रीनशॉटवर विश्वास ठेवण्याऐवजी थेट `document.documentElement.dataset.contrast` वाचले - ते "high" वर बदलल्याची पुष्टी केली. दृश्य फरक हेतुपुरस्सर सूक्ष्म आहे, त्यामुळे ही तपासणी स्थिती-स्तरावर असणे आवश्यक आहे, पिक्सेल-स्तरावर नव्हे.',
  'Font-size control cycles all three densities': 'फॉन्ट-आकार नियंत्रण तिन्ही घनता क्रमाने बदलते',
  'Confirmed present in the header and wired to the same preference store as Contrast, by reading the component; never actually clicked through compact → comfortable → spacious and confirmed the resulting layout at each step.':
    'घटक वाचून मथळ्यात उपस्थित असल्याची व कॉन्ट्रास्टसारख्याच पसंती कोशाशी जोडलेले असल्याची पुष्टी केली; कॉम्पॅक्ट → सुखद → प्रशस्त असे प्रत्यक्षात क्लिक करून प्रत्येक टप्प्यावरील परिणामी मांडणीची पुष्टी कधीच केली नाही.',
  'Full-project TypeScript build': 'संपूर्ण-प्रकल्प TypeScript बांधणी',
  '`tsc -b --force` run clean, zero errors, after every batch of changes this session - the one check in this register that is genuinely automated and repeatable, even though it is a type check rather than a behavioural test.':
    'या सत्रातील प्रत्येक बदल गटानंतर `tsc -b --force` स्वच्छ चालले, शून्य त्रुटी - या नोंदवहीतील ही एकमेव तपासणी आहे जी खरोखर स्वयंचलित व पुनरावृत्तीयोग्य आहे, जरी ती वर्तणूक चाचणीऐवजी प्रकार तपासणी असली तरी.',
  'A baseline automated test suite exists': 'आधारभूत स्वयंचलित चाचणी संच अस्तित्वात आहे',
  "Vitest + React Testing Library, wired into `npm test` and `npm run verify`: 42 tests covering the workflow engine, the permission engine (`canAccess`), the deterministic RNG, the corporation resolvers and `LiveIndicator`. It does not cover most of this platform's 80+ pages or their business logic - read it as a real foundation, not comprehensive coverage.":
    'Vitest + React Testing Library, `npm test` आणि `npm run verify` शी जोडलेले: कार्यप्रवाह इंजिन, अनुमती इंजिन (`canAccess`), निश्चितात्मक RNG, महानगरपालिका निर्धारक आणि `LiveIndicator` समाविष्ट करणाऱ्या ४२ चाचण्या. हे या मंचाच्या ८०+ पानांपैकी बहुतांश किंवा त्यांच्या व्यवसाय तर्काला समाविष्ट करत नाही - याला खरा पाया समजा, सर्वसमावेशक व्याप्ती नव्हे.',
  'What has actually been verified against this build, how, and what has not - stated plainly rather than claimed. This platform carries a baseline automated test suite, not comprehensive coverage; every row below says so where it applies.':
    'या बांधणीविरुद्ध प्रत्यक्षात काय पडताळले गेले, कसे, आणि काय पडताळले गेले नाही - दावा न करता स्पष्टपणे नमूद. या मंचावर आधारभूत स्वयंचलित चाचणी संच आहे, सर्वसमावेशक व्याप्ती नव्हे; खालील प्रत्येक ओळ जिथे लागू असेल तिथे हे नमूद करते.',
  'A baseline automated test suite exists, but coverage is not comprehensive.':
    'आधारभूत स्वयंचलित चाचणी संच अस्तित्वात आहे, परंतु व्याप्ती सर्वसमावेशक नाही.',
  '42 Vitest tests run in CI-ready form via `npm test`, but most rows below are still one-off checks performed live during development, not repeatable, CI-enforced guarantees. Treat this register as real progress on an honest baseline, not as evidence the platform is fully tested in a production sense.':
    '`npm test` द्वारे ४२ Vitest चाचण्या CI-सज्ज स्वरूपात चालतात, परंतु खालील बहुतांश ओळी अद्याप विकासादरम्यान प्रत्यक्ष केलेल्या एक-वेळच्या तपासण्या आहेत, पुनरावृत्तीयोग्य, CI-अंमलबजावणी हमी नव्हेत. या नोंदवहीला प्रामाणिक आधाररेषेवरील खरी प्रगती समजा, मंच उत्पादन-अर्थाने पूर्णपणे चाचणी केलेला असल्याचा पुरावा नव्हे.',
  'of {0} checks in this register': 'या नोंदवहीतील {0} तपासण्यांपैकी',
  'No manual or automated check exists': 'कोणतीही स्वहस्ते किंवा स्वयंचलित तपासणी अस्तित्वात नाही',
  'Checked once; needs a repeatable test': 'एकदा तपासले; पुनरावृत्तीयोग्य चाचणी आवश्यक',
  'Single-tenant only': 'केवळ एकल-टेनंट',
  'Never exercised beyond Brihanmumbai': 'बृहन्मुंबईपलीकडे कधीही तपासलेले नाही',
  'Coverage register': 'व्याप्ती नोंदवही',
  'Showing {0} of {1} checks.': '{1} पैकी {0} तपासण्या दाखवत आहे.',

  'This route carries no declared permission, so it cannot be authorised. A routed screen must have a navigation entry stating what it requires before any principal can open it.':
    'या मार्गाला कोणतीही नमूद अनुमती नाही, त्यामुळे तो अधिकृत करता येत नाही. कोणताही प्रमुख उघडण्यापूर्वी मार्गित पडद्याला त्याला काय आवश्यक आहे हे सांगणारी नेव्हिगेशन नोंद असणे आवश्यक आहे.',

  // Corporation-city interpolations that were raw template literals before
  // this pass (bypassing `t()` entirely) - found only by driving pages in a
  // real browser, since no static or runtime i18n check can see a template
  // literal that never calls `t()` at all.
  "Urban resilience currently reflects monsoon readiness, which is {0}'s dominant recurring hazard. The full multi-hazard picture is on the Urban Resilience screen.":
    'शहरी सह्यता सध्या मान्सून सज्जता प्रतिबिंबित करते, जो {0} चा प्रमुख आवर्ती धोका आहे. संपूर्ण बहु-धोका चित्र नागरी सह्यता पडद्यावर उपलब्ध आहे.',
  "Coastal resilience is the inverse of the mean erosion and inundation vulnerability across monitored shoreline segments - {0}'s exposure to sea-level and storm-surge risk.":
    'किनारी सह्यता ही निरीक्षित किनारपट्टी विभागांतील सरासरी धूप व जलमग्नता असुरक्षिततेचा व्यस्तांक आहे - {0} चा समुद्र-पातळी व वादळी-लाट जोखिमेस असलेला संपर्क.',
  "Today's {0}": 'आजचे {0}',
}

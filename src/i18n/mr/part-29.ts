/**
 * Marathi catalogue, part 29 - the public portal landing page. Keyed by the
 * exact English source.
 *
 * A municipal portal in this state is read in Marathi first, so this part
 * carries the whole of the portal's own vocabulary: the audience-segmented
 * navigation, the service catalogue beneath it, the accessibility controls,
 * the sign-in panel and the statutory footer.
 */
export const MR_PART_29: Record<string, string> = {

  /* --- Prospects and employees -------------------------------------------- */
  'Access and roles': 'प्रवेश व भूमिका',

  /* --- The live update line ---------------------------------------------- */
  Live: 'थेट',
  'Latest updates': 'ताज्या घडामोडी',
  'Pause the update line': 'घडामोडींची ओळ थांबवा',
  'Resume the update line': 'घडामोडींची ओळ पुन्हा सुरू करा',

  /* --- Accessibility and utility strip -------------------------------------- */
  'Skip to main content': 'मुख्य मजकुराकडे जा',
  'Government of {0}': '{0} शासन',
  'Government of {0} · Urban Development Department': '{0} शासन · नगरविकास विभाग',
  'Deployment: {0}': 'तैनाती: {0}',
  'Text size': 'अक्षर आकार',
  'Decrease text size': 'अक्षर आकार कमी करा',
  'Normal text size': 'नेहमीचा अक्षर आकार',
  'Increase text size': 'अक्षर आकार वाढवा',
  '24×7 helpline 1916': '24×7 मदत क्रमांक 1916',
  'Search services and information': 'सेवा व माहिती शोधा',
  'Portal navigation': 'संकेतस्थळ दिशादर्शन',

  /* --- Hero -------------------------------------------------------------------
     Sign-in left this page for `/login`, so the position, passphrase and audit
     strings that used to live here went with it - the login screen carries its
     own wording, and duplicating it here would leave two copies to keep in
     step. `Officer sign-in` stays: it is the label on the door. */
  Established: 'स्थापना',
  'Officer sign-in': 'अधिकारी प्रवेश',

  /* --- Footer ------------------------------------------------------------------ */
  'Privacy policy': 'गोपनीयता धोरण',
  Disclaimer: 'अस्वीकरण',
  'Contact us': 'संपर्क साधा',
  'Accessibility statement': 'सुलभता विधान',
  'Site map': 'संकेतस्थळ नकाशा',
  'This is a demonstration of the {0} platform, rendered for {1}. It is not the corporation’s live portal, no municipal system is contacted, and no transaction on this page is real.':
    'हे {0} मंचाचे प्रात्यक्षिक असून ते {1} साठी दर्शवले आहे. हे महानगरपालिकेचे प्रत्यक्ष संकेतस्थळ नाही, कोणत्याही महानगरपालिका प्रणालीशी संपर्क साधला जात नाही आणि या पानावरील कोणताही व्यवहार खरा नाही.',

  /* --- The corporation at a glance ------------------------------------------ */
  'The corporation': 'महानगरपालिका माहिती',

  /* --- Service delivery against the charter --------------------------------- */
  Performance: 'कामगिरी',
  Administration: 'प्रशासन',

  /* --- Notices and updates ---------------------------------------------------
     The board's own vocabulary follows the wording the corporations in this
     state already publish, so a reader who knows one portal reads this one. */
  'Notices and updates': 'सूचना आणि अद्यतने',
  'Know more': 'अधिक जाणून घ्या',

  /* --- Important links and the handset row ---------------------------------- */
  'Important links': 'महत्त्वाचे दुवे',
  'Google Play': 'गूगल प्ले',
  'App Store': 'ॲप स्टोअर',
  'Published by the corporation on its own portal. It is not a surface of this demonstration.':
    'महानगरपालिकेच्या स्वतःच्या संकेतस्थळावर प्रसिद्ध. हा या प्रात्यक्षिकाचा भाग नाही.',
  'Click here': 'क्लिक करा',

  /* --- Related links --------------------------------------------------------- */
  'Related links': 'संबंधित दुवे',
  'Previous related links': 'मागील संबंधित दुवे',
  'Next related links': 'पुढील संबंधित दुवे',

  /* --- The feedback tab and the footer -------------------------------------- */
  Feedback: 'प्रतिक्रिया',
  'Finding the office': 'कार्यालय शोधणे',
  'The control room answers round the clock, on every day of the year, for civic emergencies and for lodging a complaint.':
    'नागरी आपत्कालीन परिस्थिती व तक्रार नोंदणीसाठी नियंत्रण कक्ष वर्षातील प्रत्येक दिवशी चोवीस तास उपलब्ध आहे.',
  Contact: 'संपर्क',
  Information: 'माहिती',
  'Last reviewed and updated': 'अंतिम पुनरावलोकन व अद्यतन',
  'Visitors today': 'आजचे अभ्यागत',
  'Total visitors': 'एकूण अभ्यागत',

  /* --- Primary navigation, as the platform's own surfaces --------------------
     The tab bar is no longer segmented by audience, so these are the group
     headings and surface names the command rail behind sign-in also carries.
     "Intelligence" follows the catalogue's existing rendering, बुद्धिमत्ता. */
  'Risk & Response': 'धोका व प्रतिसाद',
  'Revenue & Finance': 'महसूल व वित्त',
  'AI & Trust': 'एआय व विश्वास',
  'Where a decision starts': 'निर्णय कोठून सुरू होतो',
  'How it is carried': 'तो कसा पुढे नेला जातो',
  'Held to account': 'उत्तरदायित्व',
  'Roads & the public realm': 'रस्ते व सार्वजनिक अवकाश',
  'Service delivery': 'सेवा वितरण',
  'Health & social development': 'आरोग्य व सामाजिक विकास',
  Preparedness: 'सज्जता',
  'Standing risk': 'कायमस्वरूपी धोके',
  'What comes in': 'जमा',
  'What goes out': 'खर्च',
  'Planning the city': 'शहराचे नियोजन',
  'The institution': 'संस्था',
  'Decision support': 'निर्णय सहाय्य',
  'Answerable for it': 'त्याचे उत्तरदायित्व',
  'Trade Licensing': 'व्यापार परवाना',
  'Housing & Social Welfare': 'गृहनिर्माण व समाजकल्याण',
  'Scenario Planning': 'परिदृश्य नियोजन',
  'Property Tax Intelligence': 'मालमत्ता कर बुद्धिमत्ता',
  'Revenue Reconciliation': 'महसूल ताळमेळ',
  'Contractor Performance': 'कंत्राटदार कामगिरी',
  'Building Permission': 'बांधकाम परवानगी',
  'Knowledge Graph': 'ज्ञान आलेख',
  'Council Resolutions': 'सभागृह ठराव',
  'AI Centre': 'एआय केंद्र',
  'Access & Roles': 'प्रवेश व भूमिका',
  'Security Posture': 'सुरक्षा स्थिती',

  /* --- The notice board, read by officers ----------------------------------- */
  'Read more': 'अधिक वाचा',
  'How access is granted': 'प्रवेश कसा दिला जातो',
  'Where every figure comes from': 'प्रत्येक आकडा कोठून येतो',
  'Each surface states the source of its numbers and which of them are modelled. An officer who cannot cite a figure in a meeting cannot use it.':
    'प्रत्येक पान आपल्या आकड्यांचा स्रोत आणि त्यातील कोणते प्रतिरूपित आहेत हे नमूद करते. बैठकीत ज्या आकड्याचा संदर्भ देता येत नाही, तो अधिकाऱ्याच्या कामाचा नाही.',
  Circulars: 'परिपत्रके',
  'Decisions awaiting approval': 'मंजुरीच्या प्रतीक्षेतील निर्णय',
  '{0} equity and allocation': '{0} समन्याय व वाटप',
  'Allocation read against need rather than against last year.':
    'गेल्या वर्षाच्या नव्हे तर गरजेच्या तुलनेत वाटप.',
  'Copilot on procurement': 'खरेदीवरील सहायक',
  'Contractor performance and tender history, asked in plain language.':
    'कंत्राटदार कामगिरी व निविदा इतिहास, सोप्या भाषेत विचारून.',
  'Integration health': 'एकात्मिकरण आरोग्य',
  'Which departmental feed is stale, and since when.': 'कोणता विभागीय स्रोत जुना आहे, आणि कधीपासून.',
  'Monsoon scenario workspace': 'पावसाळी परिदृश्य कार्यक्षेत्र',
  'What the city looks like under a heavier spell than last year.':
    'गेल्या वर्षापेक्षा जोरदार पावसात शहराची स्थिती कशी दिसते.',
  'Standing orders and circulars': 'स्थायी आदेश व परिपत्रके',
  'The orders in force, and the ones each of them supersedes.':
    'लागू असलेले आदेश, आणि प्रत्येकाने रद्द केलेले आदेश.',
  'Government resolutions': 'शासन निर्णय',
  'State resolutions, and what each obliges the corporation to do.':
    'राज्याचे निर्णय, आणि प्रत्येकाने महानगरपालिकेवर टाकलेले बंधन.',
  'Delegation of powers': 'अधिकारांचे प्रदान',
  'Which post may sanction what, and up to what value.': 'कोणते पद काय मंजूर करू शकते, आणि किती रकमेपर्यंत.',
  'Citizens’ charter standards': 'नागरिकांच्या सनदेची मानके',
  'The time each counter service must be delivered in.': 'प्रत्येक काउंटर सेवा किती वेळेत द्यावी लागते.',
  'Sitting with a post, with the evidence already assembled.': 'पुरावा तयार असून पदाकडे प्रलंबित.',
  'Alerts past their standard': 'मुदत ओलांडलेले इशारे',
  'Beyond their window, and now with the department head.': 'मुदतीबाहेर, आणि आता विभागप्रमुखांकडे.',
  'Complaints breaching today': 'आज मुदत ओलांडणाऱ्या तक्रारी',
  'Due to breach the charter before the day closes.': 'दिवस संपण्यापूर्वी सनदेची मुदत ओलांडणार.',
  'Works behind schedule': 'वेळापत्रकामागे असलेली कामे',
  'Physical progress trailing the money already released.': 'वितरित निधीच्या तुलनेत प्रत्यक्ष प्रगती मागे.',
  'Data sources': 'माहिती स्रोत',
  'Every feed, its owner, and when it last landed.': 'प्रत्येक स्रोत, त्याचा स्वामी, आणि तो शेवटचा कधी आला.',
  'What each model does, and how it scored on evaluation.':
    'प्रत्येक प्रतिरूप काय करते, आणि मूल्यांकनात त्याचे गुण.',
  'Lineage of a figure': 'आकड्याची वंशावळ',
  'From the screen back to the record it was drawn from.':
    'पडद्यावरून मागे, ज्या नोंदीतून तो घेतला त्या नोंदीपर्यंत.',
  'The scope each position carries, and who granted it.': 'प्रत्येक पदाची व्याप्ती, आणि ती कोणी दिली.',

  /* --- The tiles, shared by all three link sections -------------------------- */
  'The whole city, ordered by what needs deciding today.': 'संपूर्ण शहर, आज कशावर निर्णय हवा त्या क्रमाने.',
  'Live incidents and the control-room picture as it stands.': 'सद्यस्थितीतील घटना व नियंत्रण कक्षाचे चित्र.',
  'What has passed its standard, and who is holding it.': 'मुदत ओलांडलेले काय, आणि ते कोणाकडे प्रलंबित.',
  'Decisions awaiting approval, with the evidence attached.': 'मंजुरीच्या प्रतीक्षेतील निर्णय, पुराव्यासह.',
  'Every ward scored on service, equity and delivery.':
    'प्रत्येक प्रभागाचे सेवा, समन्याय व वितरणावर गुणांकन.',
  'Demand, collection and arrears against the register.': 'नोंदवहीच्या तुलनेत मागणी, वसुली व थकबाकी.',
  'Collection routes, lifting, processing and disposal.': 'संकलन मार्ग, उचल, प्रक्रिया व विल्हेवाट.',
  'Surface condition, works in progress and defect liability.':
    'पृष्ठभागाची स्थिती, सुरू असलेली कामे व दोष दायित्व.',
  'Sanctioned works, and physical against financial progress.':
    'मंजूर कामे, आणि आर्थिक प्रगतीच्या तुलनेत प्रत्यक्ष प्रगती.',
  'Where every figure came from, and which of them are modelled.':
    'प्रत्येक आकडा कोठून आला, आणि त्यातील कोणते प्रतिरूपित आहेत.',
  'Development control, permission and unauthorised construction.':
    'विकास नियंत्रण, परवानगी व अनधिकृत बांधकाम.',
  'Preparedness, response and the standing resilience picture.':
    'सज्जता, प्रतिसाद व शहराचे स्थायी लवचिकता चित्र.',
  'Facility load, critical care occupancy and referrals.':
    'सुविधांवरील ताण, अतिदक्षता व्याप्ती व संदर्भसेवा.',
  'Enrolment, attendance and school infrastructure.': 'पटनोंदणी, उपस्थिती व शालेय पायाभूत सुविधा.',
  'Response times, appliance availability and fire safety.':
    'प्रतिसाद वेळ, वाहन उपलब्धता व अग्निसुरक्षा.',
  'Sanctioned posts, deployment and vacancy by department.':
    'विभागनिहाय मंजूर पदे, प्रत्यक्ष नियुक्ती व रिक्त पदे.',
  'Subjects tabled before the house, and how each was decided.':
    'सभागृहासमोर मांडलेले विषय, आणि प्रत्येकावर झालेला निर्णय.',
  'Air, noise, tree cover and the environment status report.':
    'हवा, ध्वनी, वृक्ष आच्छादन व पर्यावरण सद्यस्थिती अहवाल.',
  /* Marathi puts the total before the ordinal - "3 पैकी 1", not "1 of 3". */
  '{0} of {1}': '{1} पैकी {0}',

  /* --- The update line, read by officers ------------------------------------ */
  '{0} decisions are waiting on an approval in the Decision Centre':
    'निर्णय केंद्रात {0} निर्णय मंजुरीच्या प्रतीक्षेत',
  '{0} alerts have escalated past their standard and sit with department heads':
    '{0} इशारे मुदत ओलांडून विभागप्रमुखांकडे प्रलंबित',
  '{0} complaints are due to breach the citizens’ charter today':
    'आज {0} तक्रारी नागरिकांच्या सनदेची मुदत ओलांडणार',
  'Pre-monsoon desilting is behind target on the reaches through {0}':
    '{0} मधून जाणाऱ्या टप्प्यांवर पावसाळापूर्व गाळ काढणी लक्ष्यामागे',
  'Property tax collection review with zone officers on {0}':
    '{0} रोजी झोन अधिकाऱ्यांसोबत मालमत्ता कर वसुली आढावा',
  '{0} tenders at technical evaluation, corrigenda published {1}':
    '{0} निविदा तांत्रिक मूल्यांकनात, शुद्धिपत्रके {1} रोजी प्रसिद्ध',
  'Collection coverage is below standard on {0} routes': '{0} मार्गांवर संकलन व्याप्ती मानकाखाली',
  'Draft budget {0} is before the standing committee': 'प्रारूप अर्थसंकल्प {0} स्थायी समितीसमोर',

  /* --- The handset row and the service desk --------------------------------- */
  'Field application': 'क्षेत्रीय ॲप',
  'For the officer on site — inspection, verification of works, and closing a complaint where it was raised.':
    'प्रत्यक्ष जागेवरील अधिकाऱ्यासाठी — तपासणी, कामांची पडताळणी, आणि तक्रार जेथे उद्भवली तेथेच निकाली काढणे.',
  'Ask the platform in plain language. Every answer arrives with its evidence and the post permitted to act on it.':
    'सोप्या भाषेत मंचाला विचारा. प्रत्येक उत्तर त्याच्या पुराव्यासह आणि त्यावर कार्यवाही करण्यास अधिकृत पदासह येते.',
  'Where an officer goes when the platform is the problem rather than the city.':
    'शहर नव्हे तर मंचच अडचण असेल तेव्हा अधिकाऱ्याने कोठे जावे.',
  'Platform service desk': 'मंच सेवा कक्ष',
  'Requesting access for a post': 'पदासाठी प्रवेश मागणी',
  'Owners of each data source': 'प्रत्येक माहिती स्रोताचे स्वामी',
  'Release notes and changes': 'आवृत्ती नोंदी व बदल',
}

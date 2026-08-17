/**
 * Marathi catalogue, part 32 - the Executive Overview as an administrative
 * return, and the live updates column beside it. Keyed by the exact English
 * source.
 *
 * The register follows the rest of the catalogue: administrative Marathi as
 * the Maharashtra government writes it, with the technical terms English-
 * reading practice keeps (SLA, AI, MLD as एमएलडी). A commissioner reading this
 * screen has to reconcile it against a file written in the same vocabulary,
 * so the file's vocabulary wins over everyday speech wherever they differ.
 */
export const MR_PART_32: Record<string, string> = {
  /* --- Menu bar ----------------------------------------------------------- */
  'Scroll the menu left': 'मेनू डावीकडे सरकवा',
  'Scroll the menu right': 'मेनू उजवीकडे सरकवा',

  /* --- Masthead ----------------------------------------------------------- */
  '{0} · Office of the Municipal Commissioner': '{0} · महानगरपालिका आयुक्त कार्यालय',
  'Position as at': 'स्थिती दिनांक',

  /* --- City health index -------------------------------------------------- */
  'City health index': 'शहर आरोग्य निर्देशांक',
  'Weighted composite': 'भारित संमिश्र',
  'of 100': '१०० पैकी',
  Wt: 'भार',
  'Contrib.': 'योगदान',
  'Thirty-day trend against the 75/100 target': '७५/१०० उद्दिष्टाच्या तुलनेत तीस दिवसांचा कल',
  'City health': 'शहर आरोग्य',

  /* --- Ward register and map ---------------------------------------------- */
  'Ward performance register': 'प्रभाग कामगिरी नोंदवही',
  '{0} wards': '{0} प्रभाग',
  'Search wards': 'प्रभाग शोधा',
  'Ward risk map': 'प्रभाग जोखीम नकाशा',
  'Select a ward to open its profile': 'प्रभागाची माहिती उघडण्यासाठी प्रभाग निवडा',

  /* --- Live updates column ------------------------------------------------ */
  '{0} live': '{0} कार्यरत',
  '{0}m ago': '{0} मिनिटांपूर्वी',
  '{0}h ago': '{0} तासांपूर्वी',
  '{0}d ago': '{0} दिवसांपूर्वी',
  'No updates in the current scope.': 'सध्याच्या कार्यकक्षेत कोणतीही अद्ययावत नोंद नाही.',
  'Resume the updates feed': 'अद्ययावत नोंदींचा प्रवाह पुन्हा सुरू करा',
  'Pause the updates feed': 'अद्ययावत नोंदींचा प्रवाह थांबवा',
  Pause: 'थांबवा',

  /* --- Matters requiring attention ---------------------------------------- */
  'Matters requiring attention': 'लक्ष देणे आवश्यक असलेल्या बाबी',
  '{0} open': '{0} प्रलंबित',
  'No open risks.': 'कोणतीही प्रलंबित जोखीम नाही.',

  /* --- Revenue and finance ------------------------------------------------ */
  'Revenue & finance': 'महसूल व वित्त',
  '{0} collected of {1} target': '{1} उद्दिष्टापैकी {0} वसूल',
  '{0} of {1} revised': '{1} सुधारित तरतुदीपैकी {0}',

  /* --- Capital works ------------------------------------------------------ */
  'Capital works': 'भांडवली कामे',
  'At risk': 'जोखमीत',

  /* --- Service delivery --------------------------------------------------- */
  'Complaints vs. notified services': 'तक्रारी वि. अधिसूचित सेवा',

  /* --- Infrastructure ----------------------------------------------------- */
  'Infrastructure standing': 'पायाभूत सुविधा स्थिती',
  '{0}/{1} MLD': '{0}/{1} एमएलडी',
  '{0} chronic waterlogging location(s)': '{0} तीव्र पाणी साचण्याची ठिकाणे',
  'Emergency response': 'आपत्कालीन प्रतिसाद',
  '{0} station(s) below standard': '{0} केंद्रे मानकांखाली',
  '{0} min': '{0} मि.',
  'Waste collection coverage': 'कचरा संकलन व्याप्ती',
  '{0} hotspot(s)': '{0} संवेदनशील ठिकाणे',
  'Priority road defects': 'प्राधान्य रस्ते दोष',

  /* --- Executive brief ---------------------------------------------------- */
  'Governed AI layer — advisory only': 'नियंत्रित AI स्तर — केवळ सल्लागार',
  Regenerate: 'पुन्हा तयार करा',
  Generate: 'तयार करा',
  "Generate an executive brief to synthesise the city's current position, with evidence and confidence stated for every finding.":
    'शहराची सद्यस्थिती संकलित करण्यासाठी कार्यकारी टिपण तयार करा; प्रत्येक निष्कर्षासाठी पुरावा व विश्वासार्हता नमूद केली जाते.',
  Copied: 'प्रत घेतली',
  Copy: 'प्रत घ्या',
  Saved: 'जतन झाले',
  Save: 'जतन करा',
}

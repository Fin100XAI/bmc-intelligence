/**
 * Marathi catalogue, part 28 - the integration register, complaint channels,
 * the dewatering fleet and observation provenance. Keyed by the exact English
 * source.
 */
export const MR_PART_28: Record<string, string> = {
  /* --- Observation provenance ------------------------------------------ */
  'Field inspection': 'क्षेत्रीय तपासणी',
  'Citizen report': 'नागरिक तक्रार',
  'Camera detection': 'कॅमेरा शोध',
  Sensor: 'संवेदक',
  'Contractor return': 'कंत्राटदार विवरण',
  'How detected': 'कसे आढळले',
  'Detected automatically at {0}% confidence and since confirmed on the ground by a named officer.':
    '{0}% विश्वासार्हतेसह स्वयंचलितपणे आढळले आणि त्यानंतर नामनिर्देशित अधिकाऱ्याने प्रत्यक्ष जागेवर निश्चित केले.',
  'Detected automatically at {0}% confidence. Not yet confirmed on the ground - this is a lead, not a finding.':
    '{0}% विश्वासार्हतेसह स्वयंचलितपणे आढळले. प्रत्यक्ष जागेवर अद्याप निश्चित केलेले नाही - हा सुगावा आहे, निष्कर्ष नाही.',
  'Confirmed on the ground by a named officer.': 'नामनिर्देशित अधिकाऱ्याने प्रत्यक्ष जागेवर निश्चित केले.',
  'Reported but not yet confirmed on the ground.': 'नोंदवले, पण प्रत्यक्ष जागेवर अद्याप निश्चित केलेले नाही.',
  '{0}% unconfirmed': '{0}% अनिश्चित',

  /* --- The integration register ---------------------------------------- */
  // The corporation's own systems carry its short name; state and national
  // services are named for the authority that operates them.
  'No portal recorded on the corporation register': 'महानगरपालिका नोंदवहीत कोणतेही संकेतस्थळ नोंदवलेले नाही',
  '{0} Assessment & Collection System': '{0} आकारणी व वसुली प्रणाली',
  'Citizen Portal & Online Services': 'नागरिक संकेतस्थळ व ऑनलाइन सेवा',
  '{0} Financial Management System': '{0} वित्तीय व्यवस्थापन प्रणाली',
  '{0} Grievance Redressal System': '{0} तक्रार निवारण प्रणाली',
  '{0} Hydraulic SCADA': '{0} जलअभियांत्रिकी SCADA',
  '{0} Road Asset Register': '{0} रस्ते मालमत्ता नोंदवही',
  '{0} SWM Vehicle Tracking': '{0} घनकचरा वाहन मागोवा',
  '{0} Municipal GIS': '{0} महानगरपालिका GIS',
  '{0} Hospital Management System': '{0} रुग्णालय व्यवस्थापन प्रणाली',
  '{0} Emergency Operations Centre': '{0} आपत्कालीन परिचालन केंद्र',
  'Weather Warnings & Rainfall Observations': 'हवामान इशारे व पर्जन्य नोंदी',
  'IMD district warning and rainfall service': 'IMD जिल्हा इशारा व पर्जन्य सेवा',
  'India Meteorological Department': 'भारतीय हवामान विभाग',
  'State Disaster Alert Relay': 'राज्य आपत्ती इशारा प्रसारण',
  'State disaster alert dissemination service': 'राज्य आपत्ती इशारा प्रसार सेवा',
  '{0} State Disaster Management Authority': '{0} राज्य आपत्ती व्यवस्थापन प्राधिकरण',
  'Automatic Weather Station Network': 'स्वयंचलित हवामान केंद्र जाळे',
  '{0} automatic weather station network': '{0} स्वयंचलित हवामान केंद्र जाळे',
  '{0} dewatering pump telemetry': '{0} उपसा पंप दूरमापन',
  'Command Centre Video Analytics': 'नियंत्रण केंद्र चित्रफीत विश्लेषण',
  '{0} command centre video analytics': '{0} नियंत्रण केंद्र चित्रफीत विश्लेषण',
  '{0} Document Management System': '{0} दस्तऐवज व्यवस्थापन प्रणाली',
  '{0} Contract Management System': '{0} करार व्यवस्थापन प्रणाली',
  'Integrated Disease Surveillance Programme return': 'एकात्मिक रोग सर्वेक्षण कार्यक्रम विवरण',
  '{0} State Public Health Department': '{0} राज्य सार्वजनिक आरोग्य विभाग',
  '{0} Project Management System': '{0} प्रकल्प व्यवस्थापन प्रणाली',
  'Ambient air and noise monitoring network': 'सभोवतालची हवा व ध्वनी संनियंत्रण जाळे',
  '{0} Pollution Control Board': '{0} प्रदूषण नियंत्रण मंडळ',
  'Operated by': 'संचालक',

  /* --- Complaint channels ----------------------------------------------- */
  Helpline: 'मदत क्रमांक',
  'Citizen portal': 'नागरिक संकेतस्थळ',
  'Mobile app': 'मोबाइल ॲप',
  'Social media': 'समाजमाध्यम',
  'How complaints reached the corporation': 'तक्रारी महानगरपालिकेपर्यंत कशा पोहोचल्या',
  'Volume share and SLA position for every route in use, busiest first.':
    'वापरात असलेल्या प्रत्येक मार्गाचा वाटा आणि सेवास्तर स्थिती, सर्वाधिक वर्दळीचा प्रथम.',
  '{0} of complaints': 'तक्रारींपैकी {0}',
  '{0} received, {1} open · SLA compliance {2} · mean age {3}h':
    '{0} प्राप्त, {1} प्रलंबित · सेवास्तर पालन {2} · सरासरी कालावधी {3} तास',

  /* --- The dewatering fleet --------------------------------------------- */
  Running: 'कार्यरत',
  Standby: 'राखीव',
  'Under maintenance': 'देखभालीखाली',
  Set: 'संच',
  '{0} l/s': '{0} लि/से',
  'l/s': 'लि/से',
  Reporting: 'नोंदणी पद्धत',
  Telemetry: 'दूरमापन',
  'Logged by hand': 'हाताने नोंदवलेले',
  'Last fault': 'शेवटचा बिघाड',
  'Dewatering sets': 'उपसा संच',
  '{0} running, {1} on standby': '{0} कार्यरत, {1} राखीव',
  'Fleet availability': 'संच उपलब्धता',
  '{0} in fault, {1} under maintenance': '{0} बिघाडात, {1} देखभालीखाली',
  'Available discharge': 'उपलब्ध विसर्ग',
  'of {0} l/s installed': 'स्थापित {0} लि/से पैकी',
  'Sets reporting telemetry': 'दूरमापन नोंदवणारे संच',
  '{0} of {1} sets report their own state': '{1} पैकी {0} संच स्वतःची स्थिती नोंदवतात',
  'Stations with no working set': 'कार्यरत संच नसलेली केंद्रे',
  'Every set at these locations is unavailable': 'या ठिकाणचा प्रत्येक संच अनुपलब्ध आहे',
  'Dewatering set register': 'उपसा संच नोंदवही',
  'Every set in the fleet with its current state, duty over the last 30 days and whether it reports that state itself or is logged by hand at the site.':
    'संचसमूहातील प्रत्येक संच, त्याची सद्यस्थिती, मागील 30 दिवसांतील कार्यभार आणि तो स्वतः स्थिती नोंदवतो की जागेवर हाताने नोंद घेतली जाते हे यासह.',
  'No dewatering sets match the current filters': 'सध्याच्या गाळण्यांशी जुळणारे कोणतेही उपसा संच नाहीत',
}

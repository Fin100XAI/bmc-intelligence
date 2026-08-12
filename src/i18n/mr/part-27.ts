/**
 * Marathi catalogue, part 27 - monsoon operations: the IMD colour warning and
 * the pre-monsoon desilting works programme. Keyed by the exact English source.
 */
export const MR_PART_27: Record<string, string> = {
  /* --- IMD colour-coded warning ---------------------------------------- */
  // The action words are IMD's own and are read verbatim in control rooms, so
  // they are translated as the instructions they are, not descriptively.
  'Take action': 'कृती करा',
  'Be prepared': 'सज्ज रहा',
  'Be updated': 'माहिती ठेवा',
  'No warning': 'इशारा नाही',
  Green: 'हिरवा',
  Yellow: 'पिवळा',
  Orange: 'नारंगी',
  Red: 'लाल',

  'Extremely heavy rainfall - above 204.5 mm in 24 hours': 'अतितीव्र पर्जन्यवृष्टी - 24 तासांत 204.5 mm पेक्षा अधिक',
  'Very heavy rainfall - 115.6 to 204.4 mm in 24 hours': 'अतिवृष्टी - 24 तासांत 115.6 ते 204.4 mm',
  'Heavy rainfall - 64.5 to 115.5 mm in 24 hours': 'जोरदार पर्जन्यवृष्टी - 24 तासांत 64.5 ते 115.5 mm',
  'No rainfall warning in force - below 64.5 mm in 24 hours': 'कोणताही पर्जन्य इशारा लागू नाही - 24 तासांत 64.5 mm पेक्षा कमी',
  'No rainfall warning in force': 'कोणताही पर्जन्य इशारा लागू नाही',
  '{0} warning in force for the corporation area': 'महानगरपालिका क्षेत्रासाठी {0} इशारा लागू',

  'Disaster management cell on continuous watch. Field teams deployed at all chronic waterlogging locations. Movement advisories in force.':
    'आपत्ती व्यवस्थापन कक्ष सतत निगराणीवर. नेहमी पाणी साचणाऱ्या सर्व ठिकाणी क्षेत्रीय पथके तैनात. वाहतूक सूचना लागू.',
  'Dewatering sets to be manned through the high-tide window, when outfalls cannot discharge under gravity. Ward control rooms staffed.':
    'भरतीच्या कालावधीत, जेव्हा मुखांतून नैसर्गिक निचरा होऊ शकत नाही, तेव्हा उपसा संच कर्मचाऱ्यांसह सज्ज ठेवावेत. प्रभाग नियंत्रण कक्ष कार्यरत.',
  'Ward control rooms staffed and dewatering sets manned at chronic locations. Field teams on call.':
    'प्रभाग नियंत्रण कक्ष कार्यरत आणि नेहमीच्या ठिकाणी उपसा संच कर्मचाऱ्यांसह सज्ज. क्षेत्रीय पथके तत्पर.',
  'Ward control rooms to remain reachable. Chronic waterlogging locations to be checked before the next observation round.':
    'प्रभाग नियंत्रण कक्ष संपर्कात राहावेत. पुढील निरीक्षण फेरीपूर्वी नेहमी पाणी साचणाऱ्या ठिकाणांची तपासणी करावी.',
  'Routine monsoon watch. No additional deployment in force.': 'नेहमीची पावसाळी निगराणी. अतिरिक्त तैनाती लागू नाही.',

  'Heaviest 24-hour observation {0} mm at {1}': '{1} येथे 24 तासांतील सर्वाधिक नोंद {0} mm',
  '{0} ward station(s) observing rainfall in the heavy band or above': '{0} प्रभाग केंद्रांवर जोरदार किंवा त्याहून अधिक श्रेणीतील पर्जन्यनोंद',
  'High tide of {0} m blocks gravity discharge from outfalls': '{0} m ची भरती मुखांतून होणाऱ्या नैसर्गिक निचऱ्यास अडथळा करते',
  'Issued {0}, in force until {1}. Classification follows the IMD 24-hour rainfall bands.':
    '{0} रोजी जारी, {1} पर्यंत लागू. वर्गीकरण IMD च्या 24-तास पर्जन्य श्रेणींनुसार.',

  /* --- The pre-monsoon works programme ---------------------------------- */
  'Pre-monsoon {0}': 'पावसाळापूर्व {0}',
  'Contractor not on the register': 'नोंदवहीत नसलेला कंत्राटदार',

  // Verification states. "पडताळणी" is already the catalogue's word for
  // verification, so the states are built on it rather than on a new stem.
  'Machine verified': 'यंत्राद्वारे पडताळले',
  'Photo verified': 'छायाचित्राद्वारे पडताळले',
  'Claimed, unverified': 'दावा केलेले, अपडताळित',
  Disputed: 'वादग्रस्त',

  Reaches: 'टप्पे',
  Completion: 'पूर्णत्व',
  Uncorroborated: 'असमर्थित',
  'Value uncorroborated': 'असमर्थित मूल्य',
  Order: 'आदेश',
  'Recorded removed': 'काढल्याची नोंद',
  'Trips (verified / recorded)': 'खेपा (पडताळलेल्या / नोंदवलेल्या)',
  'Sanctioned quantum': 'मंजूर परिमाण',
  Corroborated: 'समर्थित',
  'Contested orders': 'वादग्रस्त आदेश',

  '₹{0} lakh': '₹{0} लाख',
  '₹ lakh': '₹ लाख',
  '{0} MT': '{0} मे.टन',
  'of ₹{0} lakh recorded': 'नोंदवलेल्या ₹{0} लाखांपैकी',
  '{0}% of sanctioned': 'मंजुरीच्या {0}%',
  '{0} MT of what was recorded': 'नोंदवलेल्यापैकी {0} मे.टन',
  'Across {0} reach(es) in the programme': 'कार्यक्रमातील {0} टप्प्यांमध्ये',
  '{0} order(s) below the 100% target': '100% लक्ष्याखालील {0} आदेश',

  '{0} works programme - accountability position': '{0} कामे कार्यक्रम - उत्तरदायित्व स्थिती',
  'The cycle closed {0} day(s) ago on {1}. {2}% of the sanctioned quantum is recorded as removed across {3} reach(es), and {4}% of what was recorded can be corroborated by something other than the contractor’s own record. That leaves ₹{5} lakh of recorded work uncorroborated, and {6} order(s) contested.':
    'हे चक्र {1} रोजी, म्हणजे {0} दिवसांपूर्वी संपले. {3} टप्प्यांमध्ये मंजूर परिमाणाच्या {2}% काढल्याची नोंद आहे, आणि नोंदवलेल्यापैकी {4}% कंत्राटदाराच्या स्वतःच्या नोंदीव्यतिरिक्त इतर पुराव्याने समर्थित करता येते. त्यामुळे नोंदवलेल्या कामापैकी ₹{5} लाख असमर्थित राहते आणि {6} आदेश वादग्रस्त आहेत.',
  '{0} day(s) remain to the {1} deadline. {2}% of the sanctioned quantum is recorded as removed across {3} reach(es), and {4}% of what was recorded can be corroborated by something other than the contractor’s own record. ₹{5} lakh of recorded work is uncorroborated, and {6} order(s) are contested.':
    '{1} या अंतिम मुदतीस {0} दिवस शिल्लक. {3} टप्प्यांमध्ये मंजूर परिमाणाच्या {2}% काढल्याची नोंद आहे, आणि नोंदवलेल्यापैकी {4}% कंत्राटदाराच्या स्वतःच्या नोंदीव्यतिरिक्त इतर पुराव्याने समर्थित करता येते. नोंदवलेल्या कामापैकी ₹{5} लाख असमर्थित आहे आणि {6} आदेश वादग्रस्त आहेत.',
  'Corroboration is a measurement, not a decision. Nothing here closes an order or releases a payment - a named officer does that, on the evidence shown.':
    'समर्थन ही मोजणी आहे, निर्णय नाही. येथील काहीही आदेश बंद करत नाही किंवा देयक मंजूर करत नाही - ते नामनिर्देशित अधिकारीच दाखवलेल्या पुराव्यावर करतात.',

  'Contractor position on the works programme': 'कामे कार्यक्रमातील कंत्राटदार स्थिती',
  'Every contractor holding a reach this cycle, heaviest uncorroborated value first. This is the same delivery record Contractor Intelligence reads.':
    'या चक्रात टप्पा असलेला प्रत्येक कंत्राटदार, सर्वाधिक असमर्थित मूल्य प्रथम. कंत्राटदार बुद्धिमत्ता हीच वितरण नोंद वाचते.',
  'Desilting work order register': 'गाळ काढणी कार्यादेश नोंदवही',
  'One order per reach in the programme, with the quantum recorded against it and how that record was checked.':
    'कार्यक्रमातील प्रत्येक टप्प्यासाठी एक आदेश, त्यावर नोंदवलेले परिमाण आणि ती नोंद कशी तपासली गेली यासह.',
  'No work orders match the current filters': 'सध्याच्या गाळण्यांशी जुळणारे कोणतेही कार्यादेश नाहीत',
}

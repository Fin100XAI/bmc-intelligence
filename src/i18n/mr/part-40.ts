/** Marathi catalogue, part 40. Keyed by the exact English source.
 * DataResourcesPage.tsx citation-register UI and PlatformReadinessPage.tsx multi-tenant register. */
export const MR_PART_40: Record<string, string> = {
  'Official / government': 'अधिकृत / सरकारी',
  'Independent reporting & research': 'स्वतंत्र वृत्तांकन व संशोधन',
  'Source type': 'स्रोत प्रकार',
  'What the source says': 'स्रोत काय सांगतो',
  Strategic: 'धोरणात्मक',
  'This register is real, not modelled': 'हे नोंदवही प्रत्यक्ष आहे, प्रतिकृत नव्हे',
  "Every other register in this platform is deterministic demonstration data, stated as such on every page. This one is the exception: each row below is a citation to a genuinely published figure - the corporation's own site, a state department, the Census, or contemporary reporting where no official document could be found. A field with no citation here carries no figure anywhere else in the platform either.":
    'या मंचावरील इतर प्रत्येक नोंदवही निश्चितात्मक प्रात्यक्षिक माहिती आहे, हे प्रत्येक पानावर नमूद केले आहे. हे नोंदवही अपवाद आहे: खालील प्रत्येक ओळ खऱ्या प्रकाशित आकड्याचे उद्धरण आहे - महानगरपालिकेचे स्वतःचे संकेतस्थळ, राज्य विभाग, जनगणना, किंवा अधिकृत दस्तऐवज न सापडल्यास समकालीन वृत्तांकन. ज्या क्षेत्राला येथे उद्धरण नाही, त्याला मंचावर इतरत्रही कोठेही आकडा नाही.',
  'Citations on record': 'नोंदवहीतील उद्धरणे',
  'Across {0} corporation(s)': '{0} महानगरपालिकां(चे) मध्ये',
  'Fields sourced': 'उद्धृत क्षेत्रे',
  'Distinct published facts': 'वेगळी प्रकाशित तथ्ये',
  'Distinct sources': 'वेगळे स्रोत',
  'Unique publishing hosts': 'अद्वितीय प्रकाशन यजमान',
  '{0} of {1} citations': '{1} पैकी {0} उद्धरणे',
  'Search field, source or note': 'क्षेत्र, स्रोत किंवा टीप शोधा',
  'Search citations': 'उद्धरणे शोधा',
  'Filter by source type': 'स्रोत प्रकारानुसार गाळा',
  'All source types': 'सर्व स्रोत प्रकार',
  'Filter by corporation': 'महानगरपालिकेनुसार गाळा',
  'All corporations': 'सर्व महानगरपालिका',
  'Citation register': 'उद्धरण नोंदवही',
  'No citation matches the current filters': 'सध्याच्या गाळण्यांशी कोणतेही उद्धरण जुळत नाही',

  'Multi-tenant / reusable engine': 'बहु-टेनंट / पुनर्वापरयोग्य इंजिन',
  'File-backed persistence for alerts, incidents, decisions and the audit trail':
    'सूचना, घटना, निर्णय आणि लेखापरीक्षा नोंदसाखळीसाठी फाइल-आधारित टिकाऊपणा',
  'Corporation registry and factual-spine schema': 'महानगरपालिका नोंदवही आणि तथ्यात्मक-कणा आराखडा',
  "A single `CorporationRef` type carries every published fact a deployment is built on - area, population, budget, water supply, sources - already shaped to hold any Maharashtra municipal corporation, not just Brihanmumbai.":
    'एकच `CorporationRef` प्रकार तैनातीचा आधार असलेले प्रत्येक प्रकाशित तथ्य वाहून नेतो - क्षेत्रफळ, लोकसंख्या, अर्थसंकल्प, पाणीपुरवठा, स्रोत - आधीच केवळ बृहन्मुंबईसाठीच नव्हे तर कोणत्याही महाराष्ट्र महानगरपालिकेसाठी आकारलेला.',
  'Ward and zone resolution, generalised': 'प्रभाग व क्षेत्र निर्धारण, सर्वसाधारणीकृत',
  "`resolveWardCount` / `resolveDivisions` derive a corporation's administrative units from whatever it actually publishes - named divisions, administrative wards, electoral seats or zones - rather than assuming Brihanmumbai's own 24-ward structure.":
    '`resolveWardCount` / `resolveDivisions` महानगरपालिका प्रत्यक्षात जे प्रकाशित करते त्यावरून तिची प्रशासकीय एकके काढतात - नामांकित विभाग, प्रशासकीय प्रभाग, निर्वाचित जागा किंवा क्षेत्रे - बृहन्मुंबईची स्वतःची २४-प्रभाग रचना गृहीत धरण्याऐवजी.',
  'Tenant-agnostic AI evaluation': 'टेनंट-निरपेक्ष AI मूल्यमापन',
  "Model and prompt evaluations run against the platform's AI gateway, not against any one corporation's data - a passed evaluation applies unchanged to every tenant the engine serves.":
    'मॉडेल व प्रॉम्प्ट मूल्यमापन मंचाच्या AI गेटवेविरुद्ध चालतात, कोणत्याही एका महानगरपालिकेच्या माहितीविरुद्ध नव्हे - उत्तीर्ण मूल्यमापन इंजिन सेवा देत असलेल्या प्रत्येक टेनंटला जसेच्या तसे लागू होते.',
  'Bilingual interface, corporation-independent': 'द्विभाषिक इंटरफेस, महानगरपालिका-स्वतंत्र',
  "English and Marathi coverage is a platform-wide layer, not authored per deployment - a newly onboarded corporation inherits full translation from day one.":
    'इंग्रजी व मराठी व्याप्ती हा एक मंच-व्यापी स्तर आहे, प्रत्येक तैनातीसाठी स्वतंत्रपणे लिहिलेला नाही - नव्याने सामील होणाऱ्या महानगरपालिकेला पहिल्याच दिवशी संपूर्ण भाषांतर मिळते.',
  'A second sourced corporation record': 'दुसरी उद्धृत महानगरपालिका नोंद',
  'Geography generator validated against a second city form': 'दुसऱ्या शहर-स्वरूपाविरुद्ध पडताळलेला भूगोल जनक',
  'Per-corporation onboarding agreement': 'प्रति-महानगरपालिका सामीलीकरण करार',
}

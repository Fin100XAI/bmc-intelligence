/** Marathi catalogue, part 42. Resolution Intelligence - the ownership
 * confidence engine, multi-department case orchestration, the No-Ping-Pong
 * Protocol, complaint fusion, and the page that reads all of it. */
export const MR_PART_42: Record<string, string> = {
  // src/config/navigation.ts
  'Resolution Intelligence': 'निराकरण बुद्धिमत्ता',
  'Every complaint as a resolution case - explainable ownership, multi-department orchestration and transfer-loop detection.':
    'प्रत्येक तक्रार एक निराकरण प्रकरण म्हणून - स्पष्टीकरणीय मालकी, बहु-विभागीय समन्वय आणि हस्तांतरण-फेरी शोध.',

  // src/domains/resolution/engine.ts
  'Category / rule match': 'श्रेणी / नियम जुळणी',
  'Jurisdiction match': 'अधिकारक्षेत्र जुळणी',
  'Asset / GIS match': 'मालमत्ता / GIS जुळणी',
  'Historical resolution pattern': 'ऐतिहासिक निराकरण नमुना',
  'Complaint semantics': 'तक्रारीचा शब्दार्थ',
  'Inspect and confirm ownership': 'तपासणी करा आणि मालकी निश्चित करा',
  'Inspect the dependency and report back to the case owner': 'अवलंबित्व तपासा आणि प्रकरण मालकाला अहवाल द्या',
  'Verify completion on ground': 'प्रत्यक्ष जागेवर पूर्णता पडताळा',
  '{0}% of {1} ↔ {2} cases in scope show loop behaviour - bouncing between the two departments rather than converging. At this volume the evidence points at the responsibility model between these two departments, not at complaint volume.':
    'व्याप्तीतील {1} ↔ {2} प्रकरणांपैकी {0}% फेरी वर्तन दाखवतात - एकत्र येण्याऐवजी दोन विभागांमध्ये फिरत राहतात. या प्रमाणात, पुरावा तक्रारींच्या संख्येकडे नव्हे तर या दोन विभागांमधील जबाबदारी रचनेकडे निर्देश करतो.',
  'Accepted with dependency': 'अवलंबित्वासह स्वीकृत',
  Challenged: 'आव्हानित',
  'Joint ownership': 'संयुक्त मालकी',
  'First-time-right routing': 'प्रथम-प्रयत्नात-योग्य मार्गनिर्देशन',
  'Ownership clarity': 'मालकी स्पष्टता',
  'SLA discipline': 'सेवा-हमी शिस्त',
  'Freedom from transfer loops': 'हस्तांतरण फेऱ्यांपासून मुक्तता',
  'Verified, not only marked complete': 'पडताळणी केली, केवळ पूर्ण म्हणून चिन्हांकित नाही',
  'Freedom from recurrence': 'पुनरावृत्तीपासून मुक्तता',
  ' The largest single dependency is {0} ↔ {1}, accounting for {2} of the cases needing coordination.':
    ' सर्वात मोठे एकल अवलंबित्व {0} ↔ {1} आहे, जे समन्वय आवश्यक असलेल्या {2} प्रकरणांसाठी कारणीभूत आहे.',
  "{0} of {1} cases in scope reached their owner without a transfer. Of the remainder, {2} are contested ownership pending an officer's confirmation, {3} are showing loop behaviour between departments, and {4} are open with a predicted SLA breach probability of 60% or higher.{5}":
    'व्याप्तीतील {1} पैकी {0} प्रकरणे कोणत्याही हस्तांतरणाशिवाय त्यांच्या मालकापर्यंत पोहोचली. उर्वरितांपैकी, {2} विवादित मालकी अधिकाऱ्याच्या पुष्टीच्या प्रतीक्षेत आहेत, {3} विभागांदरम्यान फेरी वर्तन दाखवत आहेत, आणि {4} खुली आहेत ज्यांची अंदाजित सेवा-हमी उल्लंघन शक्यता ६०% किंवा त्याहून अधिक आहे.{5}',

  // src/pages/command/ResolutionIntelligencePage.tsx
  'Accepted w/ dependency': 'अवलंबित्वासह स्वीकृत',
  'Multi-department': 'बहु-विभागीय',
  'Ownership conflict': 'मालकी संघर्ष',
  'Transfer loop': 'हस्तांतरण फेरी',
  Recurring: 'पुनरावृत्त',
  Where: 'कुठे',
  'Primary owner': 'प्राथमिक मालक',
  Protocol: 'प्रोटोकॉल',
  Signals: 'संकेत',
  'SLA breach risk': 'सेवा-हमी उल्लंघन जोखीम',
  'Cases in scope': 'व्याप्तीतील प्रकरणे',
  'Every complaint in your authorised scope, read as a resolution case':
    'तुमच्या अधिकृत व्याप्तीतील प्रत्येक तक्रार, निराकरण प्रकरण म्हणून वाचली',
  'Cases that reached their owner without a single transfer': 'एकाही हस्तांतरणाशिवाय त्यांच्या मालकापर्यंत पोहोचलेली प्रकरणे',
  'Multi-department cases': 'बहु-विभागीय प्रकरणे',
  'Decomposed into coordinated tasks rather than transferred': 'हस्तांतरित करण्याऐवजी समन्वित कामांमध्ये विभागलेली',
  'Ownership conflicts': 'मालकी संघर्ष',
  'Runner-up department scores within 20 points of the primary': 'उपविजेता विभागाचे गुण प्राथमिकच्या २० गुणांच्या आत आहेत',
  'Transfer loops': 'हस्तांतरण फेऱ्या',
  'Cases the engine believes are bouncing between departments': 'इंजिनच्या मते विभागांदरम्यान फिरत असलेली प्रकरणे',
  'SLA at risk': 'सेवा-हमी धोक्यात',
  'Open cases with a predicted breach probability of 60% or more': '६०% किंवा त्याहून अधिक अंदाजित उल्लंघन शक्यता असलेली खुली प्रकरणे',
  'Recurring problems': 'पुनरावृत्त समस्या',
  'Cases raised before at the same locality and category': 'त्याच परिसरात आणि श्रेणीत यापूर्वी नोंदवलेली प्रकरणे',
  'Resolution Quality Index': 'निराकरण गुणवत्ता निर्देशांक',
  'Weighted composite - every weight published in the panel below': 'भारित संयुक्त निर्देशांक - प्रत्येक भार खालील पटलात प्रकाशित',
  "Today's brief": 'आजचा संक्षिप्त अहवाल',
  'Loading…': 'लोड होत आहे…',
  'Generated from this page\'s own aggregates. A conversational answer to an arbitrary question - "why did this deteriorate this week?" - belongs to the governed Municipal Copilot, which carries the trend history and retrieval this brief does not.':
    'या पानाच्या स्वतःच्या एकत्रित आकडेवारीतून तयार केले. "हे या आठवड्यात का बिघडले?" यासारख्या अनियंत्रित प्रश्नाचे संवादात्मक उत्तर नियंत्रित महानगरपालिका सहायकाशी संबंधित आहे, ज्याकडे कल इतिहास आणि पुनर्प्राप्ती आहे जी हा संक्षिप्त अहवाल देत नाही.',
  'BMC Zero-Transfer Mission — Pilot Scorecard': 'BMC शून्य-हस्तांतरण मोहीम — प्रायोगिक गुणपत्रक',
  'Backtest on historical complaints, shadow mode before live routing':
    'ऐतिहासिक तक्रारींवर बॅकटेस्ट, थेट मार्गनिर्देशनापूर्वी छाया-प्रणाली',
  'Target: rising': 'उद्दिष्ट: वाढते',
  'Target: falling': 'उद्दिष्ट: घटते',
  'Time lost between departments': 'विभागांदरम्यान वाया गेलेला वेळ',
  '{0}h avg': 'सरासरी {0} तास',
  'Added on top of age, per dependency': 'वयानुसार अतिरिक्त, प्रत्येक अवलंबित्वामागे',
  'SLA breaches at risk': 'धोक्यातील सेवा-हमी उल्लंघने',
  'Repeat complaints': 'पुनरावृत्त तक्रारी',
  'Verified resolution': 'पडताळणी केलेले निराकरण',
  'Of closed cases': 'बंद प्रकरणांपैकी',
  'Cases resolved without escalation': 'उन्नयनाशिवाय निराकरण झालेली प्रकरणे',
  'Needs Intervention Now': 'आत्ता हस्तक्षेप आवश्यक',
  'Ranked by impact, urgency, recurrence and SLA risk': 'परिणाम, निकड, पुनरावृत्ती आणि सेवा-हमी जोखमीनुसार क्रमवारी',
  'No open case in scope': 'व्याप्तीत कोणतेही खुले प्रकरण नाही',
  'Every case in this scope is closed.': 'या व्याप्तीतील प्रत्येक प्रकरण बंद आहे.',
  'Search case, locality or ward': 'प्रकरण, परिसर किंवा प्रभाग शोधा',
  'Complaint Fusion: Duplicate → Cluster → Incident': 'तक्रार एकत्रीकरण: द्विरुक्ती → समूह → घटना',
  'Repeat reports at the same locality and service category are fused into one cluster. A cluster severe or large enough is read as a single probable incident needing one coordinated case, not many disconnected ones.':
    'त्याच परिसरात आणि सेवा श्रेणीतील पुनरावृत्त तक्रारी एका समूहात एकत्रित केल्या जातात. पुरेसा गंभीर किंवा मोठा समूह एकाच संभाव्य घटनेप्रमाणे वाचला जातो, ज्याला अनेक विस्कळीत प्रकरणांऐवजी एका समन्वित प्रकरणाची गरज असते.',
  Clusters: 'समूह',
  'Probable incidents': 'संभाव्य घटना',
  'No cluster reaches the incident threshold in scope': 'व्याप्तीत कोणताही समूह घटना-मर्यादेपर्यंत पोहोचत नाही',
  '{0} reports': '{0} तक्रारी',
  'Case Context & Root Cause Signal': 'प्रकरण संदर्भ आणि मूळ कारण संकेत',
  "The Root-Cause Engine's read for the highest-priority recurring cluster in scope, and the closest this page comes to a case digital twin: the infrastructure records the corporation already holds at that location. An association of place and category, never a finding of cause.":
    'व्याप्तीतील सर्वोच्च-प्राधान्य पुनरावृत्त समूहासाठी मूळ-कारण इंजिनचे वाचन, आणि हे पान प्रकरण डिजिटल जुळे यांच्या जितके जवळ जाते तितकी सर्वात जवळची गोष्ट: त्या ठिकाणी महानगरपालिकेकडे आधीपासून असलेल्या पायाभूत सुविधा नोंदी. स्थान आणि श्रेणीचा संबंध, कारणाचा निष्कर्ष कधीही नाही.',
  'No recurring cluster reaches the reporting threshold in scope': 'व्याप्तीत कोणताही पुनरावृत्त समूह अहवाल-मर्यादेपर्यंत पोहोचत नाही',
  'Ownership Intelligence': 'मालकी बुद्धिमत्ता',
  'Ownership is recommended, never asserted. Rules, jurisdiction, the asset record, historical resolution pattern and complaint wording each contribute evidence to a confidence score - a case whose runner-up department scores close behind the winner is a contested case, not a settled one.':
    'मालकीची शिफारस केली जाते, कधीही ठामपणे सांगितली जात नाही. नियम, अधिकारक्षेत्र, मालमत्ता नोंद, ऐतिहासिक निराकरण नमुना आणि तक्रारीची शब्दरचना प्रत्येकी विश्वासार्हता गुणांमध्ये पुरावा जोडतात - ज्या प्रकरणात उपविजेता विभागाचे गुण विजेत्याच्या जवळ असतात ते विवादित प्रकरण आहे, निकाली नाही.',
  'No case in scope': 'व्याप्तीत कोणतेही प्रकरण नाही',
  'Assigned officer: {0}': 'नियुक्त अधिकारी: {0}',
  'Alternative: {0}': 'पर्यायी: {0}',
  'Within 20 points of the primary assignment - an officer should confirm ownership before work begins.':
    'प्राथमिक नेमणुकीच्या २० गुणांच्या आत - काम सुरू होण्यापूर्वी अधिकाऱ्याने मालकी निश्चित करावी.',
  'Multi-Department Case Orchestration': 'बहु-विभागीय प्रकरण समन्वय',
  "A problem that touches more than one department is decomposed into one case with several tasks - nobody transfers the citizen's complaint.":
    'एकापेक्षा अधिक विभागांशी संबंधित समस्या अनेक कामांसह एका प्रकरणात विभागली जाते - कोणीही नागरिकाची तक्रार हस्तांतरित करत नाही.',
  'No multi-department case in scope': 'व्याप्तीत कोणतेही बहु-विभागीय प्रकरण नाही',
  'No open case in this scope currently depends on more than one department.':
    'या व्याप्तीतील कोणतेही खुले प्रकरण सध्या एकापेक्षा अधिक विभागांवर अवलंबून नाही.',
  'Co-owner': 'सह-मालक',
  'No-Ping-Pong Protocol': 'नो-पिंग-पॉंग प्रोटोकॉल',
  'A department cannot merely forward a case. It accepts, accepts with a dependency, or challenges ownership with a proposed correct owner. An unresolved challenge becomes joint ownership or is referred to escalation authority - never left to bounce indefinitely.':
    'विभाग केवळ प्रकरण पुढे पाठवू शकत नाही. तो स्वीकारतो, अवलंबित्वासह स्वीकारतो, किंवा प्रस्तावित योग्य मालकासह मालकीला आव्हान देतो. निराकरण न झालेले आव्हान संयुक्त मालकी बनते किंवा उन्नयन प्राधिकरणाकडे पाठवले जाते - कधीही अनिश्चित काळासाठी फिरत ठेवले जात नाही.',
  'of 100 · weighted composite - every weight and contribution published below':
    '१०० पैकी · भारित संयुक्त निर्देशांक - प्रत्येक भार आणि योगदान खाली प्रकाशित',
  'Department Responsibility Heatmap': 'विभाग जबाबदारी उष्णता-नकाशा',
  'Where a multi-department case creates a real dependency between two departments. Click a cell to see its volume, loop share, delay and dominant category.':
    'जिथे बहु-विभागीय प्रकरण दोन विभागांमध्ये खरे अवलंबित्व निर्माण करते. त्याचे प्रमाण, फेरी वाटा, विलंब आणि प्रमुख श्रेणी पाहण्यासाठी एका कक्षावर क्लिक करा.',
  'No dependency in scope': 'व्याप्तीत कोणतेही अवलंबित्व नाही',
  'Fewer cases': 'कमी प्रकरणे',
  'More cases': 'अधिक प्रकरणे',
  '{0} case(s) · {1} loop share · avg {2}h added · mostly {3}': '{0} प्रकरण(णे) · {1} फेरी वाटा · सरासरी {2} तास जोडले · मुख्यत्वे {3}',
  'Predictive Intelligence: Where Risk Is Building': 'भाकीत बुद्धिमत्ता: जोखीम कुठे वाढत आहे',
  'Localities below the incident threshold today but already showing repeat reports - a candidate for pre-emptive inspection before it becomes a full incident.':
    'आज घटना-मर्यादेखाली असलेले परंतु आधीच पुनरावृत्त तक्रारी दाखवणारे परिसर - पूर्ण घटना होण्यापूर्वी पूर्वनिवारक तपासणीसाठी उमेदवार.',
  'No emerging cluster in scope': 'व्याप्तीत कोणताही उदयोन्मुख समूह नाही',
  'Cases bouncing between departments instead of converging - a structural routing problem, not a complaint volume problem.':
    'एकत्र येण्याऐवजी विभागांदरम्यान फिरणारी प्रकरणे - ही संरचनात्मक मार्गनिर्देशन समस्या आहे, तक्रारींच्या संख्येची समस्या नाही.',
  'No transfer loop detected in scope': 'व्याप्तीत कोणतीही हस्तांतरण फेरी आढळली नाही',
  '{0} transfers': '{0} हस्तांतरणे',
  'Routing Confidence & Evaluation Readiness': 'मार्गनिर्देशन विश्वासार्हता आणि मूल्यांकन सज्जता',
  'A precision/recall evaluation needs a ground truth this demonstration does not have - a corpus of officer-confirmed correct owners. What can be shown honestly today is the confidence distribution the engine produced, and the share of cases it flags for an officer rather than deciding outright.':
    'अचूकता/स्मरण मूल्यांकनासाठी एका मूलभूत सत्याची गरज असते जे या प्रात्यक्षिकाकडे नाही - अधिकाऱ्याने पुष्टी केलेल्या योग्य मालकांचा संग्रह. आज प्रामाणिकपणे काय दाखवता येईल ते म्हणजे इंजिनने तयार केलेले विश्वासार्हता वितरण, आणि थेट निर्णय घेण्याऐवजी अधिकाऱ्यासाठी चिन्हांकित केलेल्या प्रकरणांचा वाटा.',
  'High confidence (≥85%)': 'उच्च विश्वासार्हता (≥८५%)',
  'Medium confidence (70–84%)': 'मध्यम विश्वासार्हता (७०–८४%)',
  'Low confidence (<70%)': 'कमी विश्वासार्हता (<७०%)',
  'Override-eligible (contested or looping)': 'अधिलेखन-पात्र (विवादित किंवा फेरीत)',
  "A Learning Loop that compares this recommendation against the officer's final assignment and the verified outcome is the target architecture's next stage, not something this demonstration environment can show without that ground truth.":
    'या शिफारसीची तुलना अधिकाऱ्याच्या अंतिम नेमणुकीशी आणि पडताळणी केलेल्या निकालाशी करणारा शिक्षण लूप हा लक्ष्य वास्तुरचनेचा पुढील टप्पा आहे - मूलभूत सत्याशिवाय हे प्रात्यक्षिक वातावरण दाखवू शकत नाही अशी गोष्ट आहे.',
  'AI safety architecture': 'AI सुरक्षा वास्तुरचना',
  'The Ownership Intelligence Engine (deterministic rules, jurisdiction, the asset record, historical resolution pattern and complaint wording) is advisory only. It cannot: reject a citizen complaint; silently discard a case; make an autonomous punitive or regulatory decision; accuse an officer or contractor of fault; invent a responsibility the evidence does not support; or expose citizen personal data. Every recommendation carries its evidence, its confidence, the reason for the assignment, a path to human override, and an audit record.':
    'मालकी बुद्धिमत्ता इंजिन (निश्चितात्मक नियम, अधिकारक्षेत्र, मालमत्ता नोंद, ऐतिहासिक निराकरण नमुना आणि तक्रारीची शब्दरचना) केवळ सल्लागार आहे. ते हे करू शकत नाही: नागरिकाची तक्रार नाकारणे; प्रकरण गुपचूप टाकून देणे; स्वायत्त दंडात्मक किंवा नियामक निर्णय घेणे; अधिकारी किंवा कंत्राटदारावर दोष ठेवणे; पुराव्याला आधार नसलेली जबाबदारी रचणे; किंवा नागरिकाचा वैयक्तिक डेटा उघड करणे. प्रत्येक शिफारस तिचा पुरावा, तिची विश्वासार्हता, नेमणुकीचे कारण, मानवी अधिलेखनाचा मार्ग, आणि लेखापरीक्षण नोंद घेऊन येते.',
}

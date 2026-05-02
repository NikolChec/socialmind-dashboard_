// Safety filter for kid input + AI output. Used by both the Helper (child app) and VR characters (ConvAI).
// Returns a severity rating + categories so the route can decide: allow / rewrite / block + alert.

export type SafetySeverity = 'safe' | 'low' | 'medium' | 'high' | 'critical';
export type SafetyCategory =
  | 'self_harm'
  | 'abuse'
  | 'violence'
  | 'sexual'
  | 'medical_advice'
  | 'pii_leak'
  | 'language_drift'
  | 'eating_disorder'
  | 'substance_use'
  | 'bullying'
  | 'hopelessness'
  | 'distress';

export interface SafetyResult {
  severity: SafetySeverity;
  categories: SafetyCategory[];
  matchedPhrases: string[];
}

// Pattern banks. Each pattern carries the category and severity it triggers.
// Patterns are intentionally Unicode-aware so Hebrew/Russian work.
// Prefer word-boundary-ish anchors via lookarounds where possible to reduce false positives.
const PATTERNS: Array<{
  rx: RegExp;
  cat: SafetyCategory;
  sev: SafetySeverity;
  label: string;
}> = [
  // ── Self-harm / suicide (CRITICAL — always alert) ────────────────────────
  // English — explicit suicidal statements
  { rx: /\b(?:i\s+(?:want|wanna|wish|need|hope)\s+to\s+(?:die|kill\s+myself|end\s+(?:it|my\s+life)|disappear\s+forever|not\s+exist|not\s+be\s+here))\b/i, cat: 'self_harm', sev: 'critical', label: 'en/suicide_want' },
  { rx: /\b(?:kill(?:ing)?\s+myself|end\s+my\s+life|take\s+my\s+(?:own\s+)?life|suicid\w*|kms\b|ending\s+it\s+all|i'?m\s+gonna\s+(?:die|kill))\b/i, cat: 'self_harm', sev: 'critical', label: 'en/suicide' },
  { rx: /\b(?:jump\s+off|hang\s+myself|overdose|od\s+on\s+pills|take\s+(?:all\s+)?(?:the\s+)?pills|slit\s+(?:my\s+)?wrists?|shoot\s+myself)\b/i, cat: 'self_harm', sev: 'critical', label: 'en/suicide_method' },
  // English — explicit self-injury (the picture issue: "I cut myself")
  { rx: /\b(?:i\s+)?(?:cut|cutting|cuts)\s+(?:my\s*self|myself|on\s+(?:my|the))\b/i, cat: 'self_harm', sev: 'critical', label: 'en/cutting' },
  { rx: /\bself[-\s]?(?:harm|injur\w+|cut\w*|mutil\w*)\b/i, cat: 'self_harm', sev: 'critical', label: 'en/self_harm_term' },
  { rx: /\b(?:i\s+)?(?:hurt|harm|burn|punch|scratch|bite)\s+(?:my\s*self|myself)\b/i, cat: 'self_harm', sev: 'critical', label: 'en/self_injury' },
  { rx: /\b(?:cuts?|scars?|wounds?)\s+on\s+my\s+(?:arm|wrist|leg|thigh|skin)/i, cat: 'self_harm', sev: 'high', label: 'en/cuts_visible' },
  { rx: /\b(?:no\s+(?:point|reason)\s+to\s+live|nothing\s+to\s+live\s+for|world\s+(?:would\s+be\s+)?better\s+without\s+me|everyone\s+would\s+be\s+better\s+off|no\s+one\s+would\s+miss\s+me)\b/i, cat: 'self_harm', sev: 'critical', label: 'en/no_reason' },

  // Hebrew — suicide
  { rx: /(?:רוצה\s+(?:למות|להתאבד|לסיים\s+(?:את\s+)?(?:הכול|החיים))|להתאבד|התאבדות|לשים\s+סוף\s+לחיים)/u, cat: 'self_harm', sev: 'critical', label: 'he/suicide' },
  { rx: /(?:אני\s+רוצה\s+להעלם|לא\s+רוצה\s+(?:לחיות|להיות\s+כאן)|אני\s+אסיים\s+את\s+זה)/u, cat: 'self_harm', sev: 'critical', label: 'he/suicide_want' },
  // Hebrew — cutting/self-harm
  { rx: /(?:לחתוך\s+את\s+עצמי|חותך\s+את\s+עצמי|חתכתי\s+את\s+עצמי|פוגע\s+בעצמי|מכה\s+את\s+עצמי|שורף\s+את\s+עצמי)/u, cat: 'self_harm', sev: 'critical', label: 'he/cutting' },
  { rx: /(?:פגיעה\s+עצמית|חתכים?\s+ב(?:יד|זרוע|רגל))/u, cat: 'self_harm', sev: 'high', label: 'he/self_harm_term' },
  { rx: /(?:אין\s+(?:לי\s+)?סיבה\s+לחיות|אף\s+אחד\s+לא\s+יחסר\s+לו|העולם\s+יהיה\s+יותר\s+טוב\s+בלעדיי)/u, cat: 'self_harm', sev: 'critical', label: 'he/no_reason' },

  // Russian — suicide
  { rx: /(?:хочу\s+(?:умереть|покончить\s+(?:с\s+собой|жизнью)|исчезнуть\s+навсегда)|покончить\s+с\s+собой|самоубий\w*|свести\s+счёты\s+с\s+жизнью)/iu, cat: 'self_harm', sev: 'critical', label: 'ru/suicide' },
  { rx: /(?:не\s+хочу\s+(?:жить|быть\s+здесь)|жить\s+не\s+хочется|устал\s+жить)/iu, cat: 'self_harm', sev: 'critical', label: 'ru/suicide_want' },
  // Russian — cutting/self-harm
  { rx: /(?:реж[ау]\s+себя|порез(?:ал|ала|аю)\s+себя|режу\s+руки|причиня[ею]\s+(?:себе\s+)?боль|ломаю\s+себя|жгу\s+себя)/iu, cat: 'self_harm', sev: 'critical', label: 'ru/cutting' },
  { rx: /(?:самоповреждение|шрамы\s+на\s+(?:руке|запястье)|порезы\s+на\s+(?:руках|запястьях))/iu, cat: 'self_harm', sev: 'high', label: 'ru/self_harm_term' },
  { rx: /(?:никому\s+не\s+нужен|никто\s+(?:не\s+)?(?:заметит|вспомнит)|без\s+меня\s+будет\s+лучше)/iu, cat: 'self_harm', sev: 'critical', label: 'ru/no_reason' },

  // ── Hopelessness / severe distress (HIGH — alert but not block) ──────────
  { rx: /\b(?:i\s+hate\s+(?:my\s+)?(?:life|myself|everything)|i'?m\s+(?:worthless|useless|pathetic|a\s+burden|broken)|nobody\s+(?:cares|loves)\s+(?:about\s+)?me)\b/i, cat: 'hopelessness', sev: 'high', label: 'en/hopelessness' },
  { rx: /\b(?:i\s+can'?t\s+(?:do\s+this|take\s+(?:it|this)|go\s+on)\s+anymore|i'?m\s+done\s+with\s+(?:life|everything))\b/i, cat: 'hopelessness', sev: 'high', label: 'en/cant_anymore' },
  { rx: /(?:אני\s+שונא\s+(?:את\s+)?(?:עצמי|החיים\s+שלי|הכול)|אני\s+(?:חסר\s+תועלת|כישלון|לא\s+שווה|נטל)|אף\s+אחד\s+לא\s+(?:אוהב|רוצה|מבין)\s+אותי)/u, cat: 'hopelessness', sev: 'high', label: 'he/hopelessness' },
  { rx: /(?:ненавижу\s+(?:себя|свою\s+жизнь|всё)|я\s+(?:неудачник|ничтожество|обуза|сломан\w*)|никто\s+(?:не\s+)?(?:любит|понимает)\s+меня)/iu, cat: 'hopelessness', sev: 'high', label: 'ru/hopelessness' },

  // ── Abuse / domestic violence (HIGH — alert) ─────────────────────────────
  { rx: /\b(?:my\s+(?:dad|daddy|mom|mommy|mother|father|parent|brother|sister|uncle|aunt|stepdad|stepmom)\s+(?:hits?|beats?|hurts?|punches?|slaps?|kicks?|chokes?|grabs?|touches?\s+me|abuses?\s+me))\b/i, cat: 'abuse', sev: 'high', label: 'en/abuse_family' },
  { rx: /\b(?:someone\s+(?:hit|hurt|touched|abused)\s+me|i\s+(?:was\s+|got\s+)?(?:hit|beaten|abused|molested|raped))\b/i, cat: 'abuse', sev: 'high', label: 'en/abuse_self' },
  { rx: /\b(?:scared\s+(?:to\s+go\s+home|of\s+my\s+(?:dad|mom|parent|brother)))\b/i, cat: 'abuse', sev: 'high', label: 'en/scared_home' },
  { rx: /(?:אבא|אמא|הורה|אח|דוד|דודה)\s*(?:מכה|מרביץ|פוגע|נוגע\s+בי|מטריד\s+אותי|צועק\s+עליי|מתעלל)/u, cat: 'abuse', sev: 'high', label: 'he/abuse_family' },
  { rx: /(?:פוחד[ת]?\s+(?:לחזור\s+הבית|מאבא|מאמא))/u, cat: 'abuse', sev: 'high', label: 'he/scared_home' },
  { rx: /(?:папа|мама|отец|мать|брат|дядя|тётя|отчим|мачеха)\s+(?:бьёт|избивает|обижает|трогает|кричит\s+на|насилует|унижает)/iu, cat: 'abuse', sev: 'high', label: 'ru/abuse_family' },
  { rx: /(?:боюсь\s+(?:идти\s+домой|папу|маму|отца))/iu, cat: 'abuse', sev: 'high', label: 'ru/scared_home' },

  // ── Violence threats (HIGH) ──────────────────────────────────────────────
  { rx: /\bi(?:'?ll|\s+will|\s+want\s+to|\s+gonna|'?m\s+gonna)\s+(?:kill|hurt|stab|shoot|attack|beat\s+up|destroy)\s+(?:him|her|them|\w+)/i, cat: 'violence', sev: 'high', label: 'en/threat' },
  { rx: /\b(?:bring\s+a\s+(?:gun|knife|weapon)|shoot\s+up\s+(?:the\s+school|class))\b/i, cat: 'violence', sev: 'critical', label: 'en/weapon_school' },
  { rx: /(?:אני\s+(?:אהרוג|אכה|אדקור|אפגע)\b)/u, cat: 'violence', sev: 'high', label: 'he/threat' },
  { rx: /(?:я\s+(?:убь[юе]|ударю|зарежу|изобь[юе])\s+(?:его|её|их|\w+))/iu, cat: 'violence', sev: 'high', label: 'ru/threat' },

  // ── Bullying — being targeted (MEDIUM) ───────────────────────────────────
  { rx: /\b(?:they|kids|classmates|everyone)\s+(?:bully|tease|laugh\s+at|make\s+fun\s+of|exclude|ignore|hate)\s+me\b/i, cat: 'bullying', sev: 'medium', label: 'en/bullied' },
  { rx: /\bi'?m\s+(?:being\s+)?bullied\b/i, cat: 'bullying', sev: 'medium', label: 'en/bullied_self' },
  { rx: /(?:מציקים\s+לי|צוחקים\s+עליי|מתעללים\s+בי\s+בכיתה|מעיפים\s+אותי\s+מהחבר)/u, cat: 'bullying', sev: 'medium', label: 'he/bullied' },
  { rx: /(?:издева(?:ю|ют)тся\s+надо\s+мной|смеются\s+надо\s+мной|в\s+школе\s+меня\s+(?:бьют|унижают)|травля)/iu, cat: 'bullying', sev: 'medium', label: 'ru/bullied' },

  // ── Eating disorder (MEDIUM) ─────────────────────────────────────────────
  { rx: /\b(?:i\s+(?:don'?t|won'?t|can'?t)\s+eat|haven'?t\s+eaten\s+(?:in|for)\s+\w+|skip(?:ping)?\s+meals|throw\s+up\s+(?:after|my)\s+(?:eating|food)|make\s+myself\s+throw\s+up|i'?m\s+(?:so\s+)?fat|i\s+hate\s+my\s+body|starve\s+myself)\b/i, cat: 'eating_disorder', sev: 'medium', label: 'en/eating' },
  { rx: /(?:לא\s+אוכל|לא\s+אכלתי\s+(?:כלום|כבר)|אני\s+שמ[נה]|אני\s+שונא[ת]?\s+את\s+הגוף\s+שלי|מקיא[ת]?)/u, cat: 'eating_disorder', sev: 'medium', label: 'he/eating' },
  { rx: /(?:не\s+ем|не\s+ела?\s+(?:уже|ничего)|я\s+толст\w*|ненавижу\s+своё\s+тело|вызываю\s+рвоту|морю\s+себя)/iu, cat: 'eating_disorder', sev: 'medium', label: 'ru/eating' },

  // ── Substance use (MEDIUM) ───────────────────────────────────────────────
  { rx: /\b(?:i\s+(?:drank|smoke[d]?|tried|took)\s+(?:alcohol|beer|vodka|weed|marijuana|drugs|pills|cocaine|meth)|getting\s+drunk|got\s+high)\b/i, cat: 'substance_use', sev: 'medium', label: 'en/substance' },
  { rx: /(?:שתיתי\s+(?:אלכוהול|בירה|וודקה)|עישנתי\s+(?:גראס|סמים)|לקחתי\s+(?:כדורים|סמים))/u, cat: 'substance_use', sev: 'medium', label: 'he/substance' },
  { rx: /(?:пил[ао]?\s+(?:алкоголь|водку|пиво)|курил[ао]?\s+(?:травку|наркотики)|приним(?:ал|аю)\s+(?:таблетки|наркотики)|обкур(?:ился|илась))/iu, cat: 'substance_use', sev: 'medium', label: 'ru/substance' },

  // ── General distress / sadness (LOW — flag but no alert) ─────────────────
  { rx: /\b(?:i'?m\s+(?:so\s+)?(?:sad|lonely|depressed|anxious|stressed|tired\s+of\s+everything)|i\s+feel\s+(?:empty|numb|alone|lost)|nobody\s+understands\s+me)\b/i, cat: 'distress', sev: 'low', label: 'en/distress' },
  { rx: /(?:אני\s+(?:עצוב[ה]?|בודד[ה]?|בדיכאון|חרד[ה]?|לחוץ[ה]?)|אני\s+מרגיש[ה]?\s+(?:ריק[ה]?|לבד|אבוד[ה]?))/u, cat: 'distress', sev: 'low', label: 'he/distress' },
  { rx: /(?:мне\s+(?:грустно|одиноко|плохо)|я\s+(?:в\s+депрессии|тревож\w+|устал[ао]?)|чувствую\s+себя\s+(?:пустым|потерянн\w+))/iu, cat: 'distress', sev: 'low', label: 'ru/distress' },

  // ── Sexual content (HIGH) ────────────────────────────────────────────────
  { rx: /\b(?:penis|vagina|sex|porn|naked|nude|fuck(?:ing)?|blowjob|jerk\s+off|masturbat\w*)\b/i, cat: 'sexual', sev: 'high', label: 'en/sexual' },
  { rx: /\b(?:send\s+me\s+(?:nudes|pics)|inappropriate\s+touch\w*|touched\s+me\s+(?:there|down\s+there))\b/i, cat: 'sexual', sev: 'critical', label: 'en/sexual_grooming' },
  { rx: /(?:זין|פות|סקס|פורנו|עירום)/u, cat: 'sexual', sev: 'high', label: 'he/sexual' },
  { rx: /(?:член|вагин\w+|секс|порно|голый|трахн\w*)/iu, cat: 'sexual', sev: 'high', label: 'ru/sexual' },

  // ── Medical / psychiatric diagnosis attempts from the AI (MEDIUM) ────────
  { rx: /\byou\s+(?:have|might\s+have|are\s+suffering\s+from)\s+(?:adhd|autism|depression|bipolar|ocd|anxiety\s+disorder|ptsd)\b/i, cat: 'medical_advice', sev: 'medium', label: 'en/diagnosis' },
  { rx: /\b(?:take|try)\s+(?:\d+\s*mg\s+of|\w+\s+pill\b)/i, cat: 'medical_advice', sev: 'medium', label: 'en/dosing' },

  // ── PII leakage in AI output (MEDIUM) ────────────────────────────────────
  { rx: /\b(?:\+?972|0\d{1,2})[\s-]?\d{7,8}\b/, cat: 'pii_leak', sev: 'medium', label: 'phone_il' },
  { rx: /\b\d{1,3}\s+\w+\s+(?:street|st|road|rd|avenue|ave)\b/i, cat: 'pii_leak', sev: 'medium', label: 'address_en' },
];

export function checkSafety(text: string): SafetyResult {
  if (!text || !text.trim()) return { severity: 'safe', categories: [], matchedPhrases: [] };

  const matched: { cat: SafetyCategory; sev: SafetySeverity; phrase: string }[] = [];
  for (const p of PATTERNS) {
    const m = text.match(p.rx);
    if (m) matched.push({ cat: p.cat, sev: p.sev, phrase: m[0] });
  }

  if (matched.length === 0) return { severity: 'safe', categories: [], matchedPhrases: [] };

  // Highest severity wins overall.
  const order: Record<SafetySeverity, number> = { safe: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const top = matched.reduce((a, b) => (order[a.sev] >= order[b.sev] ? a : b));

  return {
    severity: top.sev,
    categories: Array.from(new Set(matched.map((m) => m.cat))),
    matchedPhrases: matched.map((m) => m.phrase),
  };
}

// Convenience: should the route block + alert, rewrite, or allow?
export function safetyAction(r: SafetyResult): 'allow' | 'flag' | 'block' {
  if (r.severity === 'safe' || r.severity === 'low') return 'allow';
  if (r.severity === 'medium') return 'flag';
  return 'block'; // high or critical
}

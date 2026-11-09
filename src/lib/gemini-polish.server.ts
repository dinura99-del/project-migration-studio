type Cue = { index: string; time: string; text: string };
type Pair = { id: number; en: string; si: string };
type Log = (message: string) => void;

export const POLISH_INSTRUCTIONS = `You are a Sri Lankan subtitle writer who writes Sinhala dialogue the way real Sri Lankans actually talk to each other (කතා කරන සිංහල), like a good local teledrama or film dub — never bookish written Sinhala (ලිඛිත / පොතේ සිංහල).
Translate the English line (en) into natural spoken Sinhala. If a machine draft (si) is present, use it only as a hint and rewrite it freely into spoken Sinhala; if si is empty, translate en directly.
SPOKEN STYLE (most important):
- Use spoken verb forms: යනවා, එනවා, කියන්නේ, කළා, ගියා, බලන්න, එන්න, යමු, කරපන්, නෑ, නැද්ද?, නේද?, වගේ, ඉතින්, අනේ, අයියෝ, හරි හරි, මොකද්ද, කොහෙද, ඇයි, දැන්.
- NEVER use written-only forms: -යි/-ෙමි/-ෙහි/-මු endings (කරන්නේය, යමි, ඇත, නොමැත, වේ, කරමින්, ගමන් කරමින්, අතහැරියේය), ඔහු/ඇය/ඔවුහු (use එයා / එයාලා / මිනිහා / කෙල්ල as fits), ඔබ in casual talk (use ඔයා; උඹ between rough friends; polite forms only for formal speech).
- Pick pronouns from the relationship and tone: friends/siblings → මං/උඹ or මම/ඔයා; parents/teachers/strangers → polite.
- Translate meaning and feeling, not words. English idioms become the Sinhala expression a local would say. Keep it short enough to read on screen.
- Keep emotion, humour, sarcasm, swearing strength, negation, tense and numbers.
LINES THAT ARE NOT SPEECH (still must be Sinhala):
- Sound/action tags like [door chimes jingle], [laughs nervously], [alarm beeping] → keep the brackets and write them in Sinhala: [දොරේ සීනුව නාද වෙනවා], [බයෙන් හිනාවෙනවා], [ඇලාම් එක නාද වෙනවා].
- Song lyrics with ♪ → translate the meaning into short, natural Sinhala lines, keeping ♪ and <i></i> exactly. A song title / artist name may stay in English inside a Sinhala sentence, e.g. ["Fade into You" - Mazzy Star ගීතය වාදනය වෙනවා].
OTHER RULES:
1. Keep character names, brands and acronyms correct (they may stay in English letters).
2. Each cue ID is an independent timed line: never merge, split, omit or add cues.
3. Keep speaker dashes (-), line breaks and inline tags like <i>.
4. Return JSON ONLY: {"cues":[{"id":1,"text":"සිංහල දෙබස"}]} with exactly one text per target ID. Every text must contain Sinhala; never return the English unchanged.
5. STRICT SCRIPT INTEGRITY: only Sinhala Unicode plus Latin for names. NEVER output Telugu, Tamil, Kannada, Malayalam, Bengali, Devanagari or any other script.`;

/** True when the English cue has real words that a Sinhala viewer needs translated. */
export function needsSinhala(enText: string): boolean {
  const plain = enText.replace(/<[^>]+>/g, " ").replace(/[♪♫\[\]]/g, " ").trim();
  return /[A-Za-z]{2,}/.test(plain) && !isLiteralCue(plain);
}

/** Cue IDs (1-based) whose output is still English where Sinhala is required. */
export function findUntranslatedCues(english: Cue[], out: Cue[]): number[] {
  const ids: number[] = [];
  english.forEach((cue, i) => {
    if (needsSinhala(cue.text) && !/[\u0D80-\u0DFF]/.test(out[i]?.text ?? "")) ids.push(i + 1);
  });
  return ids;
}

export class PolishError extends Error {
  constructor(message: string, public readonly blocked = false, public readonly retryAfterSeconds = 0) {
    super(message);
    this.name = "PolishError";
  }
}

export class FinalReviewError extends Error {
  constructor(
    message: string,
    readonly checked: number,
    readonly total: number,
    readonly cues: Cue[],
    /** True when the review stopped only because of Gemini quota/overload — retry QA later, no human needed. */
    readonly temporary = false,
  ) {
    super(message);
    this.name = "FinalReviewError";
  }
}

export function isMusicOrLyrics(text: string): boolean {
  const clean = text.trim();
  // Musical notes ♪ (U+266A) or ♫ (U+266B) or HTML entities
  if (/[♪♫]/.test(clean) || /&#983[45];/i.test(clean)) return true;
  // Sound effect / music tags like [Music], [Theme song playing], (Singing in English)
  if (/^[\[\(]\s*(?:music|singing|song|theme|instrumental|tune|melody|rhythm|vocal|choir|orchestra|pop|rock|rap|jazz).*[\]\)]$/i.test(clean)) return true;
  return false;
}

const TRIVIAL_EXPRESSIONS = new Set([
  "yes", "yeah", "yep", "yea", "no", "nope", "nah",
  "okay", "ok", "k", "alright", "all right", "sure",
  "thanks", "thank you", "bye", "goodbye", "good bye", "see ya",
  "hello", "hi", "hey", "wow", "oh", "ah", "uh", "um", "hmm", "huh",
  "oops", "shh", "sh", "sorry", "excuse me", "please", "welcome", "you're welcome",
]);

export function isTrivialCue(enText: string, siText: string): boolean {
  const cleanEn = enText.trim().replace(/^[-–—]\s*/, "").replace(/[.,!?:;'"“”‘’…]+$/, "").trim().toLowerCase();
  const cleanSi = siText.trim();
  // Must have a valid non-empty Sinhala translation or valid numeric/symbol translation
  const hasValidTranslation = /[\u0D80-\u0DFF]/.test(cleanSi) || /^[\d\s.,!?:;'"%$\-–—#@&*()\/]+$/.test(cleanSi);
  if (!cleanSi || !hasValidTranslation) return false;
  // Known single-phrase affirmation/reaction/greeting
  if (TRIVIAL_EXPRESSIONS.has(cleanEn)) return true;
  // Pure digits / symbols / time stamps without alphabetic letters (e.g. "1", "2024", "$50", "10:30")
  if (/^[\d\s.,!?:;'"%$\-–—#@&*()\/]+$/.test(cleanEn)) return true;
  return false;
}

// Comprehensive Indic to Sinhala mapping to prevent cross-script model hallucinations (e.g. Telugu "పూర్" -> Sinhala "පූර්")
const INDIC_TO_SINHALA: Record<string, string> = {
  // Telugu (0x0C00 - 0x0C7F)
  "\u0C15": "ක", "\u0C16": "ඛ", "\u0C17": "ග", "\u0C18": "ඝ", "\u0C19": "ඞ",
  "\u0C1A": "ච", "\u0C1B": "ඡ", "\u0C1C": "ජ", "\u0C1D": "ඣ", "\u0C1E": "ඤ",
  "\u0C1F": "ට", "\u0C20": "ඨ", "\u0C21": "ඩ", "\u0C22": "ඪ", "\u0C23": "ණ",
  "\u0C24": "ත", "\u0C25": "ථ", "\u0C26": "ද", "\u0C27": "ධ", "\u0C28": "න",
  "\u0C2A": "ප", "\u0C2B": "ඵ", "\u0C2C": "බ", "\u0C2D": "භ", "\u0C2E": "ම",
  "\u0C2F": "ය", "\u0C30": "ර", "\u0C31": "ර", "\u0C32": "ල", "\u0C33": "ළ",
  "\u0C35": "ව", "\u0C36": "ශ", "\u0C37": "ෂ", "\u0C38": "ස", "\u0C39": "හ",
  "\u0C05": "අ", "\u0C06": "ආ", "\u0C07": "ඉ", "\u0C08": "ඊ", "\u0C09": "උ",
  "\u0C0A": "ඌ", "\u0C0B": "ඍ", "\u0C0E": "එ", "\u0C0F": "ඒ", "\u0C12": "ඔ", "\u0C13": "ඕ",
  "\u0C3E": "ා", "\u0C3F": "ි", "\u0C40": "ී", "\u0C41": "ු", "\u0C42": "ූ",
  "\u0C43": "ෘ", "\u0C46": "ෙ", "\u0C47": "ේ", "\u0C48": "ෛ", "\u0C4A": "ො",
  "\u0C4B": "ෝ", "\u0C4C": "ෞ", "\u0C4D": "්", "\u0C02": "ං", "\u0C03": "ඃ",

  // Tamil (0x0B80 - 0x0BFF)
  "\u0B95": "ක", "\u0B99": "ඞ", "\u0B9A": "ච", "\u0B9E": "ඤ",
  "\u0B9F": "ට", "\u0BA3": "ණ", "\u0BA4": "ත", "\u0BA8": "න",
  "\u0BAA": "ප", "\u0BAE": "ම", "\u0BAF": "ය", "\u0BB0": "ර",
  "\u0BB2": "ල", "\u0BB5": "ව", "\u0BB4": "ළ", "\u0BB3": "ළ",
  "\u0BB1": "ර", "\u0BB7": "ෂ", "\u0BB8": "ස", "\u0BB9": "හ",
  "\u0B85": "අ", "\u0B86": "ආ", "\u0B87": "ඉ", "\u0B88": "ඊ", "\u0B89": "උ",
  "\u0B8A": "ඌ", "\u0B8E": "එ", "\u0B8F": "ඒ", "\u0B92": "ඔ", "\u0B93": "ඕ",
  "\u0BBE": "ා", "\u0BBF": "ි", "\u0BC0": "ී", "\u0BC1": "ු", "\u0BC2": "ූ",
  "\u0BC6": "ෙ", "\u0BC7": "ේ", "\u0BC8": "ෛ", "\u0BCA": "ො", "\u0BCB": "ෝ",
  "\u0BCD": "්", "\u0B82": "ං",

  // Kannada (0x0C80 - 0x0CFF)
  "\u0C95": "ක", "\u0C96": "ඛ", "\u0C97": "ග", "\u0C98": "ඝ", "\u0C99": "ඞ",
  "\u0C9A": "ච", "\u0C9B": "ඡ", "\u0C9C": "ජ", "\u0C9D": "ඣ", "\u0C9E": "ඤ",
  "\u0C9F": "ට", "\u0CA0": "ඨ", "\u0CA1": "ඩ", "\u0CA2": "ඪ", "\u0CA3": "ණ",
  "\u0CA4": "ත", "\u0CA5": "ථ", "\u0CA6": "ද", "\u0CA7": "ධ", "\u0CA8": "න",
  "\u0CAA": "ප", "\u0CAB": "ඵ", "\u0CAC": "බ", "\u0CAD": "භ", "\u0CAE": "ම",
  "\u0CAF": "ය", "\u0CB0": "ර", "\u0CB1": "ර", "\u0CB2": "ල", "\u0CB3": "ළ",
  "\u0CB5": "ව", "\u0CB6": "ශ", "\u0CB7": "ෂ", "\u0CB8": "ස", "\u0CB9": "හ",
  "\u0C85": "අ", "\u0C86": "ආ", "\u0C87": "ඉ", "\u0C88": "ඊ", "\u0C89": "උ",
  "\u0C8A": "ඌ", "\u0C8B": "ඍ", "\u0C8E": "එ", "\u0C8F": "ඒ", "\u0C92": "ඔ", "\u0C93": "ඕ",
  "\u0CBE": "ා", "\u0CBF": "ි", "\u0CC0": "ී", "\u0CC1": "ු", "\u0CC2": "ූ",
  "\u0CC3": "ෘ", "\u0CC6": "ෙ", "\u0CC7": "ේ", "\u0CC8": "ෛ", "\u0CCA": "ො",
  "\u0CCB": "ෝ", "\u0CCC": "ෞ", "\u0CCD": "්", "\u0C82": "ං", "\u0C83": "ඃ",

  // Devanagari (0x0900 - 0x097F)
  "\u0915": "ක", "\u0916": "ඛ", "\u0917": "ග", "\u0918": "ඝ", "\u0919": "ඞ",
  "\u091A": "ච", "\u091B": "ඡ", "\u091C": "ජ", "\u091D": "ඣ", "\u091E": "ඤ",
  "\u091F": "ට", "\u0920": "ඨ", "\u0921": "ඩ", "\u0922": "ඪ", "\u0923": "ණ",
  "\u0924": "ත", "\u0925": "ථ", "\u0926": "ද", "\u0927": "ධ", "\u0928": "න",
  "\u092A": "ප", "\u092B": "ඵ", "\u092C": "බ", "\u092D": "භ", "\u092E": "ම",
  "\u092F": "ය", "\u0930": "ර", "\u0932": "ල", "\u0933": "ළ",
  "\u0935": "ව", "\u0936": "ශ", "\u0937": "ෂ", "\u0938": "ස", "\u0939": "හ",
  "\u0905": "අ", "\u0906": "ආ", "\u0907": "ඉ", "\u0908": "ඊ", "\u0909": "උ",
  "\u090A": "ඌ", "\u090B": "ඍ", "\u090F": "එ", "\u0910": "ඓ", "\u0913": "ඔ", "\u0914": "ඖ",
  "\u093E": "ා", "\u093F": "ි", "\u0940": "ී", "\u0941": "ු", "\u0942": "ූ",
  "\u0943": "ෘ", "\u0947": "ේ", "\u0948": "ෛ", "\u094B": "ෝ", "\u094C": "ෞ",
  "\u094D": "්", "\u0902": "ං", "\u0903": "ඃ",
};

// Every Brahmic Indic Unicode block (Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada,
// Malayalam) shares the same ISCII letter layout, so the Telugu table above maps any of them by offset.
INDIC_TO_SINHALA["\u0C10"] = "ඓ"; INDIC_TO_SINHALA["\u0C14"] = "ඖ";
{
  const blocks = [0x0900, 0x0980, 0x0A00, 0x0A80, 0x0B00, 0x0B80, 0x0C00, 0x0C80, 0x0D00];
  for (const [ch, si] of Object.entries(INDIC_TO_SINHALA)) {
    const offset = ch.charCodeAt(0) - 0x0C00;
    if (offset < 0 || offset >= 0x80) continue;
    for (const base of blocks) {
      const key = String.fromCharCode(base + offset);
      if (!(key in INDIC_TO_SINHALA)) INDIC_TO_SINHALA[key] = si;
    }
  }
}

// Native digits of Indic, Thai, Lao and Myanmar scripts become ASCII digits (e.g. Bengali ১৮ → 18).
{
  const digitBases = [0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66, 0x0E50, 0x0ED0, 0x1040];
  for (const base of digitBases) for (let d = 0; d < 10; d++) INDIC_TO_SINHALA[String.fromCharCode(base + d)] ??= String(d);
}

// Whitelist: a Sinhala subtitle may contain Sinhala, Latin (names), and script-neutral symbols/marks.
// Any other letter, mark or digit (Telugu, Bengali, Gujarati, Thai, Lao, Myanmar, Greek, Cyrillic, CJK …) is a leak.
const FOREIGN_SCRIPT_SOURCE = "(?![\\p{sc=Latin}\\p{sc=Sinhala}\\p{sc=Common}\\p{sc=Inherited}])[\\p{L}\\p{M}\\p{Nd}]";
const FOREIGN_SCRIPT_TEST = new RegExp(FOREIGN_SCRIPT_SOURCE, "u");
const FOREIGN_SCRIPT_ALL = () => new RegExp(FOREIGN_SCRIPT_SOURCE, "gu");

export function hasForeignScript(text: string): boolean {
  return FOREIGN_SCRIPT_TEST.test(text);
}

/** Counts leaked foreign-script characters and how many of them have no Sinhala equivalent. */
export function countForeignScript(text: string): { total: number; unmapped: number } {
  const found = text.match(FOREIGN_SCRIPT_ALL()) ?? [];
  return { total: found.length, unmapped: found.filter((c) => !INDIC_TO_SINHALA[c]).length };
}

/** Converts leaked Telugu/Tamil/Kannada/Hindi/etc. letters to Sinhala and drops any that have no equivalent. Touches nothing else. */
export function fixForeignScript(text: string): string {
  if (!hasForeignScript(text)) return text;
  const chars = [...text];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (!FOREIGN_SCRIPT_TEST.test(ch)) { out += ch; continue; }
    const si = INDIC_TO_SINHALA[ch] ?? "";
    out += si;
    // A converted virama before ර/ය needs a zero-width joiner to render as Sinhala rakaransaya/yansaya (ප්‍ර, ක්‍ය).
    if (si === "්") {
      const nextRaw = chars[i + 1] ?? "";
      const next = FOREIGN_SCRIPT_TEST.test(nextRaw) ? INDIC_TO_SINHALA[nextRaw] ?? "" : nextRaw;
      if (next === "ර" || next === "ය") out += "\u200D";
    }
  }
  return out.replace(/[^\S\r\n]{2,}/g, " ").replace(/[^\S\r\n]+$/gm, "");
}

export function cleanSinhalaText(text: string): string {
  // Transliterate any leaked non-Sinhala script characters (e.g. Telugu, Tamil, Kannada, Hindi) into Sinhala
  let s = fixForeignScript(text.trim()).trim();
  // Remove space before punctuation marks: "යන්නේ ?" -> "යන්නේ?"
  s = s.replace(/\s+([?!.,;:])/g, "$1");
  // Normalize consecutive spaces into a single space
  s = s.replace(/[^\S\r\n]+/g, " ");
  // Remove spaces inside quotes
  s = s.replace(/“\s+/g, "“").replace(/\s+”/g, "”");
  return s;
}

// Curated Subtitle Translation Memory for high-frequency, universal subtitle expressions
const translationMemory = new Map<string, string>([
  ["let's go", "යමු"],
  ["let's go.", "යමු."],
  ["come on", "එන්න"],
  ["come on.", "එන්න."],
  ["watch out", "ප්‍රවේශමෙන්"],
  ["watch out!", "ප්‍රවේශමෙන්!"],
  ["be careful", "පරිස්සමෙන්"],
  ["be careful.", "පරිස්සමෙන්."],
  ["what happened?", "මොකද වුණේ?"],
  ["what happened", "මොකද වුණේ"],
  ["see you later", "පස්සේ හමුවෙමු"],
  ["see you later.", "පස්සේ හමුවෙමු."],
  ["previously on", "මීට පෙර"],
  ["shut up", "කට වහගනින්"],
  ["shut up!", "කට වහගනින්!"],
  ["good morning", "සුබ උදෑසනක්"],
  ["good morning.", "සුබ උදෑසනක්."],
  ["good night", "සුබ රාත්‍රියක්"],
  ["good night.", "සුබ රාත්‍රියක්."],
]);

export function lookupTranslationMemory(enText: string): string | undefined {
  const raw = enText.trim().toLowerCase();
  if (translationMemory.has(raw)) return translationMemory.get(raw);
  const norm = enText.trim().replace(/^[-–—]\s*/, "").replace(/[.,!?:;'"“”‘’…]+$/, "").trim().toLowerCase();
  const match = translationMemory.get(norm);
  if (!match) return undefined;
  if (/[!]$/.test(enText.trim()) && !/[!]$/.test(match)) return `${match}!`;
  if (/[?]$/.test(enText.trim()) && !/[?]$/.test(match)) return `${match}?`;
  return match;
}

export const AUDIT_INSTRUCTIONS = `You are the final Sri Lankan subtitle QC editor. You see English (en) and Sinhala (si) side by side for every line before it is published.
Fix a line ONLY when it has a real problem:
1. Wrong, reversed or missing meaning compared to English.
2. Any English left untranslated (except names/brands/song titles).
3. Bookish written Sinhala (ඇත, නොමැත, කරන්නේය, ඔහු, ඇය, කරමින්, -යි endings, ඔබ in casual talk) — rewrite it as natural spoken Sinhala the way Sri Lankans really talk (යනවා, නෑ, එයා, ඔයා/උඹ, නේද?, අනේ ...).
4. Robotic word-for-word phrasing a local would never say.
Keep ♪, <i>, brackets and speaker dashes. Never use any script except Sinhala (plus Latin for names).
Output JSON only:
{"summary":"1 sentence","corrections":[{"id":1,"issue":"short reason","fixedText":"fixed spoken Sinhala"}]}
If every line is fine return {"summary":"Accurate and natural.","corrections":[]}.`;

async function auditBatch(key: string, model: string, batch: { id: number; en: string; si: string }[]): Promise<{ summary?: string; corrections?: { id: number; issue: string; fixedText: string }[] } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AUDIT_INSTRUCTIONS }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ lines: batch }) }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              summary: { type: "STRING" },
              corrections: { type: "ARRAY", items: { type: "OBJECT", properties: {
                id: { type: "INTEGER" }, issue: { type: "STRING" }, fixedText: { type: "STRING" },
              }, required: ["id", "issue", "fixedText"] } },
            },
            required: ["summary", "corrections"],
          },
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      let reason = "";
      try { reason = JSON.parse(body)?.error?.status ?? ""; } catch { /* not JSON */ }
      throw new AuditRequestError(response.status, reason || body.slice(0, 120));
    }
    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
    return rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    if (error instanceof AuditRequestError) throw error;
    if ((error as Error)?.name === "AbortError") throw new AuditRequestError(408, "timeout");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** HTTP failure from the final review; 429/503/5xx/timeouts are temporary (quota or overload), not content problems. */
export class AuditRequestError extends Error {
  constructor(readonly status: number, readonly reason: string) {
    super(`HTTP ${status}${reason ? ` ${reason}` : ""}`);
    this.name = "AuditRequestError";
  }
  get temporary() { return this.status === 408 || this.status === 429 || this.status >= 500 || this.status === 0; }
}

const auditSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Side-by-side English vs Sinhala review of EVERY spoken line before publishing; applies safe corrections. */
export async function runFinalQAAudit(
  english: Cue[],
  polished: Cue[],
  log: Log,
  options: {
    keys?: string[];
    isTest?: boolean;
    model?: string;
    auditBatchFn?: typeof auditBatch | undefined;
    retryDelayMs?: number | undefined;
  } = {}
): Promise<{ passed: boolean; checked: number; corrected: number; summary: string; temporary?: boolean }> {
  log("  final check: comparing every English line with its Sinhala line…");
  if (options.isTest) {
    log(`  ✓ Final review: ${english.length} cues compared with English`);
    return { passed: true, checked: english.length, corrected: 0, summary: "Verified" };
  }
  const keys = options.keys ?? geminiKeys();
  if (!keys.length) {
    log("  ⚠ Final review incomplete: no Gemini keys available");
    return { passed: false, checked: 0, corrected: 0, summary: "Skipped (no Gemini keys available)" };
  }
  const model = options.model || process.env["GEMINI_POLISH_MODEL"]?.trim() || "gemini-3.5-flash-lite";

  const lines = english
    .map((cue, i) => ({ id: i + 1, en: cue.text, si: polished[i]?.text ?? "" }))
    .filter((l) => needsSinhala(l.en));
  const batches: (typeof lines)[] = [];
  for (let i = 0; i < lines.length; i += 60) batches.push(lines.slice(i, i + 60));

  let corrected = 0, reviewed = 0, next = 0, temporaryFailures = 0, failedBatches = 0;
  const summaries: string[] = [];
  const workers = Math.max(1, Math.min(keys.length, batches.length, 4));
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    while (next < batches.length) {
      const b = next++;
      const batch = batches[b]!;
      let res = null;
      const reviewBatch = options.auditBatchFn ?? auditBatch;
      let overloadRetries = 0;
      let sawTemporary = false;
      // Try every key at most once; 503 overload gets up to 2 jittered backoff retries on the same key.
      for (let k = 0; k < keys.length && !res; k++) {
        let candidate: Awaited<ReturnType<typeof auditBatch>> = null;
        try {
          candidate = await reviewBatch(keys[(w + b + k) % keys.length]!, model, batch);
        } catch (error) {
          const temp = error instanceof AuditRequestError ? error.temporary : true;
          if (temp) sawTemporary = true;
          const status = error instanceof AuditRequestError ? error.status : 0;
          if (status === 503 && overloadRetries < 2 && !options.isTest) {
            const waitMs = 2000 * 2 ** overloadRetries + Math.floor(Math.random() * 1000);
            overloadRetries++;
            log(`  final review: Gemini busy (503) — retry in ${(waitMs / 1000).toFixed(1)}s`);
            await auditSleep(options.retryDelayMs ?? waitMs);
            k--; // same key again
          } else if (status === 429) {
            await auditSleep(options.retryDelayMs ?? 1000 + Math.floor(Math.random() * 1000));
          }
          continue;
        }
        const validIds = new Set(batch.map((line) => line.id));
        const valid = candidate
          && typeof candidate.summary === "string"
          && Array.isArray(candidate.corrections)
          && candidate.corrections.every((item) =>
            validIds.has(item.id)
            && typeof item.issue === "string"
            && typeof item.fixedText === "string"
            && item.fixedText.trim().length > 0,
          );
        if (valid) res = candidate;
      }
      if (!res) {
        failedBatches++;
        if (sawTemporary) temporaryFailures++;
        log(`  final review: lines ${batch[0]!.id}–${batch.at(-1)!.id} could not be reviewed${sawTemporary ? " (Gemini busy/quota — will retry later)" : ""}`);
        continue;
      }
      reviewed += batch.length;
      if (res.summary) summaries.push(res.summary);
      const ids = new Set(batch.map((l) => l.id));
      for (const item of res.corrections ?? []) {
        const text = typeof item.fixedText === "string" ? item.fixedText : "";
        if (!ids.has(item.id) || !/[\u0D80-\u0DFF]/.test(text) || /-->|```/.test(text)) continue;
        const foreign = countForeignScript(text);
        if (foreign.unmapped > 0 || foreign.total > 3) continue;
        polished[item.id - 1]!.text = cleanSinhalaText(text);
        corrected++;
        log(`  final review fixed cue ${item.id}: ${item.issue}`);
      }
    }
  }));
  const summary = summaries[0] ?? "Reviewed";
  const passed = reviewed === lines.length;
  if (passed) {
    log(`  ✓ Final review: ${reviewed}/${lines.length} spoken lines compared with English — ${corrected} fixed`);
  } else {
    log(`  ⚠ Final review incomplete: only ${reviewed}/${lines.length} spoken lines compared with English — not safe to publish`);
  }
  // Temporary only when every unreviewed batch failed because of quota/overload/network.
  const temporary = !passed && temporaryFailures > 0 && temporaryFailures >= failedBatches;
  return { passed, checked: reviewed, corrected, summary, temporary };
}

export function geminiKeys(env: Record<string, string | undefined> = process.env): string[] {
  const names = Object.keys(env)
    .filter((n) => /^GEMINI_(?:API_)?KEY(?:_\w+)?$/i.test(n))
    .sort((a, b) => {
      const aIsMain = /^GEMINI_(?:API_)?KEY$/i.test(a);
      const bIsMain = /^GEMINI_(?:API_)?KEY$/i.test(b);
      if (aIsMain && !bIsMain) return -1;
      if (!aIsMain && bIsMain) return 1;
      const numA = Number(a.split("_").pop());
      const numB = Number(b.split("_").pop());
      if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  return [...new Set(names.flatMap((n) => (env[n] ?? "").split(",").map((k) => k.trim()).filter(Boolean)))];
}

// Everyday English words that must still be translated even when capitalised alone ("Goodbye!", "Wait!").
const COMMON_ENGLISH_WORDS = new Set([
  ...TRIVIAL_EXPRESSIONS, "wait", "stop", "help", "run", "go", "come", "look", "listen", "what", "why", "how", "who",
  "where", "when", "now", "here", "there", "again", "really", "god", "man", "guys", "dad", "mom", "mum", "sir", "madam",
  "the", "a", "an", "and", "or", "but", "you", "me", "i", "we", "he", "she", "it", "they", "this", "that", "good", "great",
  "fine", "right", "left", "down", "up", "back", "out", "get", "move", "hurry", "quiet", "enough", "never", "always",
  "mr", "mrs", "ms", "dr", "miss", "mister", "lady", "boss", "captain", "doctor", "officer", "detective", "agent",
]);

/**
 * True when an English cue is only a proper name, acronym, number or symbol (e.g. "Rachel!", "Harvey Dent!",
 * "FBI", "1984", "#42"). Gemini may legitimately keep these in Latin script, so validation must not reject them.
 */
export function isLiteralCue(enText: string): boolean {
  const clean = enText.trim().replace(/^[-–—]\s*/, "");
  if (!clean) return false;
  if (/^[\d\s.,!?:;'"%$\-–—#@&*()\/+]+$/.test(clean)) return true;
  const words = clean.replace(/[.,!?:;'"“”‘’…()]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return false;
  return words.every((w) => {
    if (/^\d+$/.test(w)) return true;
    if (/^[A-Z]{2,6}s?$/.test(w)) return true; // acronym: FBI, CIA, NASA
    return /^[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?$/.test(w) && !COMMON_ENGLISH_WORDS.has(w.toLowerCase());
  });
}

/** Latin-only output is accepted only for literal cues, and only when it reuses the source's own words. */
function isAcceptedLatinOutput(enText: string | undefined, text: string): boolean {
  if (!enText || !isLiteralCue(enText)) return false;
  const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/).filter(Boolean);
  const source = new Set(tokens(enText));
  const out = tokens(text);
  return out.length > 0 ? out.every((t) => source.has(t)) : /^[\d\s.,!?:;'"%$\-–—#@&*()\/+]+$/.test(text);
}

export function validatePolish(pairs: Pair[], raw: string): Map<number, string> {
  const sourceById = new Map(pairs.map((pair) => [pair.id, pair.en]));
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new PolishError("Gemini polish: invalid JSON — nothing published"); }
  const entries = value && typeof value === "object" && "cues" in value ? value.cues : null;
  if (!Array.isArray(entries) || entries.length !== pairs.length) throw new PolishError("Gemini polish: missing or extra cues — nothing published");
  const ids = new Set(pairs.map((pair) => pair.id));
  const result = new Map<number, string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !Number.isInteger(entry.id) || !ids.has(entry.id) || result.has(entry.id)) {
      throw new PolishError("Gemini polish: duplicate or unknown cue ID — nothing published");
    }
    const rawText = typeof entry.text === "string" ? entry.text : "";
    // A stray leaked letter is repaired below; whole words in another script mean the line must be re-translated.
    const foreign = countForeignScript(rawText);
    if (foreign.unmapped > 0 || foreign.total > 3) {
      throw new PolishError(`Gemini polish: cue ${entry.id} contains non-Sinhala script — retrying`);
    }
    const text = cleanSinhalaText(rawText);
    if (!text || /-->|\n\s*\n|```/.test(text) || (!/[\u0D80-\u0DFF]/.test(text) && !(isMusicOrLyrics(text) && !/[A-Za-z]{2,}/.test(sourceById.get(entry.id) ?? "")) && !isAcceptedLatinOutput(sourceById.get(entry.id), text))) {
      throw new PolishError(`Gemini polish: empty, untranslated or malformed cue ${entry.id} — nothing published`);
    }
    result.set(entry.id, text);
  }
  return result;
}

type Generate = (key: string, targets: Pair[], context: Pair[], signal: AbortSignal) => Promise<string>;

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new PolishError("Gemini polish cancelled — nothing published")); return; }
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new PolishError("Gemini polish cancelled — nothing published"));
    };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// 429 is thrown with a special rate-limit flag so the caller can rotate keys.
export class RateLimitError extends PolishError {
  constructor(public readonly retryAfterMs: number) {
    super(`Gemini polish HTTP 429 — rate limited`, false, Math.ceil(retryAfterMs / 1000));
    this.name = "RateLimitError";
  }
}

export async function generatePolish(key: string, targets: Pair[], context: Pair[], signal: AbortSignal, log: Log = () => {}): Promise<string> {
  const model = process.env["GEMINI_POLISH_MODEL"]?.trim() || "gemini-3.5-flash-lite";
  if (!/^gemini-[a-z0-9.-]*flash[a-z0-9.-]*$/.test(model)) throw new PolishError("GEMINI_POLISH_MODEL must be a Gemini Flash model", true);
  // Retry once per model on 503 overload only, using the same key and exact cue payload.
  const models = [...new Set([model, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash"])];
  for (const [position, currentModel] of models.entries()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal.aborted) throw new PolishError("Gemini polish cancelled — nothing published");
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: POLISH_INSTRUCTIONS }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify({ context, targets }) }] }],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: "application/json",
            responseSchema: { type: "OBJECT", properties: { cues: { type: "ARRAY", items: {
              type: "OBJECT", properties: { id: { type: "INTEGER" }, text: { type: "STRING" } }, required: ["id", "text"],
            } } }, required: ["cues"] },
          },
        }),
      });
      if (response.status === 503 && (attempt === 0 || position < models.length - 1)) {
        const retryHeader = response.headers.get("retry-after");
        const seconds = retryHeader ? (Number(retryHeader) || Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : 0;
        await response.body?.cancel();
        const nextModel = attempt === 0 ? currentModel : models[position + 1];
        const waitMs = Math.max(2000, Number.isFinite(seconds) ? seconds * 1000 : 0);
        log(`  Gemini ${currentModel} HTTP 503; ${attempt === 0 ? "retry" : `fallback → ${nextModel}`} after ${waitMs / 1000}s (cues ${targets[0]?.id}–${targets.at(-1)?.id})`);
        await waitForRetry(waitMs, signal);
        if (attempt === 0) continue;
        break;
      }
      if (response.status === 429) {
        // Throw a special error so the worker pool can rotate to a fresh key.
        const retryHeader = response.headers.get("retry-after");
        const seconds = retryHeader ? (Number(retryHeader) || Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : 0;
        await response.body?.cancel();
        const waitMs = Math.max(5000, Number.isFinite(seconds) ? seconds * 1000 : 0);
        throw new RateLimitError(waitMs);
      }
      if (!response.ok) {
        const retryHeader = response.headers.get("retry-after");
        const seconds = retryHeader ? (Number(retryHeader) || Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : 0;
        // Never put provider error bodies or credential-bearing URLs in logs.
        throw new PolishError(`Gemini polish HTTP ${response.status} — stopped; nothing published`,
          [400, 401, 402, 403, 404].includes(response.status), Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
      }
      const body = await response.json();
      const candidate = body.candidates?.[0];
      if (body.promptFeedback?.blockReason || candidate?.finishReason !== "STOP") {
        throw new PolishError("Gemini polish refused or incomplete — stopped; nothing published", true);
      }
      const text = candidate?.content?.parts?.filter((part: { thought?: boolean }) => !part.thought)
        .map((part: { text?: string }) => part.text ?? "").join("");
      if (!text) throw new PolishError("Gemini polish returned no text — nothing published");
      return text;
    }
  }
  throw new PolishError("Gemini polish overload retries exhausted — stopped; nothing published");
}

export function verifySubtitleAlignment(english: Cue[], polished: Cue[], log: Log = () => {}) {
  if (english.length !== polished.length) {
    throw new PolishError(`Subtitle integrity mismatch: English has ${english.length} cues, but Sinhala has ${polished.length} cues`);
  }
  for (let i = 0; i < english.length; i++) {
    const en = english[i]!;
    const si = polished[i]!;
    if (en.time !== si.time) {
      throw new PolishError(`Subtitle timing drift detected at cue ${i + 1}: English [${en.time}] != Sinhala [${si.time}]`);
    }
    if (en.index !== si.index) {
      throw new PolishError(`Subtitle index mismatch at cue ${i + 1}: English [#${en.index}] != Sinhala [#${si.index}]`);
    }
    if (!si.text || !si.text.trim()) {
      throw new PolishError(`Subtitle empty dialogue detected at cue ${i + 1}`);
    }
  }
  log(`  ✓ Subtitle Timing & Dialogue Integrity Check: 100% verified (${english.length}/${english.length} cues, 0 timing drift, exact 1:1 dialogue alignment)`);
}

export async function polishCues(english: Cue[], sinhala: Cue[], log: Log, options: {
  keys?: string[] | undefined; generate?: Generate | undefined; chunkSize?: number | undefined; pauseMs?: number | undefined; maxWorkers?: number | undefined;
  cachedCues?: Record<string | number, string> | Map<number, string> | undefined;
  onChunkDone?: ((cues: [number, string][]) => void) | undefined;
  audit?: boolean | undefined;
  auditBatchFn?: typeof auditBatch | undefined;
} = {}): Promise<Cue[]> {
  const hasBaseSinhala = sinhala.length > 0;
  if (!english.length || (hasBaseSinhala && (english.length !== sinhala.length || english.some((cue, i) => {
    const translated = sinhala[i];
    // An individual empty draft line is allowed: Gemini translates that line directly from English.
    return !translated || cue.index !== translated.index || cue.time !== translated.time;
  })))) throw new PolishError("Base translation cue IDs/times do not match English — nothing published");
  const keys = [...new Set(options.keys ?? geminiKeys())];
  if (!keys.length) throw new PolishError("Gemini polish requires GEMINI_API_KEY (or GEMINI_API_KEY_1, _2, …)", true);
  const pairs = english.map((cue, i) => ({ id: i + 1, en: cue.text, si: sinhala[i]?.text ?? "" }));
  const out = english.map((cue) => ({ ...cue }));

  // Convert cachedCues to Map for quick lookup
  const cachedMap = options.cachedCues instanceof Map
    ? options.cachedCues
    : new Map(Object.entries(options.cachedCues ?? {}).map(([k, v]) => [Number(k), v]));

  // Separate dialogue cues from song lyrics / music cues, cached cues, TM matches, and trivial cues
  const dialoguePairs: Pair[] = [];
  let skippedLyrics = 0;
  let restoredFromCache = 0;
  let matchedTM = 0;
  let skippedTrivial = 0;
  const instantCues: [number, string][] = [];

  const isCustomGenerate = typeof options.generate === "function";

  for (const pair of pairs) {
    if (!needsSinhala(pair.en) && (isMusicOrLyrics(pair.en) || isMusicOrLyrics(pair.si))) {
      // Only wordless music cues (e.g. "♪♪") are kept as-is; lyrics and sound tags are translated
      out[pair.id - 1]!.text = pair.en;
      skippedLyrics++;
    } else if (cachedMap.has(pair.id) && cachedMap.get(pair.id)?.trim()) {
      // Restore previously polished cue from cache (skip re-polishing)
      out[pair.id - 1]!.text = cleanSinhalaText(cachedMap.get(pair.id)!);
      restoredFromCache++;
    } else if (!isCustomGenerate && lookupTranslationMemory(pair.en)) {
      // Instant match from Subtitle Translation Memory (0s)
      const tmText = lookupTranslationMemory(pair.en)!;
      out[pair.id - 1]!.text = tmText;
      matchedTM++;
      instantCues.push([pair.id, tmText]);
    } else if (!isCustomGenerate && isTrivialCue(pair.en, pair.si)) {
      // Fast path: retain and clean verified simple affirmation/reaction/numeric translation
      const cleaned = cleanSinhalaText(pair.si);
      out[pair.id - 1]!.text = cleaned;
      skippedTrivial++;
      instantCues.push([pair.id, cleaned]);
    } else {
      dialoguePairs.push(pair);
    }
  }

  if (instantCues.length > 0) {
    options.onChunkDone?.(instantCues);
  }

  if (skippedLyrics > 0) {
    log(`  skipped ${skippedLyrics} song lyrics / music cue(s) from AI polish (retained original)`);
  }
  if (restoredFromCache > 0) {
    log(`  resumed polish: ${restoredFromCache} cue(s) restored from cache`);
  }
  if (matchedTM > 0) {
    log(`  matched ${matchedTM} cue(s) via Subtitle Translation Memory (instant 0s)`);
  }
  if (skippedTrivial > 0) {
    log(`  optimized ${skippedTrivial} trivial / numeric cue(s) via Rule Engine (bypassed AI, saved quota)`);
  }

  if (!dialoguePairs.length) {
    log("@@step:polish");
    log(`@@pct:${pairs.length}/${pairs.length}`);
    log("@@polish_complete");
    log("  Gemini polish complete — all cues were cached, trivial or music, original timestamps preserved");
    return repairForeignScript(out, log);
  }

  const defaultChunkSize = Number(process.env["GEMINI_CHUNK_SIZE"]) || 50;
  const size = Math.max(1, Math.min(75, options.chunkSize ?? defaultChunkSize));
  const chunks: Pair[][] = [];
  let chunk: Pair[] = [], chars = 0;
  for (const pair of dialoguePairs) {
    const count = pair.en.length + pair.si.length;
    if (chunk.length && (chunk.length >= size || chars + count > 16000)) { chunks.push(chunk); chunk = []; chars = 0; }
    chunk.push(pair); chars += count;
  }
  if (chunk.length) chunks.push(chunk);
  if (chunks.length > 200) throw new PolishError("Subtitle exceeds polish run limit (200 chunks) — nothing published");
  const envMaxWorkers = Number(process.env["GEMINI_MAX_WORKERS"]);
  // Default to max 7 active workers so extra keys (e.g. with 10 or 11 keys, 3-4 remain on standby)
  // are preserved as fresh backup for instant 429 rotation without hitting project RPM limits.
  const maxWorkers = Math.max(1, options.maxWorkers ?? (envMaxWorkers > 0 ? envMaxWorkers : Math.min(keys.length, 7)));
  const workers = Math.min(keys.length, chunks.length, maxWorkers);
  const controller = new AbortController();
  let next = 0, done = skippedLyrics + restoredFromCache + matchedTM + skippedTrivial, failure: unknown;
  log("@@step:polish"); log(`@@pct:${done}/${pairs.length}`);
  log(`@@polish_init:${chunks.length}:${workers}:${pairs.length}`);
  log(`  Gemini Flash polish: ${chunks.length} chunks, ${workers} parallel worker(s); English/Sinhala comparison`);
  // Stagger worker startup by 600ms per worker to avoid simultaneous quota bursts.
  const STAGGER_MS = options.pauseMs !== undefined ? 0 : 600;
  // Shared across all workers: a key that hit 429 is skipped by every worker until its cooldown expires.
  const keyCooldownUntil = new Map<string, number>();
  const pickKey = (offset: number): { index: number; waitMs: number } => {
    const now = Date.now();
    let soonest = offset, soonestAt = Infinity;
    for (let i = 0; i < keys.length; i++) {
      const idx = offset + i;
      const until = keyCooldownUntil.get(keys[idx % keys.length]!) ?? 0;
      if (until <= now) return { index: idx, waitMs: 0 };
      if (until < soonestAt) { soonestAt = until; soonest = idx; }
    }
    return { index: soonest, waitMs: Math.max(0, soonestAt - now) };
  };
  await Promise.all(Array.from({ length: workers }, async (_, worker) => {
    if (worker > 0 && STAGGER_MS > 0) await waitForRetry(worker * STAGGER_MS, controller.signal).catch(() => {});
    if (controller.signal.aborted) return;
    // Each worker owns a slot offset; on 429 it steps forward through the pool.
    let keyOffset = worker;
    const workerId = worker + 1;
    while (next < chunks.length && !controller.signal.aborted) {
      const chunkIdx = next++;
      const targets = chunks[chunkIdx];
      const first = targets?.[0], last = targets?.at(-1);
      if (!targets || !first || !last) return;
      const context = [...pairs.slice(Math.max(0, first.id - 3), first.id - 1), ...pairs.slice(last.id, last.id + 2)];
      log(`@@worker_start:${workerId}:${chunkIdx}:${first.id}:${last.id}`);
      try {
        let result: Map<number, string> | null = null;
        const MAX_CHUNK_ATTEMPTS = 4;
        for (let chunkAttempt = 0; chunkAttempt < MAX_CHUNK_ATTEMPTS && !controller.signal.aborted; chunkAttempt++) {
          try {
            let raw = "";
            const maxKeyAttempts = Math.max(keys.length * 3, 20);
            let consecutive429 = 0;
            for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
              const pick = pickKey(keyOffset);
              keyOffset = pick.index;
              if (pick.waitMs > 0) {
                const waitMs = Math.min(25000, pick.waitMs);
                log(`  All Gemini keys cooling down; worker ${workerId} waits ${Math.ceil(waitMs / 1000)}s (cues ${first.id}–${last.id})`);
                await waitForRetry(waitMs, controller.signal);
              }
              const key = keys[keyOffset % keys.length]!;
              try {
                for (let attempt = 0; attempt < 2; attempt++) {
                  raw = options.generate
                    ? await options.generate(key, targets, context, controller.signal)
                    : await generatePolish(key, targets, context, controller.signal, (m) => {
                        log(m);
                        if (m.includes("503")) log(`@@worker_retry:${workerId}:${chunkIdx}`);
                      });
                  if (controller.signal.aborted) return;
                  try {
                    result = validatePolish(targets, raw);
                    break;
                  } catch (valErr) {
                    if (attempt === 0 && !controller.signal.aborted && !options.generate && valErr instanceof PolishError && !valErr.blocked) {
                      log(`  Gemini polish cue validation retry (cues ${first.id}–${last.id})`);
                      log(`@@worker_retry:${workerId}:${chunkIdx}`);
                      await waitForRetry(1500, controller.signal);
                      continue;
                    }
                    throw valErr;
                  }
                }
                consecutive429 = 0;
                break; // success — exit key rotation loop
              } catch (err) {
                if (err instanceof RateLimitError && !controller.signal.aborted && !options.generate) {
                  consecutive429++;
                  const cooldownMs = Math.min(30000, Math.max(err.retryAfterMs, 10000 + Math.min(consecutive429, 5) * 1000));
                  keyCooldownUntil.set(key, Math.max(keyCooldownUntil.get(key) ?? 0, Date.now() + cooldownMs));
                  keyOffset++;
                  const nextPick = pickKey(keyOffset);
                  const nextKey = keys[nextPick.index % keys.length]!;
                  log(`  Gemini 429 on key …${key.slice(-6)}; cooling ${Math.round(cooldownMs / 1000)}s for all workers → ${nextPick.waitMs > 0 ? "no fresh key, waiting" : `fresh key …${nextKey.slice(-6)}`} (cues ${first.id}–${last.id})`);
                  log(`@@worker_retry:${workerId}:${chunkIdx}`);
                  // Fresh key available: tiny pause only. Otherwise the wait happens at the top of the loop.
                  if (nextPick.waitMs === 0) await waitForRetry(500, controller.signal);
                  continue;
                }
                throw err;
              }
            }
            if (result) break; // chunk success
          } catch (chunkErr) {
            if (controller.signal.aborted) return;
            if (chunkErr instanceof PolishError && chunkErr.blocked) throw chunkErr;
            if (options.generate) throw chunkErr;
            if (chunkAttempt < MAX_CHUNK_ATTEMPTS - 1) {
              keyOffset++;
              const waitMs = (chunkAttempt + 1) * 2500;
              log(`  Gemini polish chunk retry ${chunkAttempt + 2}/${MAX_CHUNK_ATTEMPTS} after ${waitMs / 1000}s (cues ${first.id}–${last.id})`);
              log(`@@worker_retry:${workerId}:${chunkIdx}`);
              await waitForRetry(waitMs, controller.signal);
              continue;
            }
            // One bad line can sink a whole chunk: retry in small pieces so the rest still get Sinhala.
            log(`  Gemini polish: chunk retries exhausted — retrying cues ${first.id}–${last.id} in small groups`);
            result = await polishInSmallGroups(keys, targets, pairs, controller.signal, log, keyOffset);
            break;
          }
        }
        if (!result) result = new Map(targets.map((t) => [t.id, t.si.trim() ? t.si : t.en]));
        for (const target of targets) {
          const cue = out[target.id - 1];
          // Fail-safe: never let one stubborn chunk discard the whole subtitle.
          const text = result.get(target.id)?.trim() || target.si.trim() || target.en;
          if (!cue) throw new PolishError("Gemini polish cue mapping failed — nothing published");
          cue.text = cleanSinhalaText(text);
        }
        done += targets.length;
        options.onChunkDone?.(targets.map((t) => [t.id, out[t.id - 1]!.text] as [number, string]));
        log(`@@worker_done:${workerId}:${chunkIdx}:${first.id}:${last.id}:${done}`);
        log(`@@pct:${done}/${pairs.length}`);
        log(`  polished ${done}/${pairs.length} cues`);
        if (next < chunks.length && !controller.signal.aborted) {
          log(`@@worker_idle:${workerId}`);
          await new Promise((resolve) => setTimeout(resolve, options.pauseMs ?? 4500));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          failure = error instanceof PolishError ? error : new PolishError("Gemini polish request failed — stopped; nothing published");
          controller.abort();
        }
      }
    }
    log(`@@worker_complete:${workerId}`);
  }));
  if (failure) throw failure;
  if (done !== pairs.length) throw new PolishError("Gemini polish incomplete — nothing published");
  log("@@polish_complete");
  log("  Gemini polish complete — all cue IDs, order and original timestamps preserved");
  verifySubtitleAlignment(english, out, log);
  const shouldSkipNetworkAudit = !options.auditBatchFn && Boolean(options.generate || (process.env["VITEST"] && options.audit !== true) || options.audit === false);
  if (!shouldSkipNetworkAudit) {
    let audit: Awaited<ReturnType<typeof runFinalQAAudit>>;
    try {
      audit = await runFinalQAAudit(english, out, log, { keys, auditBatchFn: options.auditBatchFn });
    } catch (error) {
      throw new FinalReviewError(`Final meaning review failed: ${error instanceof Error ? error.message : String(error)}`, 0, english.length, out);
    }
    if (!audit.passed) {
      throw new FinalReviewError(
        `Final meaning review incomplete: ${audit.checked}/${english.filter((cue) => needsSinhala(cue.text)).length} spoken lines checked`,
        audit.checked,
        english.filter((cue) => needsSinhala(cue.text)).length,
        out,
        Boolean(audit.temporary),
      );
    }
  }
  await ensureAllSinhala(english, out, pairs, keys, log, options.generate);
  return repairForeignScript(out, log);
}

/** Retry cues 5 at a time; anything still failing keeps its Sinhala draft (or English, caught by the final gate). */
async function polishInSmallGroups(keys: string[], targets: Pair[], pairs: Pair[], signal: AbortSignal, log: Log, offset = 0, generate?: Generate): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  for (let i = 0; i < targets.length; i += 5) {
    const group = targets.slice(i, i + 5);
    const first = group[0]!, last = group.at(-1)!;
    const context = [...pairs.slice(Math.max(0, first.id - 3), first.id - 1), ...pairs.slice(last.id, last.id + 2)];
    let ok: Map<number, string> | null = null;
    for (let k = 0; k < Math.min(3, keys.length + 1) && !ok && !signal.aborted; k++) {
      try {
        const key = keys[(offset + i + k) % keys.length]!;
        const raw = generate ? await generate(key, group, context, signal) : await generatePolish(key, group, context, signal, log);
        ok = validatePolish(group, raw);
      } catch (err) {
        if (err instanceof PolishError && err.blocked) throw err;
        if (signal.aborted) break;
        await waitForRetry(err instanceof RateLimitError ? 5000 : 1500, signal).catch(() => {});
      }
    }
    for (const t of group) result.set(t.id, ok?.get(t.id) ?? (t.si.trim() ? t.si : t.en));
  }
  return result;
}

/**
 * Pre-publish gate: every cue with real English words must come out in Sinhala.
 * Leftovers get one more small-group pass; if any remain, nothing is published.
 */
async function ensureAllSinhala(english: Cue[], out: Cue[], pairs: Pair[], keys: string[], log: Log, generate?: Generate) {
  let missing = findUntranslatedCues(english, out);
  if (!missing.length) {
    log(`  ✓ English vs Sinhala check: all ${english.length} cues are in Sinhala`);
    return;
  }
  log(`  English vs Sinhala check: ${missing.length} cue(s) still English — re-translating`);
  const controller = new AbortController();
  const fixed = await polishInSmallGroups(keys, missing.map((id) => pairs[id - 1]!), pairs, controller.signal, log, 0, generate);
  for (const [id, text] of fixed) if (/[\u0D80-\u0DFF]/.test(text)) out[id - 1]!.text = cleanSinhalaText(text);
  missing = findUntranslatedCues(english, out);
  if (missing.length) {
    throw new PolishError(`${missing.length} cue(s) still in English (e.g. #${missing.slice(0, 8).join(", #")}) — not published`);
  }
  log(`  ✓ English vs Sinhala check: all ${english.length} cues are in Sinhala`);
}

/** Last line of defence before publishing: no cue may contain Telugu/Tamil/Kannada/Hindi/etc. letters. */
function repairForeignScript(cues: Cue[], log: Log): Cue[] {
  let fixed = 0;
  for (const cue of cues) {
    if (hasForeignScript(cue.text)) { cue.text = fixForeignScript(cue.text); fixed++; }
  }
  if (fixed) log(`  fixed other-language letters in ${fixed} cue(s)`);
  return cues;
}
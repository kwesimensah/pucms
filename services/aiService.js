/**
 * AI / NLP Classification Service
 * ---------------------------------
 * This module is intentionally isolated from the rest of the application so
 * that this lightweight keyword/rule-based NLP pipeline (suitable for an
 * academic prototype) can later be swapped for a trained supervised ML
 * model (e.g. a Python microservice) WITHOUT changing any caller code.
 * Every caller only ever uses `classifyComplaint(text)` and gets back:
 *   { category, confidence, priority, keywords, requiresManualReview }
 *
 * Pipeline stages (mirrors the proposal's NLP pipeline):
 *   1. Text preprocessing   -> normalize(), tokenize()
 *   2. Feature extraction   -> extractFeatures()  (keyword/category hits)
 *   3. "Model" (rule-based) -> scoreCategories()   (stand-in for a trained model)
 *   4. Classification       -> pick highest-scoring category
 *   5. Confidence scoring   -> normalize scores into a 0..1 confidence
 *   6. Priority detection   -> detectPriority()
 */

// ---- 1. Category keyword model -------------------------------------------------
// In a production system this would be replaced by embeddings + a trained
// classifier. Here, each category is defined by weighted keyword signals.
const CATEGORY_DEFINITIONS = [
  {
    category: 'Power Outage',
    utility: 'Electricity',
    keywords: [
      ['power outage', 3], ['no power', 3], ['no electricity', 3], ['power off', 2.5],
      ['light off', 2], ['lights out', 2], ['electricity off', 2.5], ['power cut', 3],
      ['blackout', 3], ['power tripped', 2], ['transformer', 2], ['ecg', 1.5],
      ['power fluctuation', 2], ['voltage', 1.5], ['power surge', 2.5], ['dumsor', 3],
      ['without electricity', 3], ['without power', 3], ['electricity', 1.2],
      ['electrical', 1.2], ['power', 0.8]
    ]
  },
  {
    category: 'Billing Dispute',
    utility: 'Electricity',
    keywords: [
      ['bill', 2], ['billing', 2.5], ['overcharged', 3], ['wrong meter reading', 3],
      ['high bill', 2.5], ['invoice', 2], ['meter reading', 2], ['charged twice', 3],
      ['billing address', 2.5], ['payment', 1.5], ['tariff', 2], ['prepaid credit', 2],
      ['refund', 2], ['change my billing', 3]
    ]
  },
  {
    category: 'Water Supply Issue',
    utility: 'Water',
    keywords: [
      ['no water', 3], ['water supply', 2.5], ['low water pressure', 3], ['water pressure', 2.5],
      ['water not flowing', 3], ['dry tap', 2.5], ['water shortage', 3], ['burst pipe', 2.5],
      ['leaking pipe', 2.5], ['contaminated water', 3], ['dirty water', 3], ['water quality', 2],
      ['gwcl', 1.5], ['pipe leak', 2.5], ['no running water', 3]
    ]
  },
  {
    category: 'Network Connectivity',
    utility: 'Telecommunications',
    keywords: [
      ['no network', 3], ['no signal', 3], ['internet', 2], ['connection', 1.5],
      ['unstable connection', 2.5], ['network down', 3], ['data not working', 2.5],
      ['slow internet', 2.5], ['call drop', 2.5], ['network issue', 2.5], ['broadband', 2],
      ['wifi', 1.5], ['sim', 1.5], ['poor reception', 2.5], ['network outage', 3]
    ]
  },
  {
    category: 'Sanitation',
    utility: 'Sanitation',
    keywords: [
      ['garbage', 2.5], ['refuse', 2.5], ['waste not collected', 3], ['rubbish', 2.5],
      ['sewage', 2.5], ['drainage', 2], ['gutter', 2], ['bad smell', 2], ['dump site', 2.5],
      ['not collected', 2], ['overflowing bin', 2.5], ['sanitation', 2], ['blocked drain', 2.5],
      ['open defecation', 2.5], ['dirty environment', 2]
    ]
  },
  {
    category: 'General',
    utility: 'General',
    keywords: [
      ['change my address', 1.5], ['update my details', 1.5], ['general inquiry', 1.5],
      ['information', 1], ['question', 1], ['complaint', 0.5]
    ]
  }
];

// ---- 6. Priority signal model ---------------------------------------------------
const CRITICAL_SIGNALS = [
  'danger', 'dangerous', 'immediate danger', 'live wire', 'exposed wire', 'fire',
  'explosion', 'electrocut', 'collapsed', 'sparking', 'injury', 'injured', 'death',
  'life-threatening', 'emergency', 'hazard', 'unsafe', 'risk of', 'flooding'
];
const HIGH_SIGNALS = [
  'entire street', 'entire community', 'whole area', 'since yesterday', 'since last night',
  'two days', '2 days', 'three days', '3 days', 'a week', 'several days', 'whole neighborhood',
  'everyone in', 'entire neighborhood', 'days now', 'all week'
];
const LOW_SIGNALS = [
  'how can i', 'how do i', 'question about', 'change my billing address', 'update my details',
  'just wondering', 'information about', 'when will', 'general inquiry'
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCategories(normalizedText) {
  const scores = CATEGORY_DEFINITIONS.map((def) => {
    let score = 0;
    const hits = [];
    for (const [phrase, weight] of def.keywords) {
      if (normalizedText.includes(phrase)) {
        score += weight;
        hits.push(phrase);
      }
    }
    return { category: def.category, utility: def.utility, score, hits };
  });
  return scores.sort((a, b) => b.score - a.score);
}

function detectPriority(normalizedText, topScore) {
  // Safety-related language always wins, regardless of category strength.
  const hasCritical = CRITICAL_SIGNALS.some((s) => normalizedText.includes(s));
  if (hasCritical) return 'Critical';

  // Informational / "how do I" phrasing signals a low-stakes request even if
  // it happens to also match a category's keywords strongly (e.g. "change my
  // billing address" scores high on Billing Dispute but is not urgent).
  const hasLow = LOW_SIGNALS.some((s) => normalizedText.includes(s));
  if (hasLow) return 'Low';

  const hasHigh = HIGH_SIGNALS.some((s) => normalizedText.includes(s));
  if (hasHigh) return 'High';

  // Fall back on category confidence signal strength
  if (topScore >= 4) return 'High';
  if (topScore >= 2) return 'Medium';
  return 'Low';
}

function extractKeywords(hits, normalizedText) {
  // De-duplicate multi-word phrase hits into a flat keyword list, capped at 6.
  const uniqueWords = new Set();
  for (const phrase of hits) {
    phrase.split(' ').forEach((w) => {
      if (w.length > 2) uniqueWords.add(w);
    });
  }
  return Array.from(uniqueWords).slice(0, 6);
}

/**
 * Classifies a complaint description.
 * @param {string} text - raw complaint description (free text)
 * @returns {{category:string, utility:string, confidence:number, priority:string,
 *            keywords:string[], requiresManualReview:boolean}}
 */
function classifyComplaint(text) {
  try {
    const normalized = normalize(text);
    if (!normalized) {
      return {
        category: 'General',
        utility: 'General',
        confidence: 0,
        priority: 'Low',
        keywords: [],
        requiresManualReview: true
      };
    }

    const ranked = scoreCategories(normalized);
    const top = ranked[0];
    const second = ranked[1];

    // Confidence: relative dominance of top category vs. runner-up, scaled 0..1.
    let confidence;
    if (top.score === 0) {
      confidence = 0.2; // no strong signal at all -> low confidence General
    } else {
      const margin = top.score - (second ? second.score : 0);
      confidence = Math.min(0.99, 0.55 + margin * 0.08 + Math.min(top.score, 6) * 0.03);
      confidence = Math.max(0.3, confidence);
    }
    confidence = Math.round(confidence * 100) / 100;

    const category = top.score === 0 ? 'General' : top.category;
    const utility = top.score === 0 ? 'General' : top.utility;
    const priority = detectPriority(normalized, top.score);
    const keywords = extractKeywords(top.hits, normalized);
    const requiresManualReview = confidence < 0.5;

    return { category, utility, confidence, priority, keywords, requiresManualReview };
  } catch (err) {
    // Graceful degradation per spec: never lose the complaint if AI fails.
    return {
      category: 'General',
      utility: 'General',
      confidence: 0,
      priority: 'Medium',
      keywords: [],
      requiresManualReview: true,
      error: 'AI_CLASSIFICATION_FAILED'
    };
  }
}

module.exports = { classifyComplaint };

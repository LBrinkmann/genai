/**
 * Mock API implementations for frontend development without a backend.
 * Activate with: REACT_APP_MOCK_API=true npm start
 */

const MOCK_CONFIG = {
  bots: [
    { name: 'bot-alpha', display_name: 'Alpha' },
  ],
  additional_categories: [
    'Helpful',
    'Accurate',
    'Creative',
    'Concise',
  ],
  main_preference_feedback: 'Which response do you prefer?',
  defaults: { log: false },
};

const RESPONSE_POOLS = {
  'bot-alpha': [
    "That's a fascinating question! From my perspective, I think there are several angles worth considering here.",
    "I appreciate you bringing that up. Let me share some thoughts that might be helpful.",
    "Great point! I'd approach this by breaking it down into smaller pieces first.",
    "Interesting! Here's what I find most compelling about this topic...",
    "That reminds me of an important concept. Let me walk you through my thinking.",
    "I love discussing this kind of thing. Here's my take on it.",
    "Good question! There are a few key factors to consider when thinking about this.",
    "Let me think about that for a moment... I believe the most important aspect is the underlying reasoning.",
    "That's something I find really engaging. Here's how I'd frame the discussion.",
    "Absolutely, I can help with that. Let me lay out a structured response for you.",
  ],
  'bot-beta': [
    "Hmm, that's thought-provoking. I'd say the answer depends on context, but here's a solid starting point.",
    "Nice question! I tend to think about this differently -- let me explain my reasoning.",
    "I see where you're coming from. Here's an alternative perspective that might be useful.",
    "That's a great topic. In my experience, the key insight is often simpler than it seems.",
    "Let me offer a slightly different angle on this. I think the nuance matters here.",
    "Interesting thought! I'd argue there's more to it than meets the eye.",
    "Sure thing! Here's a concise take: the fundamentals really matter in cases like this.",
    "I find this question fascinating. My approach would be to start from first principles.",
    "That's worth exploring in depth. Let me share what I consider the most relevant points.",
    "Good one! I think the best way to address this is with a concrete example.",
  ],
  _default: [
    "That's an interesting point! Let me think about that...",
    "I appreciate you sharing that. Here's my perspective...",
    "Great question! Based on what I know, here's what I'd suggest.",
    "Let me consider that carefully. I think the key factor is...",
    "That's a really good observation. Here are my thoughts on it.",
    "Interesting! I'd approach this from a slightly different angle.",
    "Sure, I can help with that. Here's what comes to mind.",
    "Good question! There are several ways to think about this.",
  ],
};

function pickResponse(botName, messages) {
  const pool =
    RESPONSE_POOLS[botName] || RESPONSE_POOLS._default;
  const lastMsg = messages[messages.length - 1]?.content || '';
  // Use message length + char codes for pseudo-random but
  // deterministic-per-input selection
  const seed =
    lastMsg.length +
    [...lastMsg].reduce((s, c) => s + c.charCodeAt(0), 0);
  return pool[seed % pool.length];
}

function randomDelay(min = 300, max = 1200) {
  const ms =
    Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchConfig(_configName) {
  return MOCK_CONFIG;
}

export async function sendChat(botName, messages) {
  await randomDelay();
  return { content: pickResponse(botName, messages) };
}

export async function createSession(
  _userId,
  _feedbackConfigName
) {
  return { session_id: crypto.randomUUID() };
}

export async function saveMessage(_messageData) {
  return { status: 'ok' };
}

export async function validateKey(_key) {
  return { valid: true };
}

/**
 * Mock health check returning all configured bots as online.
 */
export async function checkBotHealth(_configName) {
  return {
    bots: MOCK_CONFIG.bots.map((b) => ({
      name: b.display_name || b.name,
      status: 'online',
    })),
  };
}

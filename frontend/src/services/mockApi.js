/**
 * Mock API implementations for frontend development without a backend.
 * Activate with: REACT_APP_MOCK_API=true npm start
 */

const MOCK_CONFIG = {
  bots: [
    { name: 'bot-alpha', display_name: 'Alpha' },
    { name: 'bot-beta', display_name: 'Beta' },
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

export async function fetchConfig(configName) {
  // Model the backend per-config bot lists so the two-step config
  // load (default → follow defaults.config) is exercisable offline:
  //   "default"    → single bot (v1-equivalent)
  //   "comparison" → both bots, side by side
  // then narrow by the admin `active_bots` override, and report the
  // active config via `defaults.config` (pinned by the admin's
  // "which bots answer" toggle through active_feedback_config).
  const name =
    configName === 'comparison' ? 'comparison' : 'default';
  const declared =
    name === 'comparison'
      ? MOCK_CONFIG.bots
      : MOCK_CONFIG.bots.slice(0, 1);
  const requested = _mockOverrides.active_bots;
  const narrowed =
    Array.isArray(requested) && requested.length
      ? declared.filter((b) => requested.includes(b.name))
      : declared;
  return {
    ...MOCK_CONFIG,
    name,
    // Never strand the chat with zero bots (matches the backend rule).
    bots: narrowed.length ? narrowed : declared,
    test_mode: _mockOverrides.test_mode === true,
    defaults: {
      ...MOCK_CONFIG.defaults,
      config:
        _mockOverrides.active_feedback_config ||
        _AVAILABLE_FEEDBACK_CONFIGS[0],
    },
  };
}

export async function sendChat(botName, messages) {
  await randomDelay();
  return { content: pickResponse(botName, messages) };
}

/**
 * Mock streaming chat: yields the picked response one whitespace-
 * delimited token at a time with a short setTimeout between chunks.
 * Matches the real `streamChat` interface so swap is transparent.
 */
export function streamChat(
  botName,
  messages,
  { onChunk, onDone, onError, signal } = {}
) {
  if (signal?.aborted) return;
  const full = pickResponse(botName, messages);
  // Preserve whitespace so the rendered text matches `sendChat`.
  const tokens = full.match(/\S+\s*/g) || [full];
  let i = 0;
  let accumulated = '';
  let timer = null;

  const cleanup = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    signal?.removeEventListener('abort', onAbort);
  };

  const onAbort = () => {
    cleanup();
  };
  signal?.addEventListener('abort', onAbort);

  const tick = () => {
    if (signal?.aborted) return;
    if (i >= tokens.length) {
      cleanup();
      onDone?.(accumulated);
      return;
    }
    const delta = tokens[i++];
    accumulated += delta;
    try {
      onChunk?.(delta, accumulated);
    } catch (err) {
      cleanup();
      onError?.(err?.message || 'Mock stream error');
      return;
    }
    // 40–90 ms per token gives a believable streaming cadence
    // without slowing down dev too much.
    const wait = 40 + Math.floor(Math.random() * 50);
    timer = setTimeout(tick, wait);
  };

  // Small initial delay so the optimistic UI has time to mount.
  timer = setTimeout(tick, 120);
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

// -------- Admin / auth mocks --------

// Mock session state, scoped to this module. Refreshes on every
// import in dev mode (CRA HMR may reset it; that's fine for testing).
let _mockAuthed = false;
let _mockUser = null;

// Per-bot endpoint state. The state machine cycles:
//   paused → initializing → running    (on resume)
//   running → updating    → paused     (on pause)
// `nextState` is what an in-flight request transitions through; the
// final resting state is `pendingFinal`. We use a short timer to
// resolve the transient state so that consecutive polls see motion.
const _endpoints = {
  'genocide-ai': {
    bot_name: 'genocide-ai',
    provider: 'hf',
    namespace: 'NoraAl',
    name: 'genocideai-01-ywg',
    state: 'paused',
    message: null,
    url: 'https://twt8ziu7jvtabi5l.us-east-1.aws.endpoints.huggingface.cloud',
    model: 'NoraAl/GENocideAI-01',
    instance: 'nvidia-l40s',
  },
};

// Track pending transient transitions so a follow-up poll/click
// promotes the endpoint to its final state.
const _transitions = {};

function _settleTransition(botName) {
  const t = _transitions[botName];
  if (!t) return;
  if (Date.now() >= t.settleAt) {
    _endpoints[botName].state = t.finalState;
    delete _transitions[botName];
  }
}

export async function getMe() {
  await randomDelay(50, 150);
  if (_mockAuthed) {
    return { authenticated: true, user: _mockUser };
  }
  return { authenticated: false };
}

export async function login(username, password) {
  await randomDelay(150, 250);
  // Test hook: password "wrong" simulates a 401 so the tester can
  // smoke-test the error path.
  if (password === 'wrong') {
    const err = new Error('Invalid credentials');
    err.response = {
      status: 401,
      data: { detail: 'Invalid credentials' },
    };
    throw err;
  }
  _mockAuthed = true;
  _mockUser = username || 'admin';
  return { ok: true, user: _mockUser };
}

export async function logout() {
  await randomDelay(50, 150);
  _mockAuthed = false;
  _mockUser = null;
  return { ok: true };
}

// Global endpoint mode (auto|on|off), mirroring the backend.
let _mockMode = 'auto';

function _normState(s) {
  return String(s || 'unknown')
    .toLowerCase()
    .replace(/[-_]/g, '');
}

// Collapse mock endpoint states into the chat-gate verdict, matching
// backend endpoint_control.aggregate_state.
function _aggregateMock() {
  for (const name of Object.keys(_endpoints)) {
    _settleTransition(name);
  }
  if (_mockMode === 'off') {
    return { ready: false, state: 'disabled', mode: 'off' };
  }
  const states = Object.values(_endpoints).map((e) => _normState(e.state));
  if (_mockMode === 'on' || states.length === 0) {
    return { ready: true, state: 'ready', mode: _mockMode };
  }
  const asleep = new Set(['scaledtozero', 'paused', 'failed']);
  const waking = new Set(['initializing', 'pending', 'updating']);
  let verdict;
  if (states.every((s) => s === 'running')) {
    verdict = { ready: true, state: 'ready' };
  } else if (states.some((s) => asleep.has(s))) {
    verdict = { ready: false, state: 'asleep' };
  } else if (states.some((s) => waking.has(s))) {
    verdict = { ready: false, state: 'waking' };
  } else {
    verdict = { ready: false, state: 'unavailable' };
  }
  return { ...verdict, mode: _mockMode };
}

export async function listLLMEndpoints() {
  await randomDelay(80, 200);
  // Promote any transient states whose settle window has passed.
  for (const name of Object.keys(_endpoints)) {
    _settleTransition(name);
  }
  return {
    endpoints: Object.values(_endpoints).map((e) => ({ ...e })),
    mode: _mockMode,
  };
}

export async function getEndpointState() {
  await randomDelay(50, 150);
  return _aggregateMock();
}

export async function activateEndpoints() {
  await randomDelay(120, 220);
  // Wake every endpoint that isn't already up.
  for (const [name, ep] of Object.entries(_endpoints)) {
    if (!['running', 'initializing'].includes(_normState(ep.state))) {
      ep.state = 'initializing';
      _transitions[name] = {
        finalState: 'running',
        settleAt: Date.now() + 4000,
      };
    }
  }
  return _aggregateMock();
}

export async function setEndpointMode(mode) {
  await randomDelay(80, 180);
  _mockMode = mode;
  if (mode === 'off') {
    for (const [name, ep] of Object.entries(_endpoints)) {
      ep.state = 'paused';
      delete _transitions[name];
    }
  } else if (mode === 'on') {
    for (const [name, ep] of Object.entries(_endpoints)) {
      if (_normState(ep.state) !== 'running') {
        ep.state = 'initializing';
        _transitions[name] = {
          finalState: 'running',
          settleAt: Date.now() + 4000,
        };
      }
    }
  }
  return {
    mode: _mockMode,
    endpoints: Object.values(_endpoints).map((e) => ({ ...e })),
  };
}

export async function resumeEndpoint(botName) {
  await randomDelay(120, 220);
  const ep = _endpoints[botName];
  if (!ep) {
    const err = new Error('Unknown bot');
    err.response = { status: 404, data: { detail: 'Unknown bot' } };
    throw err;
  }
  ep.state = 'initializing';
  _transitions[botName] = {
    finalState: 'running',
    settleAt: Date.now() + 4000,
  };
  return { ...ep };
}

export async function pauseEndpoint(botName) {
  await randomDelay(120, 220);
  const ep = _endpoints[botName];
  if (!ep) {
    const err = new Error('Unknown bot');
    err.response = { status: 404, data: { detail: 'Unknown bot' } };
    throw err;
  }
  ep.state = 'updating';
  _transitions[botName] = {
    finalState: 'paused',
    settleAt: Date.now() + 3000,
  };
  return { ...ep };
}

// -------- Admin config overrides (mock) --------

let _mockOverrides = {};
let _mockUpdatedAt = null;
let _mockUpdatedBy = null;

const _AVAILABLE_FEEDBACK_CONFIGS = ['default', 'comparison'];
const _AVAILABLE_BOTS = ['bot-alpha', 'bot-beta'];
const _BOT_DISPLAY_NAMES = {
  'bot-alpha': 'Alpha',
  'bot-beta': 'Beta',
};

function _mockMergedConfig() {
  // Synthesize a plausible merged-config snapshot.
  const overrideVisible =
    typeof _mockOverrides.visible_limit === 'number'
      ? _mockOverrides.visible_limit
      : 3;
  const overrideContextSet = 'context_limit' in _mockOverrides;
  const overrideContext = overrideContextSet
    ? _mockOverrides.context_limit
    : null;

  return {
    bots: _AVAILABLE_BOTS.map((name) => ({
      name,
      display_name: _BOT_DISPLAY_NAMES[name] || name,
      model: `gpt-mock-${name.replace('bot-', '')}`,
      api_url: 'https://mock.invalid',
      api_key: '',
      system_message:
        _mockOverrides?.bot_overrides?.[name]?.system_message ||
        `You are ${name}.`,
    })),
    feedback_configs: _AVAILABLE_FEEDBACK_CONFIGS.map((name) => {
      // Mirrors config/experiment.yml: "default" is single-bot,
      // "comparison" pairs two bots for the RLHF side-by-side.
      const declared =
        name === 'comparison'
          ? _AVAILABLE_BOTS
          : _AVAILABLE_BOTS.slice(0, 1);
      const requested = _mockOverrides.active_bots;
      const kept =
        Array.isArray(requested) && requested.length
          ? declared.filter((b) => requested.includes(b))
          : declared;
      return {
        name,
        // An empty intersection would leave the config with nobody to
        // answer, so keep the declared list in that case.
        bots: kept.length ? kept : declared,
        main_preference_feedback: '',
        additional_categories: [],
        visible_limit: overrideVisible,
        context_limit: overrideContext,
        test_mode: _mockOverrides.test_mode === true,
      };
    }),
    defaults: {
      config:
        _mockOverrides.active_feedback_config ||
        _AVAILABLE_FEEDBACK_CONFIGS[0],
      log: false,
    },
  };
}

// The untouched YAML baseline (no overrides applied) — mirrors the
// backend's `yaml_defaults`. "default" is single-bot, "comparison"
// pairs both, matching config/experiment.yml.
function _yamlDefaults() {
  return {
    bots: _AVAILABLE_BOTS.map((name) => ({
      name,
      display_name: _BOT_DISPLAY_NAMES[name] || name,
    })),
    feedback_configs: _AVAILABLE_FEEDBACK_CONFIGS.map((name) => ({
      name,
      bots:
        name === 'comparison'
          ? [..._AVAILABLE_BOTS]
          : _AVAILABLE_BOTS.slice(0, 1),
    })),
    defaults: { config: _AVAILABLE_FEEDBACK_CONFIGS[0], log: false },
  };
}

function _adminResponse() {
  return {
    merged: _mockMergedConfig(),
    overrides: { ..._mockOverrides },
    yaml_defaults: _yamlDefaults(),
    available_feedback_configs: [..._AVAILABLE_FEEDBACK_CONFIGS],
    available_bots: [..._AVAILABLE_BOTS],
    updated_by: _mockUpdatedBy,
    updated_at: _mockUpdatedAt,
  };
}

export async function getAdminConfig() {
  await randomDelay(50, 150);
  return _adminResponse();
}

export async function patchAdminConfig(patch) {
  await randomDelay(80, 180);
  // Sparse merge with explicit-null reset (mirrors backend).
  const next = { ..._mockOverrides };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (key === 'bot_overrides') {
      if (value === null) {
        delete next.bot_overrides;
        return;
      }
      const merged = { ...(next.bot_overrides || {}) };
      Object.entries(value || {}).forEach(([bot, sub]) => {
        if (sub === null) {
          delete merged[bot];
          return;
        }
        const cur = { ...(merged[bot] || {}) };
        Object.entries(sub).forEach(([k, v]) => {
          if (v === null) delete cur[k];
          else cur[k] = v;
        });
        if (Object.keys(cur).length) merged[bot] = cur;
        else delete merged[bot];
      });
      if (Object.keys(merged).length) next.bot_overrides = merged;
      else delete next.bot_overrides;
    } else if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  });
  _mockOverrides = next;
  _mockUpdatedAt = new Date().toISOString();
  _mockUpdatedBy = _mockUser || 'admin';
  return _adminResponse();
}

export async function deleteAdminConfig() {
  await randomDelay(50, 150);
  _mockOverrides = {};
  _mockUpdatedAt = new Date().toISOString();
  _mockUpdatedBy = _mockUser || 'admin';
  return _adminResponse();
}

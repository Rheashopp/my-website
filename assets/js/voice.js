(function (global) {
  'use strict';

  function initVoiceOverlay(anchor, externalConfig) {
    if (!anchor || anchor.dataset.voiceOverlayInitialized === 'true') {
      return;
    }

    anchor.dataset.voiceOverlayInitialized = 'true';

    const doc = anchor.ownerDocument || global.document;
    const voiceConfig = Object.assign({ provider: 'demo', ttsVoiceName: null }, externalConfig || {});
    const basePath = normalizeBasePath(global.SILENT_CONFIG?.site?.basePath);
    const resolveAsset = (target) => resolveSitePath(basePath, target);

    ensureVoiceStyles(doc, resolveAsset('assets/css/voice.css'));

    const overlay = buildOverlay(doc);
    anchor.appendChild(overlay.root);

    const orb = overlay.orb;
    const statusEls = Array.from(overlay.statusEls);
    const transcriptEl = overlay.transcriptEl;
    const logEl = overlay.logEl;
    const consentEl = overlay.consentEl;
    const consentBtn = overlay.consentBtn;
    const voiceFallback = overlay.fallback;

    let hasConsent = false;
    let recognition;
    let mediaStream;
    let finalTranscript = '';
    let currentState = 'idle';
    const viz = typeof global.WebAudioViz !== 'undefined' ? new global.WebAudioViz() : null;
    const supportsSTT = 'SpeechRecognition' in global || 'webkitSpeechRecognition' in global;
    let sessionId = getSessionId(global.localStorage, global.crypto);

    setState('idle');

    if (!supportsSTT && voiceFallback) {
      voiceFallback.container.hidden = false;
    }

    if (voiceFallback && voiceFallback.textarea) {
      voiceFallback.textarea.addEventListener('blur', () => {
        if (!voiceFallback.textarea.value.trim()) {
          voiceFallback.container.hidden = true;
        }
      });
    }

    if (voiceFallback && voiceFallback.form) {
      voiceFallback.form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = voiceFallback.textarea.value.trim();
        if (!value) return;
        appendLog('user', value);
        voiceFallback.textarea.value = '';
        setState('thinking');
        if (transcriptEl) {
          transcriptEl.textContent = value;
        }
        handleResponse(value);
      });
    }

    if (consentBtn) {
      consentBtn.addEventListener('click', () => {
        hasConsent = true;
        if (consentEl) {
          consentEl.hidden = true;
        }
        orb.focus();
      });
    }

    orb.addEventListener('click', () => {
      if (!hasConsent && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia) {
        if (consentEl) {
          consentEl.hidden = false;
          consentBtn?.focus();
        } else {
          hasConsent = true;
        }
        return;
      }

      if (currentState === 'idle') {
        beginListening();
      } else {
        cancelInteraction();
      }
    });

    orb.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        orb.click();
      }
    });

    global.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && currentState !== 'idle') {
        cancelInteraction();
      }
    });

    function beginListening() {
      if (!global.navigator.mediaDevices || !global.navigator.mediaDevices.getUserMedia) {
        if (voiceFallback) {
          voiceFallback.notice.textContent = 'Microphone access is unavailable here. Type your request instead.';
          voiceFallback.container.hidden = false;
        }
        return;
      }

      global.navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          mediaStream = stream;
          if (viz && typeof viz.setup === 'function') {
            viz.setup(stream, (level) => {
              orb.style.setProperty('--vu-level', level.toFixed(2));
              const vu = orb.querySelector('.orb-vu');
              if (vu) {
                vu.style.setProperty('--vu-level', level.toFixed(2));
              }
            });
          }
          startRecognition();
        })
        .catch((error) => {
          console.error('Microphone error', error);
          if (voiceFallback) {
            voiceFallback.notice.textContent = 'We could not access the microphone. Type your request instead.';
            voiceFallback.container.hidden = false;
          }
        });
    }

    function startRecognition() {
      if (!supportsSTT) {
        if (voiceFallback) {
          voiceFallback.notice.textContent = 'Speech recognition is not supported on this browser. Use the text prompt below.';
          voiceFallback.container.hidden = false;
        }
        setState('idle');
        return;
      }

      const SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        finalTranscript = '';
        setState('listening');
        if (transcriptEl) {
          transcriptEl.textContent = 'Listening…';
        }
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        if (transcriptEl) {
          transcriptEl.textContent = finalTranscript || interimTranscript || 'Listening…';
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        cancelInteraction();
        if (voiceFallback) {
          voiceFallback.notice.textContent = 'We could not capture audio. Try again or type your prompt.';
          voiceFallback.container.hidden = false;
        }
      };

      recognition.onend = () => {
        if (currentState === 'listening') {
          finalizeTranscript();
        }
      };

      recognition.start();
    }

    function finalizeTranscript() {
      const text = finalTranscript.trim();
      if (!text) {
        setState('idle');
        if (transcriptEl) {
          transcriptEl.textContent = 'Ready.';
        }
        releaseAudio();
        return;
      }
      appendLog('user', text);
      setState('thinking');
      if (transcriptEl) {
        transcriptEl.textContent = text;
      }
      handleResponse(text);
    }

    function handleResponse(promptText) {
      const adapter = createLLMAdapter();
      adapter
        .respond(promptText)
        .then((reply) => {
          if (!reply) {
            throw new Error('Empty response');
          }
          appendLog('assistant', reply);
          speak(reply).then(() => {
            setState('idle');
            if (transcriptEl) {
              transcriptEl.textContent = 'Ready.';
            }
          });
        })
        .catch((error) => {
          console.error('Voice response error', error);
          setState('idle');
          if (transcriptEl) {
            transcriptEl.textContent = 'We could not produce a reply. Try again.';
          }
        })
        .finally(() => {
          releaseAudio();
        });
    }

    function speak(text) {
      return new Promise((resolve) => {
        if (!('speechSynthesis' in global)) {
          resolve();
          return;
        }
        setState('speaking');
        const utterance = new global.SpeechSynthesisUtterance(text);
        if (voiceConfig.ttsVoiceName) {
          const voice = global.speechSynthesis.getVoices().find((v) => v.name === voiceConfig.ttsVoiceName);
          if (voice) {
            utterance.voice = voice;
          }
        }
        utterance.onend = () => {
          resolve();
        };
        utterance.onerror = () => {
          resolve();
        };
        global.speechSynthesis.cancel();
        global.speechSynthesis.speak(utterance);
      });
    }

    function createLLMAdapter() {
      const provider = (voiceConfig && voiceConfig.provider) || 'demo';
      if (provider === 'openai' || provider === 'gemini') {
        return {
          respond: (text) => {
            setState('thinking');
            return fetch(resolveAsset('api/llm'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({ messages: [{ role: 'user', content: text }], sessionId }),
            })
              .then((response) => {
                if (!response.ok) {
                  throw new Error('LLM request failed');
                }
                return response.json();
              })
              .then((data) => data.text);
          },
        };
      }
      return {
        respond: (text) =>
          new Promise((resolve) => {
            setState('thinking');
            const templates = [
              'Silent processed your request and recommends a focused plan: {plan}.',
              'I traced the relevant signals and here is the distilled insight: {plan}.',
              'Let me summarize the actionable path forward: {plan}.',
            ];
            const plans = [
              'synthesize the research corpus, highlight deltas, and prepare validation prompts',
              'stage refactors with test scaffolds, then deliver human-readable diffs',
              'generate risk annotations, enforce guardrails, and produce oversight snapshots',
            ];
            const plan = plans[Math.floor(Math.random() * plans.length)];
            const template = templates[Math.floor(Math.random() * templates.length)];
            const reply = template.replace('{plan}', plan);
            global.setTimeout(() => resolve(reply), 900 + Math.random() * 600);
          }),
      };
    }

    function setState(nextState) {
      currentState = nextState;
      orb.classList.toggle('is-listening', nextState === 'listening');
      orb.classList.toggle('is-thinking', nextState === 'thinking');
      orb.classList.toggle('is-speaking', nextState === 'speaking');
      orb.classList.toggle('orb--idle', nextState === 'idle');
      orb.setAttribute('aria-pressed', nextState !== 'idle' ? 'true' : 'false');
      statusEls.forEach((el) => {
        const state = el.getAttribute('data-state');
        if (state === nextState) {
          el.hidden = false;
        } else {
          el.hidden = true;
        }
      });
    }

    function appendLog(role, text) {
      if (!logEl) return;
      logEl.hidden = false;
      const entry = doc.createElement('p');
      entry.textContent = `${role === 'user' ? 'You' : 'Silent'}: ${text}`;
      logEl.prepend(entry);
      while (logEl.children.length > 5) {
        logEl.removeChild(logEl.lastChild);
      }
    }

    function cancelInteraction() {
      if (recognition) {
        recognition.onresult = null;
        recognition.onend = null;
        try {
          recognition.stop();
        } catch (error) {
          console.warn('Recognition stop error', error);
        }
        recognition = null;
      }
      if ('speechSynthesis' in global) {
        global.speechSynthesis.cancel();
      }
      releaseAudio();
      if (transcriptEl) {
        transcriptEl.textContent = 'Ready.';
      }
      setState('idle');
    }

    function releaseAudio() {
      if (viz && typeof viz.cleanup === 'function') {
        viz.cleanup();
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
    }
  }

  function buildOverlay(doc) {
    const root = doc.createElement('div');
    root.className = 'voice-overlay';
    root.setAttribute('role', 'presentation');

    const orbButton = doc.createElement('button');
    orbButton.type = 'button';
    orbButton.id = 'voice-orb';
    orbButton.className = 'voice-orb orb--idle';
    orbButton.setAttribute('aria-pressed', 'false');
    orbButton.setAttribute('aria-label', 'Press to talk with Silent');

    const srText = doc.createElement('span');
    srText.className = 'sr-only';
    srText.textContent = 'Press to talk with Silent';
    orbButton.appendChild(srText);

    const core = doc.createElement('span');
    core.className = 'orb-core';
    orbButton.appendChild(core);

    const halo = doc.createElement('span');
    halo.className = 'orb-halo';
    orbButton.appendChild(halo);

    const vu = doc.createElement('span');
    vu.className = 'orb-vu';
    orbButton.appendChild(vu);

    root.appendChild(orbButton);

    const status = doc.createElement('div');
    status.className = 'voice-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const stateLabels = {
      idle: 'Ready.',
      listening: 'Listening…',
      thinking: 'Thinking…',
      speaking: 'Answering…',
    };
    Object.keys(stateLabels).forEach((state) => {
      const span = doc.createElement('span');
      span.setAttribute('data-state', state);
      span.textContent = stateLabels[state];
      if (state !== 'idle') {
        span.hidden = true;
      }
      status.appendChild(span);
    });
    root.appendChild(status);

    const transcript = doc.createElement('div');
    transcript.className = 'voice-transcript';
    transcript.setAttribute('aria-live', 'polite');
    transcript.setAttribute('aria-atomic', 'true');
    root.appendChild(transcript);

    const log = doc.createElement('div');
    log.className = 'voice-log';
    log.hidden = true;
    root.appendChild(log);

    const consent = doc.createElement('div');
    consent.className = 'voice-consent';
    consent.hidden = true;
    const consentText = doc.createElement('p');
    consentText.textContent = 'We’ll use your microphone only while the orb is on. Nothing is sent until you speak.';
    consent.appendChild(consentText);
    const consentBtn = doc.createElement('button');
    consentBtn.className = 'voice-btn voice-btn--primary';
    consentBtn.id = 'voice-consent-accept';
    consentBtn.type = 'button';
    consentBtn.textContent = 'OK';
    consent.appendChild(consentBtn);
    root.appendChild(consent);

    const fallback = doc.createElement('div');
    fallback.className = 'voice-text-fallback';
    fallback.hidden = true;
    const fallbackNotice = doc.createElement('p');
    fallbackNotice.className = 'voice-text-notice';
    fallbackNotice.id = 'voice-text-notice';
    fallbackNotice.setAttribute('role', 'status');
    fallbackNotice.textContent = 'Public demo coming soon — request access for the full voice interface.';
    fallback.appendChild(fallbackNotice);
    const fallbackForm = doc.createElement('form');
    const label = doc.createElement('label');
    label.setAttribute('for', 'voice-textarea');
    label.textContent = 'Type to ask Silent';
    fallbackForm.appendChild(label);
    const textarea = doc.createElement('textarea');
    textarea.id = 'voice-textarea';
    textarea.name = 'voice-textarea';
    textarea.rows = 4;
    textarea.setAttribute('placeholder', 'Describe what you need');
    textarea.setAttribute('aria-describedby', 'voice-text-notice');
    fallbackForm.appendChild(textarea);
    const submit = doc.createElement('button');
    submit.type = 'submit';
    submit.className = 'voice-btn voice-btn--secondary';
    submit.textContent = 'Send prompt';
    fallbackForm.appendChild(submit);
    fallback.appendChild(fallbackForm);
    root.appendChild(fallback);

    return {
      root,
      orb: orbButton,
      statusEls: status.querySelectorAll('[data-state]'),
      transcriptEl: transcript,
      logEl: log,
      consentEl: consent,
      consentBtn,
      fallback: { container: fallback, form: fallbackForm, textarea, notice: fallbackNotice },
    };
  }

  function ensureVoiceStyles(doc, href) {
    if (!href || !doc.head) return;
    const absoluteHref = new URL(href, doc.baseURI).href;
    const existing = Array.from(doc.head.querySelectorAll('link[rel="stylesheet"]'));
    if (existing.some((link) => link.href === absoluteHref)) {
      return;
    }
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-voice-overlay', 'true');
    doc.head.appendChild(link);
  }

  function normalizeBasePath(value) {
    if (typeof value !== 'string' || value.length === 0) {
      return '.';
    }
    const sanitized = value.replace(/\/+$/, '');
    return sanitized.length ? sanitized : '.';
  }

  function resolveSitePath(basePath, target) {
    if (!target) return target;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith('//')) {
      return target;
    }
    const cleanTarget = target.replace(/^\/+/, '');
    if (basePath === '.' || basePath === '') {
      return cleanTarget.startsWith('./') || cleanTarget.startsWith('../') ? cleanTarget : `./${cleanTarget}`;
    }
    return `${basePath}/${cleanTarget}`.replace(/\/{2,}/g, '/');
  }

  function getSessionId(storage, crypto) {
    if (!storage) return null;
    const existing = storage.getItem('silent-session-id');
    if (existing) {
      return existing;
    }
    if (crypto && typeof crypto.randomUUID === 'function') {
      const id = crypto.randomUUID();
      storage.setItem('silent-session-id', id);
      return id;
    }
    const fallback = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    storage.setItem('silent-session-id', fallback);
    return fallback;
  }

  global.initVoiceOverlay = initVoiceOverlay;
})(window);

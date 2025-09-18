(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const orb = document.getElementById('voice-orb');
    if (!orb) return;

    const statusEls = document.querySelectorAll('.voice-status [data-state]');
    const transcriptEl = document.querySelector('.voice-transcript');
    const logEl = document.querySelector('.voice-log');
    const consentEl = document.querySelector('.voice-consent');
    const consentBtn = document.getElementById('voice-consent-accept');

    let hasConsent = false;
    let recognition;
    let mediaStream;
    let finalTranscript = '';
    let currentState = 'idle';
    const viz = typeof WebAudioViz !== 'undefined' ? new WebAudioViz() : null;
    const supportsSTT = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    const voiceFallback = createFallback();
    let sessionId = window.localStorage.getItem('silent-session-id');
    if (!sessionId && window.crypto && window.crypto.randomUUID) {
      sessionId = crypto.randomUUID();
      window.localStorage.setItem('silent-session-id', sessionId);
    }

    const voiceConfig = window.SILENT_CONFIG && window.SILENT_CONFIG.voice ? window.SILENT_CONFIG.voice : { provider: 'demo' };
    const basePath = normalizeBasePath(window.SILENT_CONFIG?.site?.basePath);

    setState('idle');

    if (!supportsSTT && voiceFallback) {
      voiceFallback.container.hidden = false;
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
      if (!hasConsent && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        if (consentEl) {
          consentEl.hidden = false;
          consentEl.querySelector('button')?.focus();
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

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && currentState !== 'idle') {
        cancelInteraction();
      }
    });

    if (voiceFallback) {
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

    function beginListening() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (voiceFallback) {
          voiceFallback.notice.textContent = 'Microphone access is unavailable here. Type your request instead.';
          voiceFallback.container.hidden = false;
        }
        return;
      }
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          mediaStream = stream;
          if (viz) {
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
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
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
        if (!('speechSynthesis' in window)) {
          resolve();
          return;
        }
        setState('speaking');
        const utterance = new SpeechSynthesisUtterance(text);
        if (voiceConfig.ttsVoiceName) {
          const voice = window.speechSynthesis.getVoices().find((v) => v.name === voiceConfig.ttsVoiceName);
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
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
    }

    function createLLMAdapter() {
      const provider = (voiceConfig && voiceConfig.provider) || 'demo';
      if (provider === 'openai' || provider === 'gemini') {
        return {
          respond: (text) => {
            setState('thinking');
            return fetch(resolveSitePath('api/llm'), {
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
            setTimeout(() => resolve(reply), 900 + Math.random() * 600);
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
      const entry = document.createElement('p');
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
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      releaseAudio();
      if (transcriptEl) {
        transcriptEl.textContent = 'Ready.';
      }
      setState('idle');
    }

    function releaseAudio() {
      if (viz) {
        viz.cleanup();
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
    }

    function normalizeBasePath(value) {
      if (typeof value !== 'string' || value.length === 0) {
        return '.';
      }
      const sanitized = value.replace(/\/+$/, '');
      return sanitized.length ? sanitized : '.';
    }

    function resolveSitePath(target) {
      if (!target) return target;
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith('//')) {
        return target;
      }
      const cleanTarget = target.replace(/^\/+/, '');
      if (basePath === '.' || basePath === '') {
        return cleanTarget.startsWith('./') || cleanTarget.startsWith('../')
          ? cleanTarget
          : `./${cleanTarget}`;
      }
      return `${basePath}/${cleanTarget}`.replace(/\/{2,}/g, '/');
    }

    function createFallback() {
      const wrapper = document.createElement('div');
      wrapper.className = 'voice-text-fallback';
      wrapper.hidden = true;
      wrapper.innerHTML = `
        <p class="notice" role="status">Public demo coming soon — request access for the full voice interface.</p>
        <form>
          <label for="voice-textarea">Type to ask Silent</label>
          <textarea id="voice-textarea" name="voice-textarea" rows="4" placeholder="Describe what you need" aria-describedby="voice-text-notice"></textarea>
          <button class="btn btn-secondary" type="submit">Send prompt</button>
        </form>
      `;
      const notice = wrapper.querySelector('.notice');
      notice.id = 'voice-text-notice';
      const form = wrapper.querySelector('form');
      const textarea = wrapper.querySelector('textarea');
      orb.insertAdjacentElement('afterend', wrapper);
      return { container: wrapper, form, textarea, notice };
    }
  });
})();

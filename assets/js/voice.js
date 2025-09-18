(function () {
  'use strict';

  var SESSION_KEY = 'silent-session-id';
  var DEFAULTS = {
    provider: 'demo',
    ttsVoiceName: null,
    enabled: false,
  };

  var overlayCount = 0;

  function createSessionId() {
    try {
      var existing = window.localStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      var generated = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now());
      window.localStorage.setItem(SESSION_KEY, generated);
      return generated;
    } catch (error) {
      return String(Date.now());
    }
  }

  function normalizeBasePath(value) {
    if (typeof value !== 'string' || value.length === 0) {
      return '.';
    }
    var sanitized = value.replace(/\/+$/, '');
    return sanitized.length ? sanitized : '.';
  }

  function resolvePath(basePath, target) {
    if (!target) return target;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith('//')) {
      return target;
    }
    var clean = target.replace(/^\/+/, '');
    if (basePath === '.' || basePath === '') {
      return clean.startsWith('./') || clean.startsWith('../') ? clean : './' + clean;
    }
    return (basePath + '/' + clean).replace(/\/{2,}/g, '/');
  }

  function buildOverlay(id, stateText) {
    var container = document.createElement('section');
    container.className = 'voice-overlay';
    container.setAttribute('data-state', 'idle');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Silent voice assistant');
    container.dataset.stateText = stateText;

    var header = document.createElement('div');
    header.className = 'voice-overlay__header';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'voice-overlay__button';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-describedby', id + '-status-text');
    button.setAttribute('aria-label', 'Press to talk to Silent');

    button.innerHTML = [
      '<span class="voice-overlay__orb" aria-hidden="true">',
      '  <span class="voice-overlay__ring voice-overlay__ring--inner"></span>',
      '  <span class="voice-overlay__ring voice-overlay__ring--middle"></span>',
      '  <span class="voice-overlay__ring voice-overlay__ring--outer"></span>',
      '  <span class="voice-overlay__vu"></span>',
      '</span>',
      '<span class="voice-overlay__sr">Toggle listening</span>'
    ].join('');

    var status = document.createElement('p');
    status.className = 'voice-overlay__status';
    status.id = id + '-status-text';
    status.setAttribute('aria-live', 'polite');
    status.innerHTML = '<strong>Status</strong><span>Ready.</span>';

    header.appendChild(button);
    header.appendChild(status);

    var transcript = document.createElement('div');
    transcript.className = 'voice-overlay__transcript';
    transcript.setAttribute('role', 'status');
    transcript.setAttribute('aria-live', 'polite');
    transcript.textContent = 'Press to talk.';

    var log = document.createElement('ul');
    log.className = 'voice-overlay__log';
    log.id = id + '-log';
    log.hidden = true;

    var note = document.createElement('p');
    note.className = 'voice-overlay__note';
    note.textContent = stateText || 'Hold to speak, or use the fallback if voice capture is unavailable.';

    var fallback = document.createElement('div');
    fallback.className = 'voice-overlay__fallback';
    fallback.hidden = true;
    fallback.innerHTML = [
      '<label for="' + id + '-fallback">Speech recognition is unavailable here. Type your request.</label>',
      '<textarea id="' + id + '-fallback" rows="4" placeholder="Describe what Silent should do"></textarea>',
      '<button type="button">Send request</button>'
    ].join('');

    container.appendChild(header);
    container.appendChild(transcript);
    container.appendChild(log);
    container.appendChild(note);
    container.appendChild(fallback);

    return {
      container: container,
      button: button,
      status: status,
      transcript: transcript,
      log: log,
      note: note,
      fallback: fallback,
    };
  }

  function createLLMAdapter(config, basePath, sessionId) {
    var provider = (config && config.provider) || 'demo';
    if (provider === 'openai' || provider === 'gemini') {
      return {
        respond: function (text) {
          return fetch(resolvePath(basePath, 'api/llm'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ messages: [{ role: 'user', content: text }], sessionId: sessionId }),
          })
            .then(function (response) {
              if (!response.ok) {
                throw new Error('LLM request failed');
              }
              return response.json();
            })
            .then(function (payload) {
              return payload && payload.text ? payload.text : '';
            });
        },
      };
    }

    return {
      respond: function (text) {
        var templates = [
          'Silent has reviewed the signal and proposes the following plan: {plan}.',
          'Here is the distilled course of action based on your request: {plan}.',
          'Recommended next step sequence: {plan}.',
        ];
        var plans = [
          'synthesize sources, highlight deltas, and prepare a decision brief',
          'stage repo-aware changes, validate with tests, and generate reviewer notes',
          'run policy checks, flag risk, and assemble an oversight packet',
        ];
        var reply = templates[Math.floor(Math.random() * templates.length)].replace('{plan}', plans[Math.floor(Math.random() * plans.length)]);
        return Promise.resolve(reply);
      },
    };
  }

  function speak(text, config) {
    return new Promise(function (resolve) {
      if (!('speechSynthesis' in window) || !text) {
        resolve();
        return;
      }
      var utterance = new window.SpeechSynthesisUtterance(text);
      if (config && config.ttsVoiceName) {
        var voice = window.speechSynthesis.getVoices().find(function (item) {
          return item.name === config.ttsVoiceName;
        });
        if (voice) utterance.voice = voice;
      }
      utterance.onend = resolve;
      utterance.onerror = resolve;
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        resolve();
      }
    });
  }

  function updateStatus(statusEl, label) {
    var span = statusEl.querySelector('span');
    if (span) span.textContent = label;
  }

  function updateVU(container, level) {
    var vu = container.querySelector('.voice-overlay__vu');
    if (vu) {
      var clamped = Math.max(0, Math.min(1, level || 0));
      vu.style.transform = 'scale(' + (1 + clamped * 0.45).toFixed(3) + ')';
    }
  }

  function appendLog(logEl, role, text) {
    if (!logEl) return;
    logEl.hidden = false;
    var entry = document.createElement('li');
    var label = document.createElement('strong');
    label.textContent = role === 'user' ? 'You' : 'Silent';
    var content = document.createElement('span');
    content.textContent = text;
    entry.appendChild(label);
    entry.appendChild(content);
    logEl.insertBefore(entry, logEl.firstChild);
    while (logEl.children.length > 4) {
      logEl.removeChild(logEl.lastChild);
    }
  }

  function createFallbackController(elements, onSubmit) {
    var textarea = elements.fallback.querySelector('textarea');
    var button = elements.fallback.querySelector('button');
    if (!textarea || !button) return;
    button.addEventListener('click', function () {
      var value = textarea.value.trim();
      if (!value) return;
      textarea.value = '';
      onSubmit(value);
    });
  }

  window.initVoiceOverlay = function initVoiceOverlay(anchorEl, config) {
    if (!anchorEl || anchorEl.dataset.voiceOverlay === 'true') {
      return null;
    }

    overlayCount += 1;
    var overlayId = 'voice-overlay-' + overlayCount;
    var basePath = normalizeBasePath(window.SILENT_CONFIG && window.SILENT_CONFIG.site && window.SILENT_CONFIG.site.basePath);
    var settings = Object.assign({}, DEFAULTS, config || {});
    var sessionId = createSessionId();
    var elements = buildOverlay(overlayId, settings.note || 'Demo mode uses the browser microphone.');
    var container = elements.container;
    var button = elements.button;
    var transcript = elements.transcript;
    var status = elements.status;
    var log = elements.log;
    var fallback = elements.fallback;

    anchorEl.dataset.voiceOverlay = 'true';

    var anchorRect = anchorEl.getBoundingClientRect();
    var shouldFloat = anchorRect.width === 0 && anchorRect.height === 0;
    container.dataset.floating = shouldFloat ? 'true' : 'false';

    if (shouldFloat) {
      document.body.appendChild(container);
    } else {
      var parent = anchorEl.parentElement || document.body;
      parent.appendChild(container);
      container.style.position = 'absolute';
      container.style.left = 'calc(50% - 140px)';
      container.style.top = 'calc(100% + 1.25rem)';
    }

    var state = 'idle';
    var recognition = null;
    var mediaStream = null;
    var isListening = false;
    var supportsSTT = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    var viz = typeof window.WebAudioViz === 'function' ? new window.WebAudioViz() : null;

    if (!supportsSTT) {
      fallback.hidden = false;
      elements.note.textContent = 'Speech recognition is not supported here — use the text input below.';
    }

    function setState(next) {
      state = next;
      container.setAttribute('data-state', next);
      button.setAttribute('aria-pressed', next !== 'idle' ? 'true' : 'false');
      switch (next) {
        case 'idle':
          updateStatus(status, 'Ready.');
          break;
        case 'listening':
          updateStatus(status, 'Listening…');
          break;
        case 'thinking':
          updateStatus(status, 'Processing…');
          break;
        case 'speaking':
          updateStatus(status, 'Speaking…');
          break;
        default:
          updateStatus(status, 'Ready.');
      }
    }

    function stopAudio() {
      if (viz) {
        try {
          viz.cleanup();
        } catch (error) {
          console.warn('Voice viz cleanup failed', error);
        }
      }
      if (mediaStream) {
        try {
          mediaStream.getTracks().forEach(function (track) {
            track.stop();
          });
        } catch (error) {
          console.warn('Stream stop failed', error);
        }
        mediaStream = null;
      }
    }

    function cancelInteraction() {
      if (recognition) {
        recognition.onresult = null;
        recognition.onend = null;
        try {
          recognition.stop();
        } catch (error) {
          console.warn('recognition.stop()', error);
        }
        recognition = null;
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (error) {
          console.warn('speechSynthesis.cancel()', error);
        }
      }
      stopAudio();
      setState('idle');
      transcript.textContent = 'Press to talk.';
      isListening = false;
    }

    function handleTranscript(text) {
      appendLog(log, 'user', text);
      transcript.textContent = text;
      setState('thinking');
      var adapter = createLLMAdapter(settings, basePath, sessionId);
      return adapter
        .respond(text)
        .then(function (reply) {
          if (!reply) {
            throw new Error('Empty response');
          }
          appendLog(log, 'assistant', reply);
          transcript.textContent = reply;
          setState('speaking');
          return speak(reply, settings).finally(function () {
            setState('idle');
          });
        })
        .catch(function (error) {
          console.error('Voice overlay error', error);
          setState('idle');
          transcript.textContent = 'We could not produce a reply. Try again shortly.';
        });
    }

    function beginListening() {
      if (!supportsSTT) {
        fallback.hidden = false;
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        fallback.hidden = false;
        elements.note.textContent = 'Microphone access is unavailable. Use the text prompt instead.';
        return;
      }
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(function (stream) {
          mediaStream = stream;
          if (viz && typeof viz.setup === 'function') {
            viz.setup(stream, function (level) {
              updateVU(container, level);
            });
          }
          startRecognition();
        })
        .catch(function (error) {
          console.error('Microphone error', error);
          fallback.hidden = false;
          elements.note.textContent = 'We could not access the microphone. Use the text prompt below.';
        });
    }

    function startRecognition() {
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        fallback.hidden = false;
        return;
      }
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      recognition.interimResults = true;

      var finalTranscript = '';
      transcript.textContent = 'Listening…';
      setState('listening');
      isListening = true;

      recognition.onresult = function (event) {
        var interim = '';
        for (var i = event.resultIndex; i < event.results.length; i += 1) {
          var item = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += item;
          } else {
            interim += item;
          }
        }
        transcript.textContent = finalTranscript || interim || 'Listening…';
      };

      recognition.onerror = function (event) {
        console.error('Speech recognition error', event.error);
        cancelInteraction();
        fallback.hidden = false;
        elements.note.textContent = 'We could not capture audio. Try again or use the text input.';
      };

      recognition.onend = function () {
        if (!isListening) {
          return;
        }
        isListening = false;
        stopAudio();
        var text = finalTranscript.trim();
        if (!text) {
          setState('idle');
          transcript.textContent = 'Ready.';
          return;
        }
        handleTranscript(text);
      };

      try {
        recognition.start();
      } catch (error) {
        console.error('recognition.start()', error);
        cancelInteraction();
        fallback.hidden = false;
      }
    }

    button.addEventListener('click', function () {
      if (state === 'idle') {
        beginListening();
      } else {
        cancelInteraction();
      }
    });

    button.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        button.click();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state !== 'idle') {
        cancelInteraction();
      }
    });

    createFallbackController(elements, function (text) {
      appendLog(log, 'user', text);
      transcript.textContent = text;
      setState('thinking');
      createLLMAdapter(settings, basePath, sessionId)
        .respond(text)
        .then(function (reply) {
          appendLog(log, 'assistant', reply);
          transcript.textContent = reply;
        })
        .catch(function (error) {
          console.error('Fallback voice overlay error', error);
          transcript.textContent = 'We could not produce a reply right now.';
        })
        .finally(function () {
          setState('idle');
        });
    });

    return {
      element: container,
      destroy: function () {
        cancelInteraction();
        if (container.parentElement) {
          container.parentElement.removeChild(container);
        }
      },
    };
  };
})();

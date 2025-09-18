(function (global) {
  'use strict';

  function WebAudioViz() {
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.rafId = null;
    this.onUpdate = null;
  }

  WebAudioViz.prototype.setup = async function (stream, onUpdate) {
    if (this.audioContext) {
      this.cleanup();
    }
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.onUpdate = onUpdate;
    this.tick();
  };

  WebAudioViz.prototype.tick = function () {
    if (!this.analyser || !this.onUpdate) {
      return;
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i += 1) {
      const value = dataArray[i] - 128;
      sum += Math.abs(value);
    }
    const avg = sum / dataArray.length;
    const level = Math.min(1, avg / 60);
    this.onUpdate(level);
    this.rafId = requestAnimationFrame(this.tick.bind(this));
  };

  WebAudioViz.prototype.cleanup = function () {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (error) {
        console.warn('WebAudioViz disconnect', error);
      }
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.rafId = null;
    this.onUpdate = null;
  };

  global.WebAudioViz = WebAudioViz;
})(window);

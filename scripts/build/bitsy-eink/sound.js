/*
 * Inkventure (story S0.12): no sound, in place of upstream system/soundchip.js, which creates an AudioContext when it
 * loads (and throws where Web Audio is missing). system.js still keeps its sound memory blocks; nothing plays them.
 */
function SoundSystem() {
  this.setPulse = function () {};
  this.setFrequency = function () {};
  this.setVolume = function () {};
  this.mute = function () {};
  this.unmute = function () {};
}

function enableGlobalAudioContext() {}

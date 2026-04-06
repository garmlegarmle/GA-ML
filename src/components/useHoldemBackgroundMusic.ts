import { useEffect } from 'react';

type AudioContextWithWebkit = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

const LOOP_SECONDS = 8;

const PROGRESSION = [
  { bass: 73.42, chord: [293.66, 349.23, 440.0, 523.25] },   // Dm7
  { bass: 98.0, chord: [293.66, 392.0, 493.88, 587.33] },     // G7
  { bass: 65.41, chord: [261.63, 329.63, 392.0, 493.88] },    // Cmaj7
  { bass: 110.0, chord: [277.18, 329.63, 392.0, 523.25] },    // A7sus-ish
];

function scheduleTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  peakGain: number,
  type: OscillatorType,
) {
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;
  filter.type = 'lowpass';
  filter.frequency.value = type === 'triangle' ? 1400 : 900;
  filter.Q.value = 0.4;

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(Math.max(peakGain * 0.55, 0.0001), startTime + duration * 0.55);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}

function scheduleCycle(context: AudioContext, destination: AudioNode, cycleStartTime: number) {
  PROGRESSION.forEach((bar, index) => {
    const barStart = cycleStartTime + index * 2;

    scheduleTone(context, destination, bar.bass, barStart, 0.88, 0.028, 'triangle');
    scheduleTone(context, destination, bar.bass * 2, barStart + 0.96, 0.52, 0.012, 'sine');

    bar.chord.forEach((frequency, voiceIndex) => {
      const delay = voiceIndex * 0.025;
      scheduleTone(context, destination, frequency, barStart + delay, 1.72, 0.008, 'triangle');
      scheduleTone(context, destination, frequency, barStart + 1.08 + delay, 0.58, 0.0045, 'sine');
    });
  });
}

export function useHoldemBackgroundMusic(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    let audioContext: AudioContext | null = null;
    let masterGain: GainNode | null = null;
    let schedulerTimer: number | null = null;
    let nextCycleAt = 0;
    let disposed = false;

    const scheduleAhead = () => {
      if (!audioContext || !masterGain) {
        return;
      }

      while (nextCycleAt < audioContext.currentTime + LOOP_SECONDS) {
        scheduleCycle(audioContext, masterGain, nextCycleAt);
        nextCycleAt += LOOP_SECONDS;
      }
    };

    const ensureStarted = async () => {
      if (disposed) {
        return;
      }

      if (!audioContext) {
        const AudioCtor = window.AudioContext || (window as AudioContextWithWebkit).webkitAudioContext;
        if (!AudioCtor) {
          return;
        }

        audioContext = new AudioCtor();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.06;
        masterGain.connect(audioContext.destination);
        nextCycleAt = audioContext.currentTime + 0.12;
        scheduleAhead();
        schedulerTimer = window.setInterval(scheduleAhead, 2000);
      }

      if (audioContext.state !== 'running') {
        await audioContext.resume().catch(() => undefined);
      }

      scheduleAhead();
    };

    const handleActivation = () => {
      void ensureStarted();
    };

    const handleVisibility = () => {
      if (!audioContext) {
        return;
      }

      if (document.hidden) {
        void audioContext.suspend().catch(() => undefined);
        return;
      }

      void ensureStarted();
    };

    window.addEventListener('pointerdown', handleActivation, { passive: true });
    window.addEventListener('keydown', handleActivation);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      window.removeEventListener('pointerdown', handleActivation);
      window.removeEventListener('keydown', handleActivation);
      document.removeEventListener('visibilitychange', handleVisibility);

      if (schedulerTimer !== null) {
        window.clearInterval(schedulerTimer);
      }

      if (audioContext) {
        void audioContext.close().catch(() => undefined);
      }
    };
  }, [enabled]);
}

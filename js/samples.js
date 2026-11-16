// Sample loading and playback.

export function makeSample(name, buffer, { gain = 0.8, pitch = 0, choke = 0 } = {}) {
  return { name, buffer, gain, pitch, choke };
}

export async function decodeFile(ctx, file) {
  const data = await file.arrayBuffer();
  return ctx.decodeAudioData(data);
}

export function baseName(file) {
  return file.name.replace(/\.[^.]+$/, '').slice(0, 16) || 'sample';
}

// Play `sample` at audio time `time`. Samples sharing a non-zero choke group
// cut each other off, like the 808's open and closed hats.
export function playSample(ctx, dest, sample, time, chokes) {
  if (!sample.buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;
  src.playbackRate.value = Math.pow(2, sample.pitch / 12);
  const g = ctx.createGain();
  g.gain.value = sample.gain;
  src.connect(g).connect(dest);
  src.start(time);

  if (sample.choke) {
    const prev = chokes.get(sample.choke);
    if (prev && prev.time <= time) {
      prev.g.gain.setTargetAtTime(0, time, 0.004);
      try {
        prev.src.stop(time + 0.05);
      } catch {
        // already stopped
      }
    }
    chokes.set(sample.choke, { src, g, time });
  }
}

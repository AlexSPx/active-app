"""Original 120 BPM instrumental and synchronized UI sounds; no sampled music."""
from pathlib import Path
import wave
import numpy as np

RATE = 48000
DURATION = 32
rng = np.random.default_rng(42)
mix = np.zeros((RATE * DURATION, 2), dtype=np.float64)


def add(signal, start, gain=1, pan=0):
    offset = round(start * RATE)
    end = min(len(mix), offset + len(signal))
    if end <= offset:
        return
    signal = signal[:end-offset] * gain
    mix[offset:end, 0] += signal * np.sqrt((1-pan)/2)
    mix[offset:end, 1] += signal * np.sqrt((1+pan)/2)


def tone(midi, duration, kind='pluck'):
    t = np.arange(round(RATE*duration))/RATE
    hz = 440 * 2**((midi-69)/12)
    attack = np.minimum(t/.008, 1)
    if kind == 'pad':
        signal = sum(np.sin(2*np.pi*(hz+detune)*t) for detune in [-.5, 0, .5])/3
        env = np.minimum(t/.2, 1) * np.minimum((duration-t)/.4, 1)
    elif kind == 'bass':
        signal = np.sin(2*np.pi*hz*t) + .22*np.sin(2*np.pi*hz*2*t)
        env = attack * np.exp(-t*7)
    else:
        signal = np.sin(2*np.pi*hz*t) + .25*np.sin(2*np.pi*hz*2*t) + .07*np.sin(2*np.pi*hz*3*t)
        env = attack * np.exp(-t*7) * np.minimum((duration-t)/.03, 1)
    return signal * env


chords = [[48,55,60,63,67], [44,51,56,60,63], [51,58,63,67,70], [46,53,58,62,65]]
for bar in range(16):
    start = bar*2
    chord = chords[(bar//2)%4]
    for index, note in enumerate(chord[1:]):
        add(tone(note, 2.35, 'pad'), start, .055, (index-1.5)/3)
    for step in range(8):
        when = start + step*.25
        note = chord[1+([0,2,1,3,2,1,3,2][step]%4)] + 12
        gain = .095 if start >= 4 else .045
        add(tone(note, .65), when, gain, np.sin(step)*.55)
        add(tone(note,.65),when+.1875,gain*.24,-np.sin(step)*.55)
    for beat in range(4):
        when = start + beat*.5
        t = np.arange(int(RATE*.32))/RATE
        kick = np.sin(2*np.pi*(46*t + 5*(1-np.exp(-t*34))))*np.exp(-t*16)
        add(kick,when,.43 if start>=4 else .22)
        if start>=4:
            add(tone(chord[0]-12,.35,'bass'),when+.25,.24)
        if beat%2:
            t = np.arange(int(RATE*.16))/RATE
            noise = rng.normal(0,1,len(t))
            clap = (noise-np.roll(noise,1))*.4*np.exp(-t*35)
            add(clap,when,.13)
    if start>=4:
        for step in range(8):
            t=np.arange(int(RATE*.075))/RATE
            noise=rng.normal(0,1,len(t))
            hat=(noise-np.roll(noise,1))*np.exp(-t*90)
            add(hat,start+step*.25,.025,(-1)**step*.4)

# Match the checkmarks, timer reveal, and chapter transitions in video.jsx.
for when in [10.5,11.5,12.5]:
    add(tone(87,.22),when,.16,-.1)
    add(tone(94,.3),when+.055,.09,.1)
for when in [4,9,15,21,26]:
    t=np.arange(int(RATE*.38))/RATE
    noise=rng.normal(0,1,len(t))
    smooth=np.convolve(noise,np.ones(15)/15,mode='same')
    env=np.sin(np.pi*t/.38)**2
    add(smooth*env,when-.19,.15)
for i,note in enumerate([72,75,79,84]):
    add(tone(note,1.3),27.2+i*.12,.13,(i-1.5)/3)

time=np.arange(len(mix))/RATE
mix *= (np.minimum(time/.035,1)*np.minimum((DURATION-time)/1.25,1))[:,None]
mix=np.tanh(mix*1.2)
mix *= .88/np.max(np.abs(mix))
assert mix.shape == (1536000,2) and np.all(np.isfinite(mix))
assert np.max(np.abs(mix)) < .9
output=Path(__file__).resolve().parents[1]/'public/soundtrack.wav'
with wave.open(str(output),'wb') as audio:
    audio.setnchannels(2)
    audio.setsampwidth(2)
    audio.setframerate(RATE)
    audio.writeframes((mix*32767).astype('<i2').tobytes())
print(f'Wrote {output}: {DURATION}s, stereo, {RATE}Hz, peak {20*np.log10(np.max(np.abs(mix))):.2f} dBFS')

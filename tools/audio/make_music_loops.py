#!/usr/bin/env python3
"""Build the game's loop-ready BGM files from the original sound bank.

assets/audio/original/music/BGM_*.mp3 are the original cues as decoded from the
IPA (extract_acb.py). Each one starts with HCA_DELAY of codec lead-in (silence)
before the loop, and the manifest gives the loop length. js/audio-manager.js
wants every loop file laid out as

    [last PAD s of the loop] [the loop] [first PAD s of the loop]

so any window of the loop's length loops cleanly, whatever MP3 decoder delay a
browser does or doesn't trim. loopStart is then PAD and loopEnd PAD + length.

Usage: python3 tools/audio/make_music_loops.py   (needs ffmpeg with libmp3lame)
Writes assets/audio/music/<name>.mp3 and prints the MUSIC_TRACKS entries.
"""
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'audio', 'original')
OUT = os.path.join(ROOT, 'assets', 'audio', 'music')
PAD = 0.25
# Lead-in before the first sample of every cue's loop (8064 samples at 44.1 kHz;
# the first note of all twelve cues lands here).
HCA_DELAY = 8064 / 44100

# game track name -> original cue
TRACKS = {
    'title': 'BGM_2_tittle',
    'home': 'BGM_1_menu_home',
    'arena': 'BGM_3_menu_pvp',
    'arena_battle': 'BGM_4_battle_pvp',
    'battle': 'BGM_5_battle_normal',
    'boss': 'BGM_6_battle_boss',
    'summon': 'BGM_7_Gasha',
    'discipline': 'BGM_008_discipline',
    'tension': 'BGM_009_tension',
    'intrigue': 'BGM_010_intrigue',
    'sorrow': 'BGM_011_sorrow',
    'battle_event': 'BGM_012_battle_event',
}


def probe_rate(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
                          'stream=sample_rate,channels', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, check=True).stdout.strip().split(',')
    return int(out[0]), int(out[1])


def main():
    manifest = {e['cue']: e for e in json.load(open(os.path.join(SRC, 'manifest.json')))}
    os.makedirs(OUT, exist_ok=True)
    for name, cue in TRACKS.items():
        entry = manifest[cue]
        path = os.path.join(SRC, entry['file'])
        rate, ch = probe_rate(path)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-'],
                             capture_output=True, check=True).stdout
        pcm = np.frombuffer(raw, np.float32).reshape(-1, ch)
        start = round(HCA_DELAY * rate)
        n = round((entry['loop'][1] - entry['loop'][0]) * rate)
        pad = round(PAD * rate)
        if start + n > len(pcm):
            sys.exit(f'{cue}: loop runs past the end of the file')
        loop = pcm[start:start + n]
        out = np.concatenate([loop[-pad:], loop, loop[:pad]])
        dst = os.path.join(OUT, name + '.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(rate), '-ac', str(ch),
                        '-i', '-', '-c:a', 'libmp3lame', '-q:a', '2', dst],
                       input=out.astype(np.float32).tobytes(), check=True)
        print(f"    {name + ':':14s}{{ file: 'music/{name}.mp3', loopStart: {PAD}, loopEnd: {PAD + n / rate:.4f} }},  // {cue}")


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Extract a CRI ACB/AWB sound bank into named audio files.

    python3 tools/audio/extract_acb.py <bank.acb> <bank.awb> <out_dir> [--format ogg|mp3|wav]

Every cue in the .acb becomes <out_dir>/<group>/<CueName>.<ext>; cues that pick between
several clips (voice variations) get <CueName>__<n>.<ext>. The AWB holds HCA clips, decoded
with ffmpeg (needs an ffmpeg build with the CRI HCA decoder, 4.4+). A manifest.json in
<out_dir> lists every file with its cue, duration and loop points.
"""
import argparse
import json
import os
import struct
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cri_utf import UTF  # noqa: E402


def awb_entries(data):
    """{awb id: bytes} of an AFS2 archive."""
    assert data[:4] == b'AFS2', 'not an AWB (AFS2) archive'
    off_size, id_size = data[5], data[6]
    count, align = struct.unpack_from('<IH', data, 8)
    p = 16
    ids = [int.from_bytes(data[p + i * id_size:p + (i + 1) * id_size], 'little') for i in range(count)]
    p += count * id_size
    offs = [int.from_bytes(data[p + i * off_size:p + (i + 1) * off_size], 'little') for i in range(count + 1)]
    out = {}
    for i, wid in enumerate(ids):
        s = offs[i] + (-offs[i] % align)
        out[wid] = data[s:offs[i + 1]]
    return out


def u16s(blob):
    return list(struct.unpack(f'>{len(blob) // 2}H', blob)) if blob else []


def commands(blob):
    """Track event commands: [(code, payload)]."""
    out, p = [], 0
    while p + 3 <= len(blob):
        code, size = struct.unpack_from('>HB', blob, p)
        out.append((code, blob[p + 3:p + 3 + size]))
        p += 3 + size
        if code == 0:
            break
    return out


def cue_waveforms(h):
    """{cue name: [waveform table index, ...]} following cue -> sequence -> track -> synth -> waveform."""
    names = UTF.sub(h['CueNameTable']).rows
    cues = UTF.sub(h['CueTable']).rows
    seqs = UTF.sub(h['SequenceTable']).rows
    tracks = UTF.sub(h['TrackTable']).rows
    cmds = UTF.sub(h['CommandTable']).rows
    synths = UTF.sub(h['SynthTable']).rows

    def synth_waves(si, depth=0):
        if depth > 8:
            return []
        items = u16s(synths[si]['ReferenceItems'])
        waves = []
        for k in range(0, len(items) - 1, 2):
            typ, idx = items[k], items[k + 1]
            if typ == 1:
                waves.append(idx)
            elif typ == 2:
                waves += synth_waves(idx, depth + 1)
        return waves

    out = {}
    for n in names:
        cue = cues[n['CueIndex']]
        waves = []
        if cue['ReferenceType'] == 3:
            seq = seqs[cue['ReferenceIndex']]
            for ti in u16s(seq['TrackIndex'])[:seq['NumTracks']]:
                ev = tracks[ti]['EventIndex']
                if ev == 0xFFFF:
                    continue
                for code, payload in commands(cmds[ev]['Command']):
                    if code == 0x07D0 and len(payload) >= 4:
                        typ, idx = struct.unpack_from('>HH', payload, 0)
                        if typ == 2:
                            waves += synth_waves(idx)
        elif cue['ReferenceType'] == 1:
            waves.append(cue['ReferenceIndex'])
        elif cue['ReferenceType'] == 2:
            waves += synth_waves(cue['ReferenceIndex'])
        out[n['CueName']] = list(dict.fromkeys(waves))
    return out


def group_of(name):
    low = name.lower()
    if low.startswith('bgm'):
        return 'music'
    if low.startswith('jg'):
        return 'jingles'
    if low.startswith('voice'):
        return 'voice'
    return 'sfx'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('acb')
    ap.add_argument('awb')
    ap.add_argument('out')
    ap.add_argument('--format', default='ogg', choices=['ogg', 'mp3', 'wav'])
    a = ap.parse_args()
    h = UTF(open(a.acb, 'rb').read()).rows[0]
    waves = UTF.sub(h['WaveformTable']).rows
    loops = UTF.sub(h['WaveformExtensionDataTable'])
    loops = loops.rows if loops else []
    clips = awb_entries(open(a.awb, 'rb').read())
    codec = {'ogg': ['-c:a', 'libvorbis', '-q:a', '4'], 'mp3': ['-c:a', 'libmp3lame', '-q:a', '4'], 'wav': []}[a.format]
    manifest, used = [], set()
    with tempfile.TemporaryDirectory() as tmp:
        for cue, widx in sorted(cue_waveforms(h).items()):
            for n, wi in enumerate(widx):
                w = waves[wi]
                awb_id = w['MemoryAwbId'] if w['Streaming'] == 0 else w['StreamAwbId']
                if awb_id not in clips:
                    continue
                used.add(awb_id)
                grp = group_of(cue)
                fname = cue + (f'__{n + 1}' if len(widx) > 1 else '') + '.' + a.format
                dst = os.path.join(a.out, grp, fname)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                src = os.path.join(tmp, f'{awb_id}.hca')
                open(src, 'wb').write(clips[awb_id])
                subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, *codec, dst], check=True)
                entry = {'file': os.path.relpath(dst, a.out), 'cue': cue, 'awbId': awb_id,
                         'seconds': round(w['NumSamples'] / w['SamplingRate'], 3)}
                ext = w.get('ExtensionData')
                if w['LoopFlag'] and isinstance(ext, int) and ext < len(loops):
                    entry['loop'] = [round(loops[ext]['LoopStart'] / w['SamplingRate'], 3),
                                     round(loops[ext]['LoopEnd'] / w['SamplingRate'], 3)]
                manifest.append(entry)
        # clips no cue points at (kept so nothing is lost)
        for awb_id in sorted(set(clips) - used):
            dst = os.path.join(a.out, 'unreferenced', f'clip_{awb_id:04d}.{a.format}')
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            src = os.path.join(tmp, f'{awb_id}.hca')
            open(src, 'wb').write(clips[awb_id])
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, *codec, dst], check=True)
            manifest.append({'file': os.path.relpath(dst, a.out), 'cue': None, 'awbId': awb_id})
    json.dump(manifest, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)
    by = {}
    for e in manifest:
        by[e['file'].split('/')[0]] = by.get(e['file'].split('/')[0], 0) + 1
    print(f'{len(manifest)} files from {len(clips)} clips:', by)


if __name__ == '__main__':
    main()

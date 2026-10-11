"""Minimal reader for CRI @UTF tables (the format of .acb sound-bank headers)."""
import struct

# column storage flags (high nibble) and value types (low nibble)
ZERO, CONST, PERROW = 0x10, 0x30, 0x50


class UTF:
    def __init__(self, data, offset=0):
        b = data[offset:]
        assert b[:4] == b'@UTF', 'not a @UTF table'
        size = struct.unpack_from('>I', b, 4)[0]
        t = b[8:8 + size]
        _, rows_off, str_off, data_off, name_off, ncols, row_w, nrows = struct.unpack_from('>HHIIIHHI', t, 0)
        self._t, self._str, self._data = t, str_off, data_off
        self.name = self._s(name_off)
        cols, p = [], 24
        consts = {}
        for _ in range(ncols):
            flag = t[p]; p += 1
            cname = self._s(struct.unpack_from('>I', t, p)[0]); p += 4
            kind = flag & 0xF0
            if kind == CONST:
                consts[cname], p = self._val(flag & 0x0F, p)
            cols.append((cname, flag))
        self.columns = [c for c, _ in cols]
        self.rows = []
        for r in range(nrows):
            p = rows_off + r * row_w
            row = {}
            for cname, flag in cols:
                kind = flag & 0xF0
                if kind == PERROW:
                    row[cname], p = self._val(flag & 0x0F, p)
                elif kind == CONST:
                    row[cname] = consts[cname]
                else:
                    row[cname] = None
            self.rows.append(row)

    def _s(self, off):
        t = self._t
        a = self._str + off
        return t[a:t.index(b'\0', a)].decode('utf-8', 'replace')

    def _val(self, typ, p):
        t = self._t
        fmt = {0: '>B', 1: '>b', 2: '>H', 3: '>h', 4: '>I', 5: '>i', 6: '>Q', 7: '>q', 8: '>f'}
        if typ in fmt:
            v = struct.unpack_from(fmt[typ], t, p)[0]
            return v, p + struct.calcsize(fmt[typ])
        if typ == 0xA:  # string
            return self._s(struct.unpack_from('>I', t, p)[0]), p + 4
        if typ == 0xB:  # data: offset + size into the data area (often a nested @UTF table)
            off, size = struct.unpack_from('>II', t, p)
            return self._t[self._data + off:self._data + off + size], p + 8
        raise ValueError(f'unknown @UTF value type {typ:#x}')

    @staticmethod
    def sub(blob):
        return UTF(blob) if blob and blob[:4] == b'@UTF' else None

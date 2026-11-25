#!/usr/bin/env python3
"""Minimal, dependency-free zipalign (4-byte alignment for STORED entries).

The upstream ``zipalign`` binary shipped with the Android build-tools needs
``libc++.so``, which is not present in every CI image.  This module implements
the part of zipalign that matters for an APK with no native libraries: every
uncompressed (STORED) entry -- most importantly ``resources.arsc`` -- gets its
file data aligned to a 4 byte boundary by inserting an Android-style padding
extra field (ID 0xd935) into the local file header.

It rewrites the ZIP container only.  Entry order, compression streams, CRCs and
timestamps are preserved, so the result can be fed straight to ``apksigner``.
"""

from __future__ import annotations

import struct
import sys
import zipfile
from pathlib import Path

LOCAL_HEADER = 0x04034B50
CENTRAL_HEADER = 0x02014B50
EOCD = 0x06054B50
PADDING_FIELD_ID = 0xD935
ALIGNMENT = 4


def _dos_datetime(dt: tuple[int, int, int, int, int, int]) -> tuple[int, int]:
    year, month, day, hour, minute, second = dt
    year = max(1980, min(2107, year))
    dos_time = (hour << 11) | (minute << 5) | (second // 2)
    dos_date = ((year - 1980) << 9) | (month << 5) | day
    return dos_time, dos_date


def _padding_extra(needed: int) -> bytes:
    """Return an extra field whose length is `needed` (0 or >= 4)."""
    if needed == 0:
        return b""
    if needed < 4:
        needed += 4  # a field header alone is 4 bytes; add data bytes instead
    data_len = needed - 4
    return struct.pack("<HH", PADDING_FIELD_ID, data_len) + b"\x00" * data_len


def align(src: str | Path, dst: str | Path, alignment: int = ALIGNMENT) -> None:
    src, dst = Path(src), Path(dst)
    raw = src.read_bytes()

    with zipfile.ZipFile(src) as zin:
        infos = zin.infolist()

    out = bytearray()
    central = bytearray()
    count = 0

    for info in infos:
        off = info.header_offset
        if struct.unpack_from("<I", raw, off)[0] != LOCAL_HEADER:
            raise ValueError(f"bad local header for {info.filename}")

        (_, version_needed, local_flags, method, dos_time, dos_date, _crc,
         _comp_size, _uncomp_size, name_len, old_extra_len) = struct.unpack_from(
            "<IHHHHHIIIHH", raw, off
        )
        name = raw[off + 30: off + 30 + name_len]
        data_start = off + 30 + name_len + old_extra_len

        # apktool writes ZIPs with data descriptors (bit 3): the local header
        # carries size/CRC 0 and the real values live in the central directory.
        # We rebuild the local header with the real values and clear bit 3.
        flags = info.flag_bits & ~0x0008
        crc = info.CRC
        comp_size = info.compress_size
        uncomp_size = info.file_size
        data = raw[data_start: data_start + comp_size]
        if len(data) != comp_size:
            raise ValueError(f"truncated entry data for {info.filename}")

        # Keep the original extra fields; only STORED entries need 4-byte data
        # alignment.  Compressed entries do not need it.
        extra = b""
        if method == 0:  # ZIP_STORED
            base = len(out) + 30 + name_len
            remainder = base % alignment
            needed = (alignment - remainder) % alignment
            # A field header is 4 bytes, so a 1..3 byte request becomes 5..7.
            if needed and needed < 4:
                needed += alignment
            extra = _padding_extra(needed)
            if (len(out) + 30 + name_len + len(extra)) % alignment != 0:
                raise AssertionError("alignment computation failed")

        local_off = len(out)
        out += struct.pack(
            "<IHHHHHIIIHH",
            LOCAL_HEADER,
            version_needed,
            flags,
            method,
            dos_time,
            dos_date,
            crc,
            comp_size,
            uncomp_size,
            len(name),
            len(extra),
        )
        out += name
        out += extra
        out += data

        t, d = _dos_datetime(info.date_time)
        central += struct.pack(
            "<IHHHHHHIIIHHHHHII",
            CENTRAL_HEADER,
            info.create_version,
            info.extract_version,
            flags,
            method,
            t,
            d,
            crc,
            comp_size,
            uncomp_size,
            len(name),
            0,  # central-directory extra length
            len(info.comment or b""),
            0,  # disk number start
            info.internal_attr,
            info.external_attr,
            local_off,
        )
        central += name
        central += info.comment or b""
        count += 1

    central_off = len(out)
    out += central
    out += struct.pack(
        "<IHHHHIIH",
        EOCD,
        0,  # disk number
        0,  # disk with central directory
        count,
        count,
        len(central),
        central_off,
        0,  # comment length
    )
    dst.write_bytes(bytes(out))


def report(path: str | Path) -> list[tuple[str, int, int]]:
    """Return (name, method, data_offset % 4) for every entry.

    The offset is derived from the *local* file header: the central-directory
    copy of the extra field is intentionally empty after alignment, so using
    ``ZipInfo.extra`` would give a wrong answer.
    """
    raw = Path(path).read_bytes()
    with zipfile.ZipFile(path) as z:
        result = []
        for i in z.infolist():
            off = i.header_offset
            name_len, extra_len = struct.unpack_from("<HH", raw, off + 26)
            data_off = off + 30 + name_len + extra_len
            result.append((i.filename, i.compress_type, data_off % ALIGNMENT))
        return result


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(f"usage: {sys.argv[0]} <input.apk> <output.apk>")
    align(sys.argv[1], sys.argv[2])
    for name, method, mod in report(sys.argv[2]):
        if method == 0:
            print(f"{name}: stored, data offset mod 4 = {mod}")

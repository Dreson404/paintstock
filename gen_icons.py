#!/usr/bin/env python3
"""Generate maskable PWA icons (192 + 512) with a painted-bucket look.
Pure stdlib, no deps. Light on memory."""
import struct, zlib, math

def crc32(data):
    return zlib.crc32(data) & 0xffffffff

def png_chunk(tag, data):
    chunk = tag + data
    return struct.pack(">I", len(data)) + chunk + struct.pack(">I", crc32(chunk))

def make_png(path, size):
    # background gradient (deep green) + a paint bucket + drip
    bg_top = (31, 111, 84)      # primary green
    bg_bot = (15, 20, 18)       # dark
    bucket = (232, 226, 208)    # off-white
    paint   = (46, 157, 118)    # bright green
    paint2  = (224, 179, 65)    # amber drip for contrast

    raw = bytearray()
    cx = size / 2.0
    # bucket geometry
    bw = size * 0.42            # bucket width
    bh = size * 0.40            # bucket height
    bx = cx - bw / 2.0
    by = cx - bh / 2.0 + size * 0.02
    # handle arc center
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # base gradient
            t = y / (size - 1)
            r = bg_top[0] + (bg_bot[0] - bg_top[0]) * t
            g = bg_top[1] + (bg_bot[1] - bg_top[1]) * t
            b = bg_top[2] + (bg_bot[2] - bg_top[2]) * t
            # rounded safe-area: maskable -> keep design inside central 80%
            # bucket body
            if bx <= x <= bx + bw and by <= y <= by + bh:
                # slight shading left->right
                sh = (x - bx) / bw
                r = bucket[0] * (0.85 + 0.15 * (1 - sh))
                g = bucket[1] * (0.85 + 0.15 * (1 - sh))
                b = bucket[2] * (0.85 + 0.15 * (1 - sh))
                # paint lip at top of bucket
                if by <= y <= by + bh * 0.18:
                    r, g, b = paint
                # rounded bottom corners
                corner = size * 0.10
                if y > by + bh - corner and x < bx + corner:
                    if (x - (bx + corner)) ** 2 + (y - (by + bh - corner)) ** 2 > corner ** 2:
                        r, g, b = bg_top[0] + (bg_bot[0]-bg_top[0])*t, bg_top[1] + (bg_bot[1]-bg_top[1])*t, bg_top[2] + (bg_bot[2]-bg_top[2])*t
                if y > by + bh - corner and x > bx + bw - corner:
                    if (x - (bx + bw - corner)) ** 2 + (y - (by + bh - corner)) ** 2 > corner ** 2:
                        r, g, b = bg_top[0] + (bg_bot[0]-bg_top[0])*t, bg_top[1] + (bg_bot[1]-bg_top[1])*t, bg_top[2] + (bg_bot[2]-bg_top[2])*t
            # handle (arc above bucket)
            hcy = by - size * 0.06
            hcx = cx
            hr = bw * 0.62
            if size * 0.012 < math.hypot(x - hcx, y - hcy) < hr and y < hcy:
                # only the top arc of the circle
                if y < hcy - hr * 0.35:
                    r, g, b = bucket
            # paint drip from lip
            drip_x = bx + bw * 0.66
            if by + bh * 0.18 < y < by + bh * 0.18 + bh * 0.5 and abs(x - drip_x) < size * 0.018 + (0 if y < by+bh*0.5 else 0):
                if abs(x - drip_x) < size * 0.018:
                    r, g, b = paint2
            # drip drop at bottom
            drop_cx = drip_x
            drop_cy = by + bh * 0.18 + bh * 0.5 + size * 0.02
            if math.hypot(x - drop_cx, y - drop_cy) < size * 0.03:
                r, g, b = paint2

            row.extend([int(max(0, min(255, r))), int(max(0, min(255, g))), int(max(0, min(255, b)))])
        # add filter byte (no filter) per row
        raw.append(0)
        raw.extend(row)

    # build PNG
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit, RGB
    idat = zlib.compress(bytes(raw), 9)
    png = sig + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", idat) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, size, "x", size)

make_png("icon-192.png", 192)
make_png("icon-512.png", 512)

"""Premium framing for the deck's product shots: slim graphite phone with a soft shadow, and rounded
screenshots with a hairline and a soft shadow. Shadows are baked in so they survive Google Slides."""
import os
from PIL import Image, ImageDraw, ImageFilter

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'img')


def rounded(im, r):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=r, fill=255)
    return m


def with_shadow(card, pad, blur, offset, alpha):
    """Places an RGBA card on a transparent canvas with a soft drop shadow underneath."""
    W, H = card.width + pad * 2, card.height + pad * 2
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sh = Image.new('L', (W, H), 0)
    a = card.split()[3]
    sh.paste(a.point(lambda v: int(v * alpha)), (pad, pad + offset))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    shadow = Image.new('RGBA', (W, H), (21, 32, 26, 255))
    shadow.putalpha(sh)
    out.alpha_composite(shadow)
    out.alpha_composite(card, (pad, pad))
    return out


def phone(src, dst, shadow=True, crop_bottom=0.0):
    scr = Image.open(os.path.join(D, src)).convert('RGB')          # 780 x 1632
    bez, r_out, r_in = 26, 118, 94
    W, H = scr.width + bez * 2, scr.height + bez * 2
    body = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=r_out, fill=(27, 31, 29, 255))
    d.rounded_rectangle([1, 1, W - 2, H - 2], radius=r_out - 1, outline=(70, 78, 73, 255), width=2)   # thin rim
    body.paste(scr, (bez, bez), rounded(scr, r_in))
    out = with_shadow(body, 90, 46, 34, 0.42) if shadow else body
    if crop_bottom:
        out = out.crop((0, 0, out.width, int(out.height * (1 - crop_bottom))))
    out.save(os.path.join(D, dst))
    return out.size


def screen(src, dst, r=22):
    im = Image.open(os.path.join(D, src)).convert('RGB')
    card = Image.new('RGBA', im.size, (0, 0, 0, 0))
    card.paste(im, (0, 0), rounded(im, r))
    ImageDraw.Draw(card).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=r, outline=(217, 211, 199, 255), width=2)
    out = with_shadow(card, 70, 38, 26, 0.30)
    out.save(os.path.join(D, dst))
    return out.size


print('phone', phone('phone-raw.png', 'phone.png'))
print('cover', phone('phone-raw.png', 'cover-phone.png', shadow=False, crop_bottom=0.14))
print('present', screen('present.png', 'present-framed.png'))
print('impact', screen('impact.png', 'impact-framed.png', r=18))

"""Puts the raw phone screenshot in a plain device outline. Output size follows the screenshot, no cropping."""
import os
from PIL import Image, ImageDraw
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'img')
raw = Image.open(os.path.join(D, 'phone-raw.png')).convert('RGB')
bez, outer_r, inner_r = 28, 96, 70
inner = raw.resize((1064, round(raw.height * 1064 / raw.width)), Image.LANCZOS)
W, H = inner.width + 2 * bez, inner.height + 2 * bez
out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(out).rounded_rectangle([0, 0, W - 1, H - 1], radius=outer_r, fill=(255, 255, 255, 255), outline=(185, 194, 188, 255), width=4)
mask = Image.new('L', inner.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, inner.width - 1, inner.height - 1], radius=inner_r, fill=255)
out.paste(inner, (bez, bez), mask)
ImageDraw.Draw(out).rounded_rectangle([bez, bez, bez + inner.width - 1, bez + inner.height - 1], radius=inner_r, outline=(213, 219, 215, 255), width=2)
out.save(os.path.join(D, 'phone.png'))
print('phone.png', out.size)

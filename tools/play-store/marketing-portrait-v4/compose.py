from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import hashlib, json, math, zipfile

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'slides'
OUT.mkdir(exist_ok=True)
FONT = ROOT / 'fonts/DM-Sans-SemiBold.ttf'
SLIDES = [
 ('01-start.png','light/01-home.png','Make every\nworkout count.',True,True),
 ('02-log.png','light/02-workout-session.png','Log every set\nas you go.',False,False),
 ('03-progress.png','light/03-progress.png','See how far\nyou’ve come.',False,False),
 ('04-history.png','dark/04-history.png','Every session\nadds up.',True,False),
 ('05-details.png','light/05-session-detail.png','Your work,\nin detail.',False,False),
 ('06-workouts.png','dark/06-workouts.png','Workouts ready\nwhen you are.',True,False),
 ('07-routine.png','light/07-routine.png','Build a rhythm\nthat lasts.',False,False),
 ('08-exercises.png','dark/08-exercises.png','Find your next\nexercise.',True,False),
]

def background(dark, index):
    # Render at quarter size, then upscale for smooth gradients and curves.
    w, h = 270, 600
    im = Image.new('RGB', (w, h)); pixels = im.load()
    shift = (index % 4 - 1.5) * 18
    for y in range(h):
        for x in range(w):
            glow = math.exp(-(((x - (135 + shift))/125)**2 + ((y - 355)/190)**2))
            edge = math.exp(-(((x - (260 if index % 2 else 5))/120)**2 + ((y - 510)/165)**2))
            top = math.exp(-(((x - 210)/190)**2 + ((y - 60)/170)**2))
            if dark:
                pixels[x,y] = (int(30 + 28*glow + 13*edge + 4*top), int(19 + 15*glow + 5*edge + 3*top), int(42 + 37*glow + 23*edge + 8*top))
            else:
                pixels[x,y] = (int(242 - 11*y/h - 9*glow - 5*edge), int(235 - 14*y/h - 12*glow - 6*edge), int(247 - 5*y/h + 1*glow + 2*edge))
    im = im.resize((1080, 2400), Image.Resampling.BICUBIC).convert('RGBA')
    layer = Image.new('RGBA', im.size); draw = ImageDraw.Draw(layer)
    # Flow across the lower half; the phone covers the center of each sweep.
    flip = index % 2 == 1
    offset = (index % 4 - 1) * 13
    def curve(points, color, width):
        if flip:
            points = [(w-x, y) for x,y in points]
        points = [(x, y + offset) for x,y in points]
        path = []
        for t in range(401):
            u = t / 400
            path.append(tuple(round(4*((1-u)**3*points[0][j] + 3*(1-u)**2*u*points[1][j] + 3*(1-u)*u*u*points[2][j] + u**3*points[3][j])) for j in (0,1)))
        draw.line(path, fill=color, width=width*4, joint='curve')
        return path
    if dark:
        broad = (157, 103, 194, 55); ribbon = (183, 126, 215, 90); fine = (215, 171, 237, 125)
    else:
        broad = (154, 105, 185, 43); ribbon = (147, 92, 177, 65); fine = (124, 76, 153, 100)
    curve([(-45, 340), (65, 430), (150, 505), (320, 365)], broad, 38)
    curve([(-35, 385), (65, 475), (165, 520), (310, 405)], ribbon, 14)
    curve([(-40, 399), (60, 489), (175, 533), (310, 419)], fine, 2)
    if index in (0, 2, 5, 7):
        path = curve([(-35, 355), (55, 430), (170, 490), (310, 380)], (238, 139, 69, 165), 2)
        x, y = path[32 if flip else 360]
        draw.ellipse((x-12, y-12, x+12, y+12), fill=(246, 154, 79, 210))
    return Image.alpha_composite(im, layer).convert('RGB')

for index,(name,source,headline,dark,brand) in enumerate(SLIDES):
    canvas=background(dark,index); d=ImageDraw.Draw(canvas)
    fg='#fbf7ff' if dark else '#2d2035'
    if brand:
        logo=Image.open(ROOT/'logo.png').convert('RGBA').resize((78,78),Image.Resampling.LANCZOS)
        canvas.paste(logo,(356,75),logo)
        d.text((451,91),'Active Next',font=ImageFont.truetype(FONT,48),fill=fg)
    font=ImageFont.truetype(FONT,92)
    bbox=d.multiline_textbbox((0,0),headline,font=font,spacing=2,align='center')
    assert bbox[2]-bbox[0] < 1000
    d.multiline_text(((1080-(bbox[2]-bbox[0]))//2,190 if brand else 135),headline,font=font,fill=fg,align='center',spacing=2)
    sw,sh=756,1680; x,y=(1080-sw)//2,650
    shadow=Image.new('RGBA',canvas.size); sd=ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x-17,y-9,x+sw+17,y+sh+24),radius=55,fill=(12,5,18,110))
    shadow=shadow.filter(ImageFilter.GaussianBlur(25)); canvas=Image.alpha_composite(canvas.convert('RGBA'),shadow).convert('RGB')
    d=ImageDraw.Draw(canvas)
    d.rounded_rectangle((x-14,y-14,x+sw+14,y+sh+14),radius=52,fill='#19141e',outline='#85778c',width=3)
    d.rounded_rectangle((x-7,y-7,x+sw+7,y+sh+7),radius=45,fill='#08070a')
    screen=Image.open(ROOT/'sources'/source).convert('RGB')
    assert screen.size == (1080,2400)
    screen=screen.resize((sw,sh),Image.Resampling.LANCZOS)
    mask=Image.new('L',(sw,sh)); ImageDraw.Draw(mask).rounded_rectangle((0,0,sw-1,sh-1),radius=34,fill=255)
    canvas.paste(screen,(x,y),mask)
    canvas.save(OUT/name,optimize=True)

sheet=Image.new('RGB',(4*216+5*18,2*480+3*18),'#f5f1f7')
for i,(name,*_) in enumerate(SLIDES):
    thumb=Image.open(OUT/name).resize((216,480),Image.Resampling.LANCZOS)
    sheet.paste(thumb,(18+(i%4)*234,18+(i//4)*498))
sheet.save(ROOT/'contact-sheet.png',optimize=True)
with zipfile.ZipFile(ROOT/'active-next-portrait-v4.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,*_ in SLIDES: z.write(OUT/name,name)
manifest={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'sources').rglob('*.png'))}
(ROOT/'source-sha256.json').write_text(json.dumps(manifest,indent=2)+'\n')

"""Contact sheets for actual GLB review frames; does not grant visual approval."""
import argparse,json,math
from pathlib import Path
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('root',type=Path);a=p.parse_args()
e=json.loads((a.root/'evidence.json').read_text(encoding='utf-8'))
for group in ['turntable','high','low-contact','top']:
    frames=[f for f in e['frames'] if f['group']==group]
    batch=24 if group=='turntable' else 8
    for start in range(0,len(frames),batch):
        subset=frames[start:start+batch];cols=min(6 if group=='turntable' else 4,len(subset));size=256 if group=='turntable' else 384
        board=Image.new('RGB',(cols*size,math.ceil(len(subset)/cols)*(size+24)),(217,234,247));draw=ImageDraw.Draw(board)
        for k,f in enumerate(subset):
            im=Image.open(f['file']).convert('RGB');im.thumbnail((size,size))
            x=(k%cols)*size;y=(k//cols)*(size+24)
            board.paste(im,(x,y+24));draw.text((x+6,y+4),f"{f['yaw_degrees']:.0f} deg",fill=(25,48,70))
        board.save(a.root/f'{group}-{start:03d}-board.png')
print(str(a.root))

"""Extract the front body contours from the canonical v5 alpha.

The low right part of the source contains the tail, so the right body edge
there is inferred from the left body edge around the v5 torso center.
"""
import json
from pathlib import Path
import argparse
import numpy as np
from PIL import Image

parser=argparse.ArgumentParser(description='Extract NAVA v5 front contour for the editable turntable model')
parser.add_argument('--repo',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
args=parser.parse_args()
root=args.out.resolve();root.mkdir(parents=True,exist_ok=True)
im = Image.open(args.repo.resolve()/'src/assets/figma/home-option2/home-mascot-v5.png').convert('RGBA').resize((512,512),Image.Resampling.LANCZOS)
a = np.asarray(im)[:,:,3]
rows=[]
for y in range(512):
    x=np.flatnonzero(a[y]>127)
    if len(x):
        left=int(x.min())
        right=int(x.max()) if y<350 else 2*232-left
        rows.append([y,left,right])
(root/'source-body-contour.json').write_text(json.dumps(rows,separators=(',',':')), encoding='utf-8')
print('saved',len(rows),'rows')
